"""
Central configuration for SatQuery AI.

The single most important switch is MOCK_MODE.
  MOCK_MODE = True  -> tools return synthetic-but-realistic outputs. The whole
                       app runs with NO GPU, NO model weights, NO datasets.
                       Use this to see the full architecture working today.
  MOCK_MODE = False -> tools load the real models (GeoChat, change model, etc.).
                       Requires GPU + weights + `torch`/`transformers` installed.

Everything is overridable by environment variables so you never edit code to switch.
"""
from __future__ import annotations
import os
from pathlib import Path


def _env_bool(name: str, default: bool) -> bool:
    v = os.getenv(name)
    if v is None:
        return default
    return v.strip().lower() in {"1", "true", "yes", "on"}


# ---- Paths ----
ROOT = Path(__file__).resolve().parent.parent
UPLOAD_DIR = Path(os.getenv("SATQUERY_UPLOAD_DIR", ROOT / "uploads"))
REPORT_DIR = Path(os.getenv("SATQUERY_REPORT_DIR", ROOT / "reports"))
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
REPORT_DIR.mkdir(parents=True, exist_ok=True)

# ---- The master switch ----
MOCK_MODE = _env_bool("SATQUERY_MOCK", True)

# ---- Intent classifier (the LLM controller brain) ----
# Real path talks to a local Ollama server. If unreachable, a dev-only fallback
# classifier is used so the app still runs (clearly flagged in the trace).
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen2.5:7b-instruct")
USE_LLM_INTENT = _env_bool("SATQUERY_USE_LLM", not MOCK_MODE)  # off by default in mock

# ---- Real model locations (only read when MOCK_MODE = False) ----
GEOCHAT_MODEL = os.getenv("GEOCHAT_MODEL", "MBZUAI/GeoChat")     # HF id or local path
CHANGE_MODEL = os.getenv("CHANGE_MODEL", "")                      # local checkpoint path
OPTICAL_SAR_MODEL = os.getenv("OPTICAL_SAR_MODEL", "")           # local checkpoint path
LORA_ADAPTER = os.getenv("LORA_ADAPTER", "")                     # path to your fine-tuned adapter
DEVICE = os.getenv("SATQUERY_DEVICE", "cuda")

# ---- Registry ----
REGISTRY_PATH = Path(os.getenv("SATQUERY_REGISTRY", ROOT / "backend" / "tools" / "registry.yaml"))

# ---- API ----
CORS_ORIGINS = os.getenv("SATQUERY_CORS", "*").split(",")
