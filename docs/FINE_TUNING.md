# SatQuery AI — Fine-Tuning Brief (Track B)

**Who this is for:** the teammate running the **mandatory GeoChat fine-tune**.
**Where it runs:** **Kaggle** (free **T4 16 GB**). A 6 GB laptop **cannot** QLoRA a 7B model.
**What you deliver:**
1. A **LoRA adapter** (`lora-geochat.zip`, ~100–300 MB) that adapts GeoChat on BigEarthNet.txt.
2. A **before/after accuracy table** — the PS's proof of domain adaptation, and a key PPT slide.

> Why this is mandatory: the problem statement says *"a generic LLM or VLM without
> remote-sensing adaptation will not satisfy the requirements."* This adapter is that proof.

All the code is already written in the repo (`training/*.py`, `kaggle/KAGGLE_GUIDE.md`).
Your real work is **getting the images** (Step 2) — that's ~80% of the effort.

---

## The pipeline at a glance

```
BigEarthNet.txt.parquet   (text: questions + answers, already have)
BigEarthNet v2.0 images   (Sentinel-1 SAR + Sentinel-2 optical, YOU must obtain)
        │
        ▼  rico-hdl (Linux binary)
Encoded-BigEarthNet/  (LMDB of safetensors)
        │
        ├── prepare_data.py     → VQA subset (train.jsonl / val.jsonl)
        ├── render_images.py    → data/images/<patch_id>.png  (RGB from B04/B03/B02)
        └── convert_to_llava.py → train_llava.json / val_llava.json
        │
        ▼  geochat.train.train  (QLoRA, 4-bit, T4)
models/lora-geochat  ── evaluate_vqa.py ──▶ BEFORE vs AFTER accuracy
```

---

## Step 0 — Kaggle notebook setup
- New Notebook → **Settings**: Accelerator = **GPU T4 ×1**, **Internet = On**, **Persistence = Files** (so downloads survive).

## Step 1 — Clone repos + install the EXACT pinned stack
GeoChat needs the same version pins as the laptop (see the repo README §1):
```bash
!git clone https://github.com/PoorvaJawale/northstar.git
!git clone https://github.com/mbzuai-oryx/GeoChat.git
%cd /kaggle/working/northstar

!pip -q install "transformers==4.31.0" "accelerate==0.27.2" "huggingface-hub==0.24.6" \
    "bitsandbytes==0.50.1" "peft==0.20.0" "sentencepiece==0.2.2" "einops==0.6.1" "timm==0.6.13" \
    pyarrow pandas lmdb safetensors
!pip -q install -e /kaggle/working/GeoChat --no-deps
import sys; sys.path.insert(0, "/kaggle/working/GeoChat")
import geochat; print("geochat OK")
```
> Same golden rule as the laptop: do **not** `-U` upgrade transformers/accelerate/hub.

## Step 2 — Get the BigEarthNet images (THE hard part)
The parquet is only text. You need the actual Sentinel-1/Sentinel-2 pixels, encoded to an LMDB.
Try these in order:

- **Option A — find it on Kaggle (easiest).** Search Kaggle **Datasets** for
  `BigEarthNet v2.0` / `reBEN`. If someone has uploaded the patches **or a pre-built
  LMDB**, click **Add Data** to attach it — skip encoding entirely.
- **Option B — download from source.** From **bigearth.net** get **BigEarthNet-v2.0 S1**
  and **S2** archives. They are large, so grab a subset. Extract to
  `/kaggle/working/BEN-S1` and `/kaggle/working/BEN-S2`.
- **Option C — stuck?** Ping the team lead; we can script a minimal fetch of only the
  patches your subset needs.

**Keep it SMALL:** a few thousand patches is enough for a real before/after gain. Do NOT
pull all 464k.

## Step 3 — Encode images → LMDB with `rico-hdl` (Linux only — that's why it's on Kaggle)
`rico-hdl` is a Rust binary from **GitHub Releases** (NOT pip — `pip install rico-hdl` fails):
```bash
# grab the linux release binary (check the repo for the current URL/version)
!wget -q <rico-hdl-linux-release-url> -O rico-hdl && chmod +x rico-hdl
!./rico-hdl bigearthnet \
    --bigearthnet-s1-dir /kaggle/working/BEN-S1 \
    --bigearthnet-s2-dir /kaggle/working/BEN-S2 \
    --target-dir /kaggle/working/Encoded-BigEarthNet
```
Result: `/kaggle/working/Encoded-BigEarthNet` (an LMDB). If you attached a pre-built LMDB
in Step 2, skip this.

## Step 4 — Get the parquet
The metadata parquet is in the BigEarthNet.txt HF dataset repo:
```bash
!git clone https://huggingface.co/datasets/BIFOLD-BigEarthNetv2-0/BigEarthNet.txt /kaggle/working/BENtxt
# -> /kaggle/working/BENtxt/BigEarthNet.txt.parquet
```

## Step 5 — Build the training data (scripts already written)
```bash
# 5a. VQA text subset (binary/mcq questions), stratified by category
!python training/prepare_data.py \
    --src /kaggle/working/BENtxt/BigEarthNet.txt.parquet \
    --out data/subset --n 3000 --val-n 600

# 5b. render RGB PNGs for exactly those patches (B04/B03/B02, percentile-stretched, 512px)
!python training/render_images.py \
    --lmdb /kaggle/working/Encoded-BigEarthNet \
    --jsonl data/subset/train.jsonl data/subset/val.jsonl \
    --out data/images --size 512

# 5c. convert to GeoChat/LLaVA JSON (drops any record whose image didn't render)
!python training/convert_to_llava.py --subset data/subset --images data/images
```
After 5c you have `data/subset/train_llava.json`, `val_llava.json`, and `data/images/`.

## Step 6 — QLoRA train on the T4
```bash
!python -m geochat.train.train \
  --model_name_or_path MBZUAI/geochat-7B \
  --version v1 \
  --data_path data/subset/train_llava.json \
  --image_folder data/images \
  --vision_tower openai/clip-vit-large-patch14-336 \
  --mm_projector_type mlp2x_gelu --mm_vision_select_layer -2 \
  --mm_use_im_start_end False --mm_use_im_patch_token False \
  --image_aspect_ratio pad \
  --bits 4 --lora_enable True --lora_r 16 --lora_alpha 32 \
  --bf16 False --fp16 True --tf32 False \
  --output_dir /kaggle/working/lora-geochat \
  --num_train_epochs 1 \
  --per_device_train_batch_size 1 --gradient_accumulation_steps 16 \
  --gradient_checkpointing True \
  --learning_rate 2e-4 --warmup_ratio 0.03 --lr_scheduler_type cosine \
  --model_max_length 2048 --lazy_preprocess True \
  --save_strategy steps --save_steps 200 --save_total_limit 1 \
  --logging_steps 5 --dataloader_num_workers 2 --report_to none
```
**If you hit CUDA OOM on the T4:** keep `--per_device_train_batch_size 1`, lower
`--model_max_length` to `1536`, raise `--gradient_accumulation_steps` to `32`. The
504px vision tower is the memory hog.

## Step 7 — Before/after accuracy (the deliverable)
```bash
# BEFORE — base model, no adapter
!python training/evaluate_vqa.py --data data/subset/val_llava.json --images data/images --limit 200
# AFTER — with your adapter
!python training/evaluate_vqa.py --data data/subset/val_llava.json --images data/images --limit 200 \
    --adapter /kaggle/working/lora-geochat
```
Record both numbers, e.g. **BEFORE 0.62 → AFTER 0.78**. That's the PPT slide.

## Step 8 — Package and hand back
```python
import shutil
shutil.make_archive("/kaggle/working/lora-geochat", "zip", "/kaggle/working/lora-geochat")
print("Download lora-geochat.zip from the Output tab, send to the team.")
```
The lead unzips it to `D:\SIH2026\models\lora-geochat` and runs the app with
`LORA_ADAPTER=models\lora-geochat`.

---

## What's in the adapter folder (so the app can load it)
`geochat.train.train` writes an `adapter_config.json`, `adapter_model.bin`, and (if any
non-LoRA weights were trained) `non_lora_trainables.bin`. The app loads it via
`PeftModel.from_pretrained` in `backend/tools/geochat_runtime.py`. If that ever complains
about missing keys, load through GeoChat's own lora path instead (model_path = the adapter
dir whose name contains `lora`, model_base = `MBZUAI/geochat-7B`) — the builder then also
restores `non_lora_trainables.bin`.

## Teammate troubleshooting
| Symptom | Fix |
|---|---|
| `pip install rico-hdl` fails | it's a binary from GitHub Releases, not PyPI |
| `.to is not supported for 4-bit` | you upgraded accelerate — reinstall `accelerate==0.27.2` |
| `huggingface-hub ... <1.0 required` | `pip install huggingface-hub==0.24.6` |
| CUDA OOM during training | batch 1, `model_max_length 1536`, grad-accum 32 |
| wants a wandb login | ensure `--report_to none` |
| render_images: "Missing patches" | those patch_ids aren't in your LMDB sample — fine, they're dropped |
| can't find BigEarthNet images | that's Step 2 — try Kaggle Datasets first, then bigearth.net |

## Scope reminder
- **Internal round (mandatory):** one light QLoRA on a small subset + the before/after
  table. That satisfies the PS.
- **Finale (later):** larger subset, more epochs, evaluate on VRSBench / RSVQA / CDVQA
  test splits, note the Sentinel→Cartosat/RISAT domain gap.
