"""
FastAPI application — Phase 4.1.

Endpoints:
  GET  /api/health           -> status + whether running in MOCK mode
  GET  /api/registry         -> the live tool registry (for the UI + demo)
  POST /api/query            -> image(s) + text query -> answer + evidence + trace
  POST /api/query/stream     -> same, as a live SSE feed of what the agent is doing
  GET  /api/report/{id}      -> download the HTML evidence report
  GET  /api/report/{id}/pdf  -> download the same report as a PDF
  GET  /                     -> serves the frontend

Run:  uvicorn backend.main:app --reload
"""
from __future__ import annotations
import asyncio
import json
import shutil
import threading
import traceback
import uuid
from pathlib import Path
from typing import Any, AsyncIterator

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import config
from .agent.controller import Controller
from .agent.registry import Registry
from .geo.io import read_image
from .report.builder import build_report
from .schemas import TraceStep

app = FastAPI(title="SatQuery AI", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=config.CORS_ORIGINS,
                   allow_methods=["*"], allow_headers=["*"])

_registry = Registry()
_controller = Controller(_registry)

# Only ONE model inference runs at a time (GeoChat fills ~5.9GB of 6GB). Model
# endpoints are sync `def` so FastAPI runs them in its threadpool: the event loop
# (and fast endpoints like /api/registry, /api/health, /api/session) stay
# responsive while an inference holds this lock — so the UI never shows "0 online"
# just because a GeoChat query is running.
_MODEL_LOCK = threading.Lock()


@app.get("/api/health")
def health():
    return {"status": "ok", "mock_mode": config.MOCK_MODE,
            "llm_intent": config.USE_LLM_INTENT,
            "tools": list(_registry.specs.keys())}


@app.get("/api/registry")
def registry():
    """Expose the live registry — used for the 'add a model live' demo moment."""
    return {"tools": [
        {"name": s.name, "tasks": s.tasks, "input_type": s.input_type,
         "modalities": s.modalities, "allowed_params": list(s.allowed_params),
         "outputs": s.outputs}
        for s in _registry.specs.values()]}


@app.post("/api/reload-registry")
def reload_registry():
    """Re-read registry.yaml at runtime (demo: add a YAML block, hit this)."""
    _registry.load()
    return {"reloaded": True, "tools": list(_registry.specs.keys())}


def _ingest(images: list[UploadFile]):
    """Validate + persist the uploads and decode them. Shared by both query
    endpoints so the blocking and streaming paths behave identically."""
    if not images:
        raise HTTPException(400, "At least one image is required.")
    if len(images) > 2:
        raise HTTPException(400, "Provide 1 image, or 2 for a pair.")

    session = Path(config.UPLOAD_DIR) / uuid.uuid4().hex[:10]
    session.mkdir(parents=True, exist_ok=True)
    metas, arrays = [], []
    try:
        for up in images:
            dest = session / up.filename
            with dest.open("wb") as f:
                shutil.copyfileobj(up.file, f)
            meta, arr = read_image(dest)
            metas.append(meta)
            arrays.append(arr)
    except Exception as e:
        raise HTTPException(400, f"Failed to read image: {e}")
    return metas, arrays


def _attach_report(resp) -> None:
    """Render the evidence report onto a finished response. A report failure is
    logged and swallowed: the answer the user waited for is worth far more than
    the attachment, and losing it would look like the whole run failed."""
    if not resp.ok:
        return
    resp.trace.append(TraceStep(stage="report",
        detail="rendered the HTML and PDF evidence report",
        data={"formats": ["html", "pdf"]}))
    try:
        resp.report_id = build_report(resp)
    except Exception:
        traceback.print_exc()
        resp.trace[-1] = TraceStep(stage="report",
            detail="the evidence report could not be rendered",
            data={"error": "see the server log"})


@app.post("/api/query")
def query(text: str = Form(...), images: list[UploadFile] = File(...)):
    metas, arrays = _ingest(images)
    with _MODEL_LOCK:
        resp = _controller.run(text, metas, arrays)
    _attach_report(resp)
    return resp.model_dump()


# ---- conversational chat: upload the scene once, ask follow-ups on it -------
# In-memory sessions: the decoded image(s) are cached so follow-up questions
# skip re-uploading/re-decoding. Each message runs the same agent controller on
# the cached scene, so any turn can be VQA, grounding, change, etc.
_SESSIONS: dict[str, dict] = {}
_SESSION_ORDER: list[str] = []
_SESSION_CAP = 24


def _remember_session(sid: str, data: dict) -> None:
    _SESSIONS[sid] = data
    _SESSION_ORDER.append(sid)
    while len(_SESSION_ORDER) > _SESSION_CAP:
        _SESSIONS.pop(_SESSION_ORDER.pop(0), None)


class ChatIn(BaseModel):
    session_id: str
    message: str


class SuggestIn(BaseModel):
    session_id: str


class PlanIn(BaseModel):
    session_id: str
    message: str


@app.post("/api/session")
def create_session(images: list[UploadFile] = File(...)):
    """Upload the scene once; returns a session_id used for follow-up chat."""
    metas, arrays = _ingest(images)
    sid = uuid.uuid4().hex[:12]
    _remember_session(sid, {"metas": metas, "arrays": arrays, "history": []})
    return {"session_id": sid, "n_images": len(arrays)}


@app.post("/api/plan")
def plan(body: PlanIn):
    """Analysis Plan Preview: what the agent WOULD do for this question — the
    detected task, chosen tool, pipeline steps and inputs — WITHOUT running the
    model. Fast (no GPU): lets the UI show the plan before executing."""
    sess = _SESSIONS.get(body.session_id)
    if sess is None:
        raise HTTPException(404, "Session not found or expired — please re-upload the image.")
    text = (body.message or "").strip()
    if not text:
        raise HTTPException(400, "Empty message.")
    return _controller.plan(text, sess["metas"]).model_dump()


@app.get("/api/benchmark")
def benchmark():
    """Measured model numbers for the 'benchmark table' UI. Reads a JSON file so
    the team can paste in Kaggle before/after eval numbers without a code change."""
    bpath = config.ROOT / "backend" / "benchmark.json"
    try:
        return json.loads(bpath.read_text(encoding="utf-8"))
    except Exception:
        return {"note": "no benchmark data yet", "fine_tune": {}, "models": []}


@app.post("/api/chat")
def chat(body: ChatIn):
    """A follow-up question on an existing session's scene."""
    sess = _SESSIONS.get(body.session_id)
    if sess is None:
        raise HTTPException(404, "Session not found or expired — please re-upload the image.")
    text = (body.message or "").strip()
    if not text:
        raise HTTPException(400, "Empty message.")
    with _MODEL_LOCK:
        resp = _controller.run(text, sess["metas"], sess["arrays"])
    _attach_report(resp)
    sess["history"].append({"q": text, "a": resp.answer})
    out = resp.model_dump()
    out["session_id"] = body.session_id
    return out


_DEFAULT_SUGGESTIONS = [
    "Describe the land cover and major objects.",
    "Predict flood risk and disaster impact from this SAR/optical scene.",
    "Is there a water body in this image?",
    "Is this a rural or an urban area?",
    "Highlight the buildings.",
]


def _questions_from_caption(caption: str, two_images: bool) -> list[str]:
    """Turn a scene caption into a few image-specific starter questions —
    lightweight keyword rules, no extra model call."""
    c = (caption or "").lower()
    qs = ["Describe the land cover and major objects."]
    def add(q):
        if q not in qs:
            qs.append(q)
    if any(w in c for w in ("water", "river", "lake", "coast", "sea", "pond", "reservoir")):
        add("Highlight the water body.")
        add("Predict flood risk and disaster impact from this scene.")
    if any(w in c for w in ("build", "urban", "city", "settlement", "house")):
        add("Highlight the buildings.")
    if any(w in c for w in ("road", "highway", "street")):
        add("Where are the roads in this image?")
    if any(w in c for w in ("forest", "vegetation", "tree", "crop", "field", "farm", "green", "agricultur")):
        add("Is there significant vegetation or cropland?")
    if any(w in c for w in ("build", "urban", "road", "water")):
        add("Is this a rural or an urban area?")
    if two_images:
        add("What changed between these two images and where?")
    for d in _DEFAULT_SUGGESTIONS:
        if len(qs) >= 4:
            break
        add(d)
    return qs[:4]


@app.post("/api/suggest")
def suggest(body: SuggestIn):
    """Suggest image-specific questions after upload (captions the first scene)."""
    sess = _SESSIONS.get(body.session_id)
    if sess is None:
        raise HTTPException(404, "Session not found.")
    two = len(sess["arrays"]) > 1
    try:
        with _MODEL_LOCK:
            cap = _controller.run("Describe the land cover and major objects in this image.",
                                  sess["metas"][:1], sess["arrays"][:1])
        return {"suggestions": _questions_from_caption(cap.answer, two)}
    except Exception:
        traceback.print_exc()
        base = list(_DEFAULT_SUGGESTIONS)
        if two:
            base.insert(0, "What changed between these two images and where?")
        return {"suggestions": base[:4]}


# ---- live SSE feed of the agent's execution ------------------------------
def _sse(event: dict[str, Any]) -> str:
    return f"data: {json.dumps(event)}\n\n"


def _pipeline_events(text: str, metas, arrays):
    """The controller's events, with the report build tacked on the end.
    Runs on a worker thread (see `_stream_events`) — it is fully blocking."""
    for event in _controller.stream(text, metas, arrays):
        if event["type"] != "result":
            yield event
            continue
        resp = event["response"]
        if resp.ok:
            yield {"type": "stage", "stage": "report", "status": "start",
                   "label": "Building the evidence report"}
            _attach_report(resp)
            yield {"type": "stage", "stage": "report", "status": "done",
                   "step": {"stage": "report",
                            "detail": "evidence report ready" if resp.report_id
                                      else "the evidence report could not be rendered",
                            "data": {"report_id": resp.report_id,
                                     "formats": _report_formats(resp.report_id)
                                                if resp.report_id else []}}}
        yield {"type": "result", "response": resp.model_dump()}


async def _stream_events(text: str, metas, arrays) -> AsyncIterator[str]:
    """Drain the blocking pipeline from a worker thread so the event loop stays
    free to flush each frame the moment it is produced."""
    loop = asyncio.get_running_loop()
    channel: asyncio.Queue = asyncio.Queue()
    _END = object()

    def work() -> None:
        try:
            for event in _pipeline_events(text, metas, arrays):
                loop.call_soon_threadsafe(channel.put_nowait, event)
        except Exception as e:                       # never leave the UI hanging
            traceback.print_exc()                    # the console gets the detail
            loop.call_soon_threadsafe(channel.put_nowait, {
                "type": "error", "message": f"{e.__class__.__name__}: {e}"})
        finally:
            loop.call_soon_threadsafe(channel.put_nowait, _END)

    threading.Thread(target=work, name="satquery-pipeline", daemon=True).start()

    yield _sse({"type": "open", "message": "Agent started"})
    while True:
        try:
            event = await asyncio.wait_for(channel.get(), timeout=10)
        except asyncio.TimeoutError:
            yield ": keep-alive\n\n"     # long model load: hold the connection
            continue
        if event is _END:
            break
        yield _sse(event)
    yield _sse({"type": "done"})


@app.post("/api/query/stream")
async def query_stream(text: str = Form(...), images: list[UploadFile] = File(...)):
    """Same contract as /api/query, delivered as Server-Sent Events: one frame
    per stage boundary plus the tool's own progress, then the final result."""
    metas, arrays = _ingest(images)
    return StreamingResponse(
        _stream_events(text, metas, arrays),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache, no-transform",
                 "Connection": "keep-alive",
                 "X-Accel-Buffering": "no"},
    )


_REPORT_TYPES = {"html": "text/html", "pdf": "application/pdf"}


def _report_formats(report_id: str) -> list[str]:
    """Which artifacts actually exist on disk for this report."""
    return [ext for ext in _REPORT_TYPES
            if (Path(config.REPORT_DIR) / f"{report_id}.{ext}").exists()]


def _send_report(report_id: str, ext: str, download: bool) -> FileResponse:
    if "/" in report_id or "\\" in report_id or "." in report_id:
        raise HTTPException(400, "Bad report id")
    path = Path(config.REPORT_DIR) / f"{report_id}.{ext}"
    if not path.exists():
        raise HTTPException(404, f"No {ext.upper()} report for {report_id}")
    if download:
        return FileResponse(path, media_type=_REPORT_TYPES[ext],
                            filename=f"satquery_{report_id}.{ext}")
    # inline: let the browser render it in a tab instead of downloading
    return FileResponse(path, media_type=_REPORT_TYPES[ext])


@app.get("/api/report/{report_id}")
def report(report_id: str, download: bool = False):
    return _send_report(report_id, "html", download)


@app.get("/api/report/{report_id}/pdf")
def report_pdf(report_id: str, download: bool = True):
    return _send_report(report_id, "pdf", download)


# ---- serve the frontend (static single-page app) ------------------------
_FRONTEND = Path(__file__).resolve().parent.parent / "frontend"
if _FRONTEND.exists():
    app.mount("/app", StaticFiles(directory=str(_FRONTEND), html=True), name="app")


@app.get("/space-bg.jpg")
def space_bg():
    path = _FRONTEND / "public" / "space-bg.jpg"
    if not path.exists():
        raise HTTPException(404, "Background image not found")
    return FileResponse(path, media_type="image/jpeg")


@app.get("/", response_class=HTMLResponse)
def root():
    index = _FRONTEND / "index.html"
    if index.exists():
        return HTMLResponse(index.read_text(encoding="utf-8"))
    return HTMLResponse("<h1>SatQuery AI backend is running.</h1>"
                        "<p>See /docs for the API.</p>")
