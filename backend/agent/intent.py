"""
Phase 3.2 — Intent parser (the controller brain).

REAL path: sends the query + the list of available tasks to a local LLM
(Ollama) and asks it to CLASSIFY the task, returning strict JSON. This is the
"not hardcoded" requirement — an unseen phrasing still routes correctly.

DEV fallback: if no LLM is reachable (e.g. MOCK mode, no Ollama), a lightweight
similarity classifier is used so the app still runs. It is clearly flagged in
the trace as `fallback` so you never mistake it for the real router.
"""
from __future__ import annotations
import json
import re
import urllib.request
import urllib.error

from .. import config
from ..schemas import Task, InputType

VALID_TASKS: list[Task] = [
    "single_vqa", "single_caption", "single_grounding",
    "change_vqa", "change_map", "cross_modal", "disaster_risk",
]

# Which tasks are even possible for a given input type (constrains the LLM).
# Pair inputs ALSO allow the single-image tasks: a user who uploaded two images
# can still ask a single-image question ("describe this", "where are the roads")
# — the controller then answers on one image instead of forcing change/fusion.
# The change/fusion task is listed first so it stays the default when the query
# is ambiguous, but any single-image intent in the query routes correctly.
TASKS_BY_INPUT: dict[InputType, list[Task]] = {
    "single_image": ["disaster_risk", "single_vqa", "single_caption", "single_grounding"],
    "bitemporal_pair": ["change_vqa", "change_map",
                        "disaster_risk", "single_vqa", "single_caption", "single_grounding"],
    "optical_sar_pair": ["cross_modal",
                        "disaster_risk", "single_vqa", "single_caption", "single_grounding"],
    "unknown": [],
}

_SYSTEM = (
    "You are a task router for a remote-sensing image assistant. "
    "Choose EXACTLY ONE task from the ALLOWED list for the user's query.\n"
    "Task meanings:\n"
    "- single_grounding: the user wants a specific object or region LOCATED / MARKED on the "
    "image. Verbs: highlight, mark, locate, outline, circle, pinpoint, point to, show where, "
    "where is/are, find the <object>, box/segment the <object>.\n"
    "- single_caption: the user wants a general DESCRIPTION of the whole scene "
    "(describe, summarise, what does this image show).\n"
    "- single_vqa: a specific factual QUESTION about the image "
    "(is there..., how many..., what is the..., yes/no).\n"
    "- change_vqa / change_map: what changed between two dated images.\n"
    "- cross_modal: combine the optical and SAR images.\n"
    "- disaster_risk: disaster management, flood/cyclone/landslide/wildfire risk, "
    "prediction, weather impact, rescue or damage assessment.\n"
    "If the query names an object to point out or mark, prefer single_grounding over "
    "single_caption. Reply with STRICT JSON only: "
    "{\"task\": \"<one of the allowed>\", \"reason\": \"...\"}. "
    "Do not invent tasks outside the allowed list."
)

# Deterministic guardrail: an explicit "locate/highlight <object>" instruction is a
# grounding request. If it's present we route to grounding even when the LLM picked
# caption/VQA — grounding is the task that produces the required visual evidence.
_GROUNDING_RE = re.compile(
    r"(?i)\b(highlight|mark|locate|outline|circle|pinpoint|delineate|"
    r"point\s+(to|out)|show\s+(me\s+)?(where|the)|where\s+(is|are)|"
    r"find\s+the|box\s+the|segment\s+the)\b")


def _looks_like_grounding(query: str) -> bool:
    return bool(_GROUNDING_RE.search(query or ""))


def classify(query: str, input_type: InputType) -> tuple[Task, str, str]:
    """Return (task, method, note). method is 'llm' or 'fallback'."""
    allowed = TASKS_BY_INPUT.get(input_type, [])
    if not allowed:
        raise ValueError(f"No tasks possible for input_type={input_type}")

    task: Task | None = None
    method, note = "fallback", "LLM disabled; dev fallback classifier"

    if config.USE_LLM_INTENT:
        try:
            t = _llm_classify(query, allowed)
            if t in allowed:
                task, method, note = t, "llm", f"LLM ({config.OLLAMA_MODEL}) classified query"
        except Exception as e:  # LLM unreachable -> degrade, don't crash
            task = _fallback(query, allowed)
            method, note = "fallback", f"LLM unavailable ({e.__class__.__name__}); used fallback"

    if task is None:
        task = _fallback(query, allowed)

    # guardrail: explicit locate/highlight verbs must ground (produces visual evidence)
    if "single_grounding" in allowed and task != "single_grounding" and _looks_like_grounding(query):
        task, note = "single_grounding", f"{note}; grounding-verb override"

    return task, method, note


def _llm_classify(query: str, allowed: list[Task]) -> Task:
    payload = {
        "model": config.OLLAMA_MODEL,
        "stream": False,
        "format": "json",
        "messages": [
            {"role": "system", "content": _SYSTEM},
            {"role": "user",
             "content": f"ALLOWED tasks: {allowed}\nUser query: {query!r}"},
        ],
    }
    req = urllib.request.Request(
        f"{config.OLLAMA_URL}/api/chat",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        body = json.loads(r.read().decode())
    content = body["message"]["content"]
    return json.loads(content)["task"]


# ---- dev-only fallback (NOT the production router) -----------------------
_HINTS: dict[Task, list[str]] = {
    "single_grounding": ["highlight", "where is", "locate", "mark", "show the", "point to", "referred"],
    "single_caption": ["describe", "caption", "what is in", "overview", "scene"],
    "single_vqa": ["is there", "how many", "does", "what", "count", "?"],
    "change_map": ["change map", "map of change", "mask", "where did"],
    "change_vqa": ["changed", "increase", "decrease", "between these", "over time", "difference"],
    "cross_modal": ["optical and sar", "sar and optical", "both images", "fuse", "combine", "together"],
    "disaster_risk": ["disaster", "flood", "inundation", "weather", "prediction", "predict",
                      "cyclone", "storm", "landslide", "wildfire", "risk", "damage",
                      "rescue", "emergency", "affected"],
}


def _fallback(query: str, allowed: list[Task]) -> Task:
    q = query.lower()
    scores = {t: sum(1 for h in _HINTS.get(t, []) if h in q) for t in allowed}
    best = max(scores, key=scores.get)
    if scores[best] == 0:                 # nothing matched -> sensible default
        return allowed[0]
    return best
