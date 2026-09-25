"""
SatQuery AI — Modal deployment (real GPU, no laptop needed).

Serves the existing FastAPI backend (backend.main:app) on a Modal T4 GPU, with
GeoChat-7B + the LoRA adapter loaded from a persistent Modal Volume. Modal scales
the container to zero when idle, so it costs nothing between demos and wakes on
the first request (cold start ~30-90s while GeoChat loads).

ONE-TIME SETUP (run locally, see MODAL_DEPLOY.md for the full walkthrough):
    pip install modal
    modal token new                                   # sign in
    modal run modal_app.py::download_weights          # pull GeoChat-7B into the Volume (~14 GB, once)
    modal volume put satquery-models models/geochat-rsvqa-lora /geochat-rsvqa-lora   # upload the adapter
    modal deploy modal_app.py                          # go live -> prints the public URL

The printed URL (…modal.run) is what you put in Vercel's VITE_API_BASE.
No ngrok, no laptop: the backend runs on Modal's GPU.
"""
import modal

APP_NAME = "satquery-backend"
VOLUME_NAME = "satquery-models"
GEOCHAT_HF_ID = "MBZUAI/geochat-7B"

# Persistent storage for the model weights + adapter (survives across runs).
volume = modal.Volume.from_name(VOLUME_NAME, create_if_missing=True)

# ---- Container image: the exact GeoChat inference stack -------------------
# GeoChat pins torch==2.0.1 (cu118) / transformers==4.31.0 / peft==0.4.0 /
# bitsandbytes==0.41.0. We install those + the backend's own deps, and clone
# GeoChat from upstream (it is not in the app repo). We deliberately skip the
# heavy build-only deps in GeoChat's pyproject (deepspeed, wandb, gradio) — they
# are not needed for inference.
image = (
    modal.Image.debian_slim(python_version="3.10")
    .apt_install("git", "libgl1", "libglib2.0-0")
    .pip_install(
        "torch==2.0.1", "torchvision==0.15.2",
        extra_index_url="https://download.pytorch.org/whl/cu118",
    )
    .pip_install(
        # GeoChat runtime pins
        "transformers==4.31.0", "peft==0.4.0", "bitsandbytes==0.41.0",
        "accelerate==0.21.0", "sentencepiece==0.1.99", "tokenizers==0.13.3",
        "einops==0.6.1", "einops-exts==0.0.4", "timm==0.6.13", "protobuf",
        # backend deps
        "numpy<2", "scipy", "scikit-image", "pillow",
        "fastapi", "uvicorn", "pydantic>=2", "jinja2",
        "rasterio", "reportlab", "python-multipart", "pyyaml",
        "requests", "huggingface_hub",
    )
    # GeoChat source (import geochat) — added to PYTHONPATH below.
    .run_commands("git clone --depth 1 https://github.com/mbzuai-oryx/GeoChat.git /root/GeoChat")
    # Static runtime config (config.py reads all of this from the environment).
    .env({
        "SATQUERY_MOCK": "false",
        "SATQUERY_USE_LLM": "false",           # no Ollama on Modal -> rule-based intent + guards
        "GEOCHAT_MODEL": "/models/geochat-7B",  # from the Volume
        "LORA_ADAPTER": "/models/geochat-rsvqa-lora",
        "GEOCHAT_LOAD_4BIT": "true",
        "SATQUERY_DEVICE": "cuda",
        "SATQUERY_CORS": "*",                   # tighten to your Vercel domain if you like
        "HF_HOME": "/models/hf-cache",
        "PYTHONPATH": "/root:/root/GeoChat",
    })
    # The app's backend package (config, tools, registry.yaml, benchmark.json).
    .add_local_dir("backend", "/root/backend")
)

app = modal.App(APP_NAME)


@app.function(image=image, volumes={"/models": volume}, timeout=3600)
def download_weights():
    """One-time: pull GeoChat-7B into the Volume so serving containers don't
    re-download 14 GB on every cold start. Run: modal run modal_app.py::download_weights"""
    from huggingface_hub import snapshot_download
    print(f"Downloading {GEOCHAT_HF_ID} -> /models/geochat-7B ...")
    snapshot_download(GEOCHAT_HF_ID, local_dir="/models/geochat-7B",
                      ignore_patterns=["*.msgpack", "*.h5", "*.safetensors.index.json"])
    volume.commit()
    print("Done. Weights cached in the Volume.")


@app.function(
    image=image,
    gpu="T4",                     # 16 GB — plenty for 7B in 4-bit
    volumes={"/models": volume},
    timeout=600,                  # per-request cap (first load can take ~90s)
    scaledown_window=300,         # keep warm 5 min after the last request, then scale to zero
    max_containers=1,             # single GPU box; queries queue (one heavy model)
)
@modal.concurrent(max_inputs=2)   # allow health/registry polls alongside a query
@modal.asgi_app()
def serve():
    """Serve the existing FastAPI app on the GPU container."""
    from backend.main import app as fastapi_app
    return fastapi_app
