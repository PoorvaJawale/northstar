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
import urllib.request
import urllib.error

from .. import config
from ..schemas import Task, InputType

VALID_TASKS: list[Task] = [
    "single_vqa", "single_caption", "single_grounding",
    "change_vqa", "change_map", "cross_modal",
]

# Which tasks are even possible for a given input type (constrains the LLM).
TASKS_BY_INPUT: dict[InputType, list[Task]] = {
    "single_image": ["single_vqa", "single_caption", "single_grounding"],
    "bitemporal_pair": ["change_vqa", "change_map"],
    "optical_sar_pair": ["cross_modal"],
    "unknown": [],
}

_SYSTEM = (
    "You are a task router for a remote-sensing image assistant. "
    "Given a user query and the list of ALLOWED tasks, choose the single best task. "
    "Reply with STRICT JSON only: {\"task\": \"<one of the allowed>\", \"reason\": \"...\"}. "
    "Do not invent tasks outside the allowed list."
)


def classify(query: str, input_type: InputType) -> tuple[Task, str, str]:
    """Return (task, method, note). method is 'llm' or 'fallback'."""
    allowed = TASKS_BY_INPUT.get(input_type, [])
    if not allowed:
        raise ValueError(f"No tasks possible for input_type={input_type}")

    if config.USE_LLM_INTENT:
        try:
            task = _llm_classify(query, allowed)
            if task in allowed:
                return task, "llm", f"LLM ({config.OLLAMA_MODEL}) classified query"
        except Exception as e:  # LLM unreachable -> degrade, don't crash
            note = f"LLM unavailable ({e.__class__.__name__}); used fallback"
            return _fallback(query, allowed), "fallback", note

    return _fallback(query, allowed), "fallback", "LLM disabled; dev fallback classifier"


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
}


def _fallback(query: str, allowed: list[Task]) -> Task:
    q = query.lower()
    scores = {t: sum(1 for h in _HINTS.get(t, []) if h in q) for t in allowed}
    best = max(scores, key=scores.get)
    if scores[best] == 0:                 # nothing matched -> sensible default
        return allowed[0]
    return best
