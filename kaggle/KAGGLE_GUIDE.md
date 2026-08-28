# QLoRA fine-tuning of GeoChat on Kaggle (T4) — copy-paste cells

Your RTX 3050 (6 GB) can run GeoChat **inference** but not **QLoRA training**.
Do the mandatory fine-tune here on Kaggle's **free T4 (16 GB)**, download the
resulting LoRA adapter (~100–300 MB), and run inference locally with it.

**Before you start (things only you can do — see also INTERVENTION.md):**
1. Kaggle account → new Notebook → Settings → **Accelerator = GPU T4 x1**, **Internet = On**.
2. Attach the image data. You need a **BigEarthNet v2.0 sample encoded to an LMDB**
   (`Encoded-BigEarthNet/`). Easiest: encode a small sample with `rico-hdl`
   (binary from its GitHub releases, NOT pip) and upload it as a **Kaggle Dataset**,
   then "Add Data" to the notebook. A few thousand patches is plenty for the demo.
3. Have `BigEarthNet.txt.parquet` available (upload as a Kaggle Dataset too, or pull it).

---

### Cell 1 — clone your repo + GeoChat
```bash
!git clone https://github.com/PoorvaJawale/northstar.git
!git clone https://github.com/mbzuai-oryx/GeoChat.git
%cd /kaggle/working/northstar
```

### Cell 2 — install deps (GeoChat needs transformers 4.31.0)
```bash
!pip -q install transformers==4.31.0 peft==0.4.0 accelerate==0.21.0 \
    bitsandbytes==0.41.0 sentencepiece==0.1.99 einops timm==0.6.13 pyarrow lmdb safetensors
!pip -q install -e /kaggle/working/GeoChat
```
> If Kaggle's preinstalled torch conflicts, keep torch as-is and only install the
> above. GeoChat needs `_expand_mask`, which transformers 4.31.0 provides.

### Cell 3 — point Python at both repos
```python
import sys
sys.path.insert(0, "/kaggle/working/GeoChat")
sys.path.insert(0, "/kaggle/working/northstar")
import geochat  # should print nothing / succeed
print("geochat import OK")
```

### Cell 4 — build the VQA text subset
```bash
!python training/prepare_data.py \
  --src /kaggle/input/<your-parquet-dataset>/BigEarthNet.txt.parquet \
  --out data/subset --n 3000 --val-n 600
```

### Cell 5 — render RGB PNGs for exactly those patches
```bash
!python training/render_images.py \
  --lmdb /kaggle/input/<your-lmdb-dataset>/Encoded-BigEarthNet \
  --jsonl data/subset/train.jsonl data/subset/val.jsonl \
  --out data/images --size 512
```

### Cell 6 — convert to GeoChat/LLaVA training JSON
```bash
!python training/convert_to_llava.py --subset data/subset --images data/images
```

### Cell 7 — QLoRA train (single T4, no DeepSpeed, fp16)
```bash
!python -m geochat.train.train \
  --model_name_or_path MBZUAI/geochat-7B \
  --version v1 \
  --data_path data/subset/train_llava.json \
  --image_folder data/images \
  --vision_tower openai/clip-vit-large-patch14-336 \
  --mm_projector_type mlp2x_gelu \
  --mm_vision_select_layer -2 \
  --mm_use_im_start_end False \
  --mm_use_im_patch_token False \
  --image_aspect_ratio pad \
  --bits 4 --lora_enable True --lora_r 16 --lora_alpha 32 \
  --bf16 False --fp16 True --tf32 False \
  --output_dir /kaggle/working/lora-geochat \
  --num_train_epochs 1 \
  --per_device_train_batch_size 1 \
  --gradient_accumulation_steps 16 \
  --gradient_checkpointing True \
  --learning_rate 2e-4 --warmup_ratio 0.03 --lr_scheduler_type cosine \
  --model_max_length 2048 --lazy_preprocess True \
  --save_strategy steps --save_steps 200 --save_total_limit 1 \
  --logging_steps 5 --dataloader_num_workers 2 --report_to none
```
> **If you OOM:** drop `--model_max_length` to 1536, keep batch size 1, raise
> `--gradient_accumulation_steps`. The 504px vision tower is the memory hog.

### Cell 8 — before/after accuracy (your key slide)
```bash
# BEFORE (base model)
!python training/evaluate_vqa.py --data data/subset/val_llava.json \
  --images data/images --limit 200
# AFTER (with adapter)
!python training/evaluate_vqa.py --data data/subset/val_llava.json \
  --images data/images --limit 200 --adapter /kaggle/working/lora-geochat
```

### Cell 9 — save the adapter to download
```python
import shutil
shutil.make_archive("/kaggle/working/lora-geochat", "zip", "/kaggle/working/lora-geochat")
print("Download lora-geochat.zip from the notebook's Output tab.")
```

---

## Back on your laptop (6 GB)
1. Unzip the adapter to `D:\SIH2026\models\lora-geochat`.
2. Test inference:
   ```bash
   .venv311\Scripts\python.exe infer.py --image data\images\<patch>.png ^
     --query "Is there a water body?" --adapter models\lora-geochat
   ```
3. Run the app with the real model:
   ```bash
   set SATQUERY_MOCK=0
   set LORA_ADAPTER=models\lora-geochat
   .venv311\Scripts\python.exe -m uvicorn backend.main:app --reload
   ```

## Known risks to watch (flagged honestly)
- **VRAM on the T4**: 7B QLoRA + 504px vision is tight; if it OOMs, use the OOM knobs in Cell 7.
- **Adapter re-load**: if `PeftModel` attach in `geochat_runtime.py` complains about
  missing keys, load via GeoChat's own lora path instead (model_path=adapter dir whose
  name contains "lora", model_base=MBZUAI/geochat-7B) — the builder then also restores
  `non_lora_trainables.bin`.
- **Sentinel→Cartosat gap**: BigEarthNet is low-res Sentinel; the final ISRO set is
  Cartosat/RISAT. Fine for the internal round; note it in the PPT.
