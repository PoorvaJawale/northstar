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
# GeoChat is a LLaVA-1.5 model. It is NOT loadable via AutoModelForCausalLM /
# AutoProcessor — it loads through geochat.model.builder.load_pretrained_model.
# The correct HF checkpoint id is MBZUAI/geochat-7B (NOT "MBZUAI/GeoChat", which 404s).
GEOCHAT_MODEL = os.getenv("GEOCHAT_MODEL", "MBZUAI/geochat-7B")   # HF id or local path
GEOCHAT_CONV_MODE = os.getenv("GEOCHAT_CONV_MODE", "llava_v1")    # Vicuna-v1.5 template
GEOCHAT_LOAD_4BIT = _env_bool("GEOCHAT_LOAD_4BIT", True)          # required for 6 GB GPUs
GEOCHAT_LOAD_8BIT = _env_bool("GEOCHAT_LOAD_8BIT", False)
CHANGE_MODEL = os.getenv("CHANGE_MODEL", "")                      # local checkpoint path
OPTICAL_SAR_MODEL = os.getenv("OPTICAL_SAR_MODEL", "")           # local checkpoint path
LORA_ADAPTER = os.getenv("LORA_ADAPTER", "")                     # path to your fine-tuned LoRA adapter
DEVICE = os.getenv("SATQUERY_DEVICE", "cuda")

# ---- Disaster-management models (optional, used by backend.tools.disaster_tool) ----
# DISASTER_SAR_MODEL: local ONNX segmentation model trained for Sentinel-1 flood/water masks.
# DISASTER_OPTICAL_MODEL: HuggingFace image-segmentation model id/path, e.g. SegFormer/Mask2Former.
# WEATHER_API: currently supports "open-meteo" when lat/lon are supplied.
DISASTER_SAR_MODEL = os.getenv("DISASTER_SAR_MODEL", "")
DISASTER_OPTICAL_MODEL = os.getenv("DISASTER_OPTICAL_MODEL", "")
WEATHER_API = os.getenv("WEATHER_API", "open-meteo")

# ---- Registry ----
REGISTRY_PATH = Path(os.getenv("SATQUERY_REGISTRY", ROOT / "backend" / "tools" / "registry.yaml"))

# ---- API ----
CORS_ORIGINS = os.getenv("SATQUERY_CORS", "*").split(",")
