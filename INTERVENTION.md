# What YOUR team must do — intervention checklist

I built the entire software architecture and it runs **end-to-end in MOCK mode
today**. The items below are what only *you* can do: things that need a GPU, real
model weights, the actual dataset, or an API key. Each maps to a clearly marked
`=== YOUR INTERVENTION POINT #n ===` comment in the code.

Legend: 🟢 do to demo the architecture · 🟡 do for a strong internal round · 🔴 finale-grade

---

## ⭐ GeoChat pipeline — NOW IMPLEMENTED (what's code vs what's yours)

I implemented the full GeoChat path. **Code is done; these hand-offs are yours:**

| File (implemented) | What it does | YOUR hand-off |
|---|---|---|
| `backend/tools/geochat_runtime.py` | Correct GeoChat load + inference | — (ready) |
| `infer.py` | One-shot GeoChat inference | Provide a real image + the checkpoint |
| `training/render_images.py` | LMDB → RGB PNGs | **Provide the BigEarthNet LMDB** |
| `training/convert_to_llava.py` | jsonl → LLaVA train JSON | — (ready) |
| `training/evaluate_vqa.py` | before/after accuracy | — (ready) |
| `kaggle/KAGGLE_GUIDE.md` | T4 QLoRA, cell-by-cell | **Run it on Kaggle** |
| `backend/tools/geochat_tool.py` | GeoChat wired into the app | Set `SATQUERY_MOCK=0` + `LORA_ADAPTER` |

**Your concrete hand-offs, in order:**
1. **App deps in `.venv311`.** It currently has GeoChat/torch but NOT the app deps.
   Run `.\.venv311\Scripts\python.exe -m pip install fastapi "uvicorn[standard]" pydantic python-multipart pyyaml jinja2` so the backend runs in the same env as GeoChat.
2. **Get the images (the real blocker).** Encode a small BigEarthNet v2.0 sample to
   an `Encoded-BigEarthNet` LMDB with `rico-hdl` (binary from its GitHub releases —
   NOT pip). A few thousand patches is enough. Then `render_images.py` works.
3. **Prove one inference** locally: download `MBZUAI/geochat-7B` (~14 GB) once, then
   `infer.py --image <png> --query "..."` in 4-bit. Confirms 6 GB holds.
4. **Fine-tune on Kaggle** (T4): follow `kaggle/KAGGLE_GUIDE.md` end to end → download
   the LoRA adapter zip → unzip to `models/lora-geochat`.
5. **Before/after table**: run `training/evaluate_vqa.py` twice (with/without `--adapter`).
6. **Flip the app live**: `SATQUERY_MOCK=0`, `LORA_ADAPTER=models/lora-geochat`.

Decisions already made with you: fine-tune venue = **Kaggle/Colab T4** (6 GB can't
QLoRA a 7B). Everything above assumes that.

---

## 0. 🟢 Run it once in MOCK mode (5 min, no GPU)
```bash
python -m venv .venv && .venv\Scripts\Activate.ps1     # PowerShell
pip install -r requirements.txt
uvicorn backend.main:app --reload      # open http://localhost:8000
pytest -q                              # all tests should pass
```
If this works, the architecture is proven. Everything below replaces mock outputs
with real ones.

---

## 1. 🟡 Secure a GPU + install the ML stack  *(the only hard blocker)*
- Get GPU access: **Kaggle** (free T4, 30h/wk), **Colab Pro**, or your **college cluster**. ~16 GB.
- Install the heavy deps (uncomment in `requirements.txt`), installing **torch from
  pytorch.org with the correct CUDA build** (not from pip plainly):
  ```bash
  pip install torch --index-url https://download.pytorch.org/whl/cu121
  pip install transformers accelerate peft bitsandbytes
  ```
- **Windows note:** `bitsandbytes` 4-bit is painful natively — use **WSL2** (Ubuntu) or run the
  model parts on Kaggle/Colab. The app/agent itself runs fine on Windows.
- ✅ Check: `python -c "import torch;print(torch.cuda.is_available())"` → `True`.

## 2. 🟢 Get the dataset — BigEarthNet.txt
- Download from **https://txt.bigearth.net** (co-registered Sentinel-1 SAR +
  Sentinel-2 optical + caption/VQA/referring annotations).
- **Confirm the exact download path today** — the site links a paper; the actual files
  may come from `bigearth.net` with the `.txt` annotations layered on. This is the one
  Day-0 risk. Put it under `data/`.
- Also grab **CDVQA** (change-VQA) and **VRSBench + RSVQA** (the PS's eval benchmarks).

## 3. 🔵 Run Ollama for real task routing (`intent.py`)
- Install **Ollama**, then `ollama pull qwen2.5:7b-instruct`.
- Set `SATQUERY_USE_LLM=1`. Now the router is a real LLM classifier, not the fallback.
- ✅ Check: the trace shows `classify … (via llm)`, not `(via fallback)`.

## 4. 🟡 Fine-tune one component — **mandatory** (`training/`)  → INTERVENTION POINT #5
- `prepare_data.py`: wire it to the real BigEarthNet.txt layout, make a ~3k stratified subset.
- `lora_finetune.py`: implement the dataset class + `evaluate()`, run on the GPU.
- Point `LORA_ADAPTER=models/lora-geochat`.
- ✅ Deliverable: a **BEFORE vs AFTER** metrics table (your key slide).

## 5. 🟡 Implement the real tool inference (swap out the mocks)
Each tool has a `_real()` method with a marked TODO. Fill these in, then set `SATQUERY_MOCK=0`:
- **INTERVENTION POINT #1 & #2** — `tools/geochat_tool.py`: load GeoChat (+ your LoRA),
  build per-task prompts, parse text and the grounding box, derive **confidence from
  model scores** (not a constant).
- **INTERVENTION POINT #3** — `tools/change_tool.py`: load ChangeFormer/BIT
  (`open-cd` toolbox) for the change map + a caption pass.
- **INTERVENTION POINT #4** — `tools/optical_sar_tool.py`: load your dual-encoder
  fusion model trained on BigEarthNet.txt S1+S2 pairs.

## 6. 🔴 SAR single-image path
Make sure a **lone SAR image** answers well (PS allows "optical **or SAR**" single image).
GeoChat is optical-centric — include SAR samples in the fine-tune and test a SAR-only query.

## 7. 🔴 Evaluate on the prescribed benchmarks
Report **VRSBench / RSVQA / CDVQA** test-split scores. Note the **Sentinel → Cartosat-2S /
RISAT** domain gap (the hidden ISRO/SAC set uses those sensors) as a known challenge in the PPT.

## 8. ⚪ Optional: PDF reports
HTML reports work out of the box. For PDF, install `weasyprint` and add a `build_pdf_report()`
alongside `build_html_report()` in `backend/report/builder.py`.

---

### Division of labour (suggested, 4 on prototype)
| Person | Owns |
|---|---|
| **ML-1** | Items 1, 2, 4 (data + fine-tune) — the critical path |
| **ML-2** | Item 5 (real tool inference) + item 3 (Ollama) |
| **Backend** | agent/controller polish, API, report, item 7 eval harness |
| **Frontend** | `frontend/` polish, map overlays, trace timeline, demo scenarios |
| **PPT ×2** | research/prior-art story, before/after numbers, demo script + backup video |

### Definition of "prototype ready" (Aug 31)
All 5 mandatory tasks pass with **at least the fine-tuned single-image path real**
(items 1–5 minimum), the agent routing live via Ollama (item 3), and 3 rehearsed
demo scenarios + a backup video. Mock can remain for the heaviest tools if a model
isn't ready — the architecture still demonstrates fully.
