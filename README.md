# SatQuery AI — SIH 2026 · PS 26167 (ISRO)

An **agentic vision-language assistant for remote-sensing imagery**. Ask a
natural-language question about satellite image(s); an agent inspects the input,
classifies the task, picks the right specialist model from a registry, runs it,
and returns an evidence-grounded answer with an auditable execution trace.

- **Single-image**: VQA, captioning, text-guided grounding — powered by **GeoChat** (real).
- **Bi-temporal change** & **optical–SAR fusion** — wired as tools (mock until the
  specialist models land; see the fine-tuning/teammate track).
- **Agentic controller**: `inspect → classify → select → execute → fuse → trace`.

> This README is the single source of truth. It lists **every dependency**, **every
> exact version**, and **exactly who does what**. For the fine-tuning track, your
> teammate follows [`docs/FINE_TUNING.md`](docs/FINE_TUNING.md).

---

## 0. Who does what (division of labour)

| Track | Owner | Doc |
|---|---|---|
| **A. Local GeoChat inference + the web app** | You (6 GB laptop) | this README, §2–§6 |
| **B. The mandatory QLoRA fine-tune** (Kaggle T4) | Teammate | [`docs/FINE_TUNING.md`](docs/FINE_TUNING.md) |
| **C. Deploy + demo video + PPT** | Team | §9 + the PPT prompt |

The two tracks are independent and run in parallel. Track B produces a LoRA
adapter that Track A drops into the app at the end.

---

## 1. The environment that actually works (hard-won — do NOT "upgrade" blindly)

GeoChat is a **LLaVA-1.5** model that requires the **old `transformers 4.31.0`**.
That forces a specific, mutually-compatible set of versions. These exact pins are
verified working on **Windows 11 + RTX 3050 (6 GB) + CUDA 12.1**:

| Package | Version | Why this exact version |
|---|---|---|
| Python | 3.11.9 | GeoChat + torch cu121 wheels | 
| torch | 2.5.1+cu121 | CUDA 12.1 build (from pytorch.org, not plain pip) |
| torchvision | 0.20.1+cu121 | matches torch 2.5.1 |
| **transformers** | **4.31.0** | GeoChat's MPT/LLaMA code needs `_expand_mask`; newer transformers removed it |
| **accelerate** | **0.27.2** | newer accelerate (1.x) calls `.to()` on 4-bit models → crash; 0.27.2 respects the old 4-bit flag |
| **huggingface-hub** | **0.24.6** | transformers 4.31 hard-requires `hub < 1.0`; 0.24.6 also keeps `cached_download` (removed in 0.26) |
| bitsandbytes | 0.50.1 | 4-bit quantization; has Windows CUDA wheels |
| peft | 0.20.0 | LoRA adapter loading (only used when an adapter is set) |
| sentencepiece | 0.2.2 | LlamaTokenizer backend |
| einops | 0.6.1 | GeoChat internals |
| timm | 0.6.13 | vision tower |
| numpy | 2.x | arrays / image ops |
| pillow | 12.x | image I/O |

Web-app deps (lightweight): `fastapi 0.141`, `uvicorn 0.52`, `pydantic 2.13`,
`python-multipart 0.0.32`, `PyYAML 6.0`, `Jinja2 3.1`.

Optional (task-specific): `rasterio` (real GeoTIFF reading — app falls back to
Pillow without it), `lmdb` + `safetensors` + `pyarrow` + `pandas` (only for the
fine-tuning data pipeline, mostly on Kaggle).

> **Golden rule:** never run `pip install -U transformers/accelerate/huggingface-hub`.
> The pins above are load-bearing. If something asks you to upgrade one, don't.

---

## 2. One-time local setup (Windows, Track A)

You use the environment at **`D:\SIH2026\.venv311`** (Python 3.11). The other
`.venv` is stale — ignore it. Always verify which Python you're on:

```powershell
cd D:\SIH2026
.\.venv311\Scripts\Activate.ps1
python -c "import sys; print(sys.executable)"   # must be ...\.venv311\Scripts\python.exe
```

### 2a. GPU + torch (already installed, listed for reproducibility)
```powershell
python -c "import torch; print(torch.__version__, torch.cuda.is_available(), torch.cuda.get_device_name(0))"
# 2.5.1+cu121 True NVIDIA GeForce RTX 3050 6GB Laptop GPU
```
If torch is missing, install the CUDA build (NOT plain pip):
```powershell
python -m pip install torch==2.5.1 torchvision==0.20.1 --index-url https://download.pytorch.org/whl/cu121
```

### 2b. The pinned ML stack
```powershell
python -m pip install "transformers==4.31.0" "accelerate==0.27.2" "huggingface-hub==0.24.6" `
    "bitsandbytes==0.50.1" "peft==0.20.0" "sentencepiece==0.2.2" "einops==0.6.1" "timm==0.6.13"
```

### 2c. GeoChat, installed importable (no dependency changes)
GeoChat is cloned at `D:\SIH2026\GeoChat`. Install it **editable, `--no-deps`** so
`import geochat` works from anywhere without touching your pinned packages:
```powershell
python -m pip install -e .\GeoChat --no-deps
python -c "import geochat; print('geochat import OK')"
```
(If it complains about build isolation, add `--no-build-isolation`.)

### 2d. Web-app deps
```powershell
python -m pip install fastapi "uvicorn[standard]" pydantic python-multipart pyyaml jinja2
python -c "import fastapi, uvicorn, pydantic, yaml, jinja2; print('Web deps OK')"
```

---

## 3. Download the GeoChat model (~14 GB, to the D: drive)

The correct checkpoint is **`MBZUAI/geochat-7B`** (NOT `MBZUAI/GeoChat`, which 404s).

**Put the HF cache on D:** (C: filled up and the download failed at 94%):
```powershell
$env:HF_HOME = "D:\SIH2026\.hf-cache"
setx HF_HOME "D:\SIH2026\.hf-cache"          # permanent for new shells
$env:HF_HUB_DISABLE_XET = "1"                # the xet CDN was flaky; use plain HTTPS
```

Download into a local folder, with an auto-resume loop (survives dropped connections):
```powershell
do { hf download MBZUAI/geochat-7B --local-dir D:\SIH2026\models\geochat-7B } until ($LASTEXITCODE -eq 0)
```
Verify both shards landed:
```powershell
Get-ChildItem D:\SIH2026\models\geochat-7B\*.bin | Select-Object Name,@{n="GB";e={[math]::Round($_.Length/1GB,2)}}
# pytorch_model-00001-of-00002.bin ~9.98 GB, ...00002... ~4.15 GB
```
> On first inference, GeoChat also pulls its vision tower `openai/clip-vit-large-patch14-336`
> (~1.7 GB) into `.hf-cache`. That's separate and one-time — not the 14 GB again.

---

## 4. Prove ONE inference (the milestone)

Any RGB image works (a real satellite/aerial image gives a meaningful answer):
```powershell
# throwaway test image (noise is fine to confirm the pipeline loads & generates):
python -c "from PIL import Image; import numpy as np; Image.fromarray((np.random.rand(504,504,3)*255).astype('uint8')).save('test_rgb.png')"

$env:GEOCHAT_MODEL = "D:\SIH2026\models\geochat-7B"
python infer.py --image test_rgb.png --query "Describe the land cover in this image."
```
Success = it prints `Q: / A: / confidence:`. (4-bit load fits ~5 GB on the 6 GB card;
first load is slow.)

Options: `--adapter models\lora-geochat` (once you have the fine-tuned adapter),
`--load-8bit`, `--no-4bit`.

---

## 5. Run the web app

**MOCK mode** (no GPU, no model — for architecture demos / other machines):
```powershell
$env:SATQUERY_MOCK = "1"
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
pytest -q          # 8 agent tests, all mock
```

**LIVE mode** (real GeoChat for single-image tasks):
```powershell
$env:SATQUERY_MOCK = "0"
$env:GEOCHAT_MODEL = "D:\SIH2026\models\geochat-7B"
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000    # omit --reload so the 14 GB model isn't reloaded
```
Open **http://localhost:8000** → header shows **LIVE MODELS**. Upload **one** image and
ask: *"Describe the land cover"*, *"Is there a water body?"*, *"Highlight the water body"*.
First query loads the model (~1 min); later queries are faster.

> **Two-image queries** (change / optical–SAR) intentionally stay on **mock** in live
> mode until those specialist models are configured (`CHANGE_MODEL` / `OPTICAL_SAR_MODEL`
> env vars). So the app never crashes — single-image is the real live demo.

### Environment variables (all optional; sensible defaults)
| Var | Default | Meaning |
|---|---|---|
| `SATQUERY_MOCK` | `1` | `0` = use real models |
| `GEOCHAT_MODEL` | `MBZUAI/geochat-7B` | HF id **or local folder** (use the local folder to avoid re-download) |
| `GEOCHAT_CONV_MODE` | `llava_v1` | Vicuna-v1.5 prompt template |
| `GEOCHAT_LOAD_4BIT` | `1` | 4-bit quantization (needed on 6 GB) |
| `LORA_ADAPTER` | *(empty)* | path to the fine-tuned adapter |
| `CHANGE_MODEL` / `OPTICAL_SAR_MODEL` | *(empty)* | set to enable those real tools |
| `SATQUERY_USE_LLM` / `OLLAMA_MODEL` | off in mock | real LLM task-router via Ollama |

---

## 6. Project layout

```
backend/
  main.py                  FastAPI app (/api/query, /api/registry, /api/report)
  config.py                all env-configurable settings (the MOCK switch, model paths)
  agent/                   controller · intent · inspector · registry (the agentic core)
  tools/
    base.py                the Tool interface
    registry.yaml          tool capabilities (add a model = add a block here)
    geochat_tool.py        single-image VQA/caption/grounding  (real + mock)
    geochat_runtime.py     the correct GeoChat loader + inference (shared)
    change_tool.py         bi-temporal change  (mock until CHANGE_MODEL set)
    optical_sar_tool.py    optical-SAR fusion  (mock until OPTICAL_SAR_MODEL set)
  geo/io.py                GeoTIFF/TIFF/PNG reader
  report/                  HTML evidence report
frontend/                  static single-page UI (upload · answer · evidence · trace)
training/                  fine-tuning pipeline (see docs/FINE_TUNING.md)
  prepare_data.py          BigEarthNet.txt -> VQA subset (jsonl)
  render_images.py         LMDB -> RGB PNGs
  convert_to_llava.py      jsonl -> GeoChat/LLaVA training JSON
  evaluate_vqa.py          before/after accuracy
kaggle/KAGGLE_GUIDE.md     T4 QLoRA, copy-paste cells
infer.py                   standalone one-shot inference
tests/                     8 end-to-end agent tests (mock)
docs/FINE_TUNING.md        the teammate's fine-tuning brief
```

Not in git (see `.gitignore`): `GeoChat/`, `BigEarthNet.txt/`, `models/`, `.hf-cache/`,
`.venv311/`, `data/`, `uploads/`, `reports/`, `*.png`.

---

## 7. Troubleshooting (every error we actually hit, and the fix)

| Symptom | Cause | Fix |
|---|---|---|
| `cannot import name '_expand_mask'` | transformers too new | `pip install transformers==4.31.0` |
| `ModuleNotFoundError: No module named 'geochat'` | not installed, only ran inside its folder | `pip install -e .\GeoChat --no-deps` |
| `LlamaTokenizer requires the SentencePiece library` | missing dep | `pip install sentencepiece` |
| `.to is not supported for 4-bit or 8-bit models` | accelerate 1.x vs transformers 4.31 | `pip install accelerate==0.27.2` |
| `huggingface-hub>=0.14.1,<1.0 is required ... found 1.29.0` | hub too new | `pip install huggingface-hub==0.24.6` |
| download: `not enough space (os error 112)` | HF cache on full C: | set `HF_HOME=D:\SIH2026\.hf-cache` |
| download: `ConnectionError ... xet` | flaky xet CDN | `$env:HF_HUB_DISABLE_XET="1"` + rerun (resumes) |
| app re-downloads the 14 GB | pointing at hub id, not local folder | set `GEOCHAT_MODEL=D:\SIH2026\models\geochat-7B` |
| CUDA out of memory | 6 GB tight | `--load-8bit`, close other GPU apps; it also CPU-offloads |
| serve/cli.py errors on `import llava` | GeoChat's serve files use the `llava` namespace | don't use them — use `infer.py` / `geochat_runtime.py` |

---

## 8. The "not hardcoded" guarantees (for the PPT / judges)
- **Routing** is an LLM classifier (`intent.py`), not keyword `if`s. A dev fallback runs
  only without Ollama and is flagged `fallback` in the trace.
- **Tools** are discovered from `registry.yaml` at runtime — add a model = add a YAML
  block + one `Tool` subclass (demo live with the reload-registry button).
- **Parameters** are filtered to each tool's declared `allowed_params`.
- **Every request emits an auditable trace** (the PS's "observable execution summary").

## 9. Deploy (Track C, brief)
Deploy the FastAPI app (e.g. Hugging Face Spaces / Render) for the PPT's live link.
GPU inference needs a GPU host; a CPU host can run MOCK mode for a UI/architecture demo.
Record a 1–2 min demo video of the live single-image flow.

---

## 10. Fine-tuning (Track B) → your teammate
The mandatory "we adapted GeoChat on BigEarthNet.txt" deliverable runs on Kaggle.
**Full brief: [`docs/FINE_TUNING.md`](docs/FINE_TUNING.md).** Output = a LoRA adapter +
a before/after accuracy table (a key PPT slide). Drop the adapter into
`models/lora-geochat` and run the app with `LORA_ADAPTER=models\lora-geochat`.
