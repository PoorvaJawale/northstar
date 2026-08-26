"""
FastAPI application — Phase 4.1.

Endpoints:
  GET  /api/health           -> status + whether running in MOCK mode
  GET  /api/registry         -> the live tool registry (for the UI + demo)
  POST /api/query            -> image(s) + text query -> answer + evidence + trace
  GET  /api/report/{id}      -> download the HTML evidence report
  GET  /                     -> serves the frontend

Run:  uvicorn backend.main:app --reload
"""
from __future__ import annotations
import shutil
import uuid
from pathlib import Path

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles

from . import config
from .agent.controller import Controller
from .agent.registry import Registry
from .geo.io import read_image
from .report.builder import build_html_report

app = FastAPI(title="SatQuery AI", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=config.CORS_ORIGINS,
                   allow_methods=["*"], allow_headers=["*"])

_registry = Registry()
_controller = Controller(_registry)


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


@app.post("/api/query")
async def query(text: str = Form(...), images: list[UploadFile] = File(...)):
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

    resp = _controller.run(text, metas, arrays)
    if resp.ok:
        resp.report_id = build_html_report(resp)
    return resp.model_dump()


@app.get("/api/report/{report_id}")
def report(report_id: str):
    path = Path(config.REPORT_DIR) / f"{report_id}.html"
    if not path.exists():
        raise HTTPException(404, "Report not found")
    return FileResponse(path, media_type="text/html", filename=f"satquery_{report_id}.html")


# ---- serve the frontend (static single-page app) ------------------------
_FRONTEND = Path(__file__).resolve().parent.parent / "frontend"
if _FRONTEND.exists():
    app.mount("/app", StaticFiles(directory=str(_FRONTEND), html=True), name="app")


@app.get("/", response_class=HTMLResponse)
def root():
    index = _FRONTEND / "index.html"
    if index.exists():
        return HTMLResponse(index.read_text(encoding="utf-8"))
    return HTMLResponse("<h1>SatQuery AI backend is running.</h1>"
                        "<p>See /docs for the API.</p>")
