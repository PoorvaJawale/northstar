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
    "change_vqa", "change_map", "cross_modal", "disaster_risk", "landcover_area",
]

# Which tasks are even possible for a given input type (constrains the LLM).
# Pair inputs ALSO allow the single-image tasks: a user who uploaded two images
# can still ask a single-image question ("describe this", "where are the roads")
# — the controller then answers on one image instead of forcing change/fusion.
# The change/fusion task is listed first so it stays the default when the query
# is ambiguous, but any single-image intent in the query routes correctly.
TASKS_BY_INPUT: dict[InputType, list[Task]] = {
    # allowed[0] is the fallback default when nothing else matches. For a single
    # image that must be the mandatory VQA baseline — NOT disaster_risk — so an
    # unmatched question (or Ollama being down) never mislabels a plain query as
    # a disaster. disaster_risk / landcover_area stay reachable via the LLM and
    # the deterministic guards below.
    "single_image": ["single_vqa", "single_caption", "single_grounding", "landcover_area", "disaster_risk"],
    "bitemporal_pair": ["change_vqa", "change_map", "disaster_risk", "landcover_area",
                        "single_vqa", "single_caption", "single_grounding"],
    "optical_sar_pair": ["cross_modal", "disaster_risk", "landcover_area",
                        "single_vqa", "single_caption", "single_grounding"],
    "unknown": [],
}

_SYSTEM = (
    "You are a task router for a remote-sensing image assistant. "
    "Choose EXACTLY ONE task from the ALLOWED list for the user's query.\n"
    "Task meanings:\n"
    "- single_grounding: the user wants a specific object or region LOCATED / MARKED on the "
    "image. Verbs: highlight, mark, locate, outline, circle, pinpoint, point to, show where, "
    "where is/are, find the <object>, box/segment the <object>.\n"
    "- single_caption: the user wants a general DESCRIPTION of the scene "
    "(describe, summarise, what does this image show). Open 'describe ...' "
    "requests on a single image are caption, INCLUDING 'describe the visible "
    "damage / the buildings / the land cover' — describing is not locating.\n"
    "- single_vqa: a specific factual QUESTION about the image "
    "(is there..., how many..., what is the..., what type..., yes/no). "
    "COUNTING and 'what type / which dominates' questions are single_vqa, even "
    "when they mention vegetation, buildings or land use, and even when the "
    "question has several parts. These are NOT landcover_area.\n"
    "- change_vqa / change_map: what changed between two dated images.\n"
    "- cross_modal: combine the optical and SAR images.\n"
    "- disaster_risk: ONLY explicit disaster management, flood/cyclone/landslide/"
    "wildfire risk, prediction, weather impact, or rescue. A plain 'describe' or "
    "factual question is NOT disaster_risk just because it mentions damage.\n"
    "- landcover_area: choose this ONLY when the user asks for the NUMERIC AREA "
    "or EXTENT that a land-cover class covers, e.g. 'how big is the cropland', "
    "'what area of water', 'how many hectares of forest', 'what proportion of the "
    "scene is built-up'. A question that merely names a class, counts objects, or "
    "asks what dominates is single_vqa, NOT landcover_area.\n"
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


# Deterministic guardrail: a "how big / how much area / extent of" measurement
# question is a land-cover AREA request — a text VQA model can't measure it, so
# route it to the segmentation+area tool instead of single_vqa.
_MEASURE_RE = re.compile(
    r"(?i)\b(how\s+(big|large|much\s+area|many\s+hectares|many\s+acres)|"
    r"(area|extent|size|coverage)\s+of|how\s+much\s+of|hectares\s+of|"
    r"what\s+(area|fraction|percentage|proportion))\b")


def _looks_like_measurement(query: str) -> bool:
    return bool(_MEASURE_RE.search(query or ""))


# Deterministic guardrail: explicit change wording on a bi-temporal pair is a
# change request — it must beat the generic single_vqa keywords ("what", "?").
_CHANGE_RE = re.compile(
    r"(?i)\b(chang(e|ed|es|ing)|increase[d]?|decreas(e|ed)|expand(ed|ing)?|"
    r"grow(n|th)?|reduc(e|ed|tion)|difference|over\s+time|"
    r"between\s+(the\s+|these\s+)?(two\s+)?(dates|images|scenes|periods)|"
    r"before\s+and\s+after|new\s+(construction|development|buildings?))\b")


def _looks_like_change(query: str) -> bool:
    return bool(_CHANGE_RE.search(query or ""))


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

    # guardrail: explicit change wording beats generic single_vqa keywords on a pair
    if ("change_vqa" in allowed and task not in ("change_vqa", "change_map")
            and _looks_like_change(query)):
        task, note = "change_vqa", f"{note}; change-intent override"

    # guardrail: a measurement question ("how big is the cropland") must be answered
    # by segmentation+area, not a text model — but never steal a genuine
    # change/disaster/fusion measurement ("how much did built-up change").
    if ("landcover_area" in allowed and _looks_like_measurement(query)
            and task in ("single_vqa", "single_caption", "single_grounding")):
        task, note = "landcover_area", f"{note}; measurement-question override"

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
    "landcover_area": ["how big", "how large", "how much area", "area of", "extent of",
                       "size of", "coverage", "how much of", "hectares", "square km",
                       "cropland", "vegetation cover", "built-up area", "water area"],
}


def _fallback(query: str, allowed: list[Task]) -> Task:
    q = query.lower()
    scores = {t: sum(1 for h in _HINTS.get(t, []) if h in q) for t in allowed}
    best = max(scores, key=scores.get)
    if scores[best] == 0:                 # nothing matched -> sensible default
        return allowed[0]
    return best
