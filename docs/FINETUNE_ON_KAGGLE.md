# Fine-Tuning on Kaggle — Step-by-Step (No GPU Laptop Needed)

**For:** the teammate running the GeoChat fine-tune.
**Good news:** your laptop does **not** need an NVIDIA graphics card. Kaggle *lends*
you a cloud NVIDIA GPU (a **Tesla T4, 16 GB**) that runs inside your browser, free
(~30 GPU-hours/week). Any basic laptop works — you just need a **browser + internet**.

**What you'll produce:**
1. A fine-tuned **LoRA adapter** (`lora-geochat.zip`) — send this to the team lead.
2. A **before → after accuracy** result (a key slide for the PPT).

> This is the friendly walkthrough. The deeper technical reference (and the tricky
> "get the images" part) is in [`FINE_TUNING.md`](FINE_TUNING.md).

---

## Step 1 — Set up Kaggle (5 minutes)
1. Go to **https://www.kaggle.com** → **Register** (free).
2. In **Settings**, **verify your phone number**. Kaggle requires this to turn on the
   free GPU and Internet inside notebooks.
3. Click **Create → New Notebook**.
4. In the right-hand panel: **Settings → Accelerator → "GPU T4 x1"**, and set
   **Internet → On**.
5. You run a cell by clicking it and pressing **Shift + Enter**.

> If you ever see "GPU is not available", re-check step 4 (accelerator = GPU T4) and
> that your phone is verified.

---

## Step 2 — Clone the project and GeoChat  *(Cell 1)*
```bash
!git clone https://github.com/PoorvaJawale/northstar.git
!git clone https://github.com/mbzuai-oryx/GeoChat.git
%cd /kaggle/working/northstar
```

## Step 3 — Install the exact libraries  *(Cell 2)*
```bash
!pip -q install "transformers==4.31.0" "accelerate==0.27.2" "huggingface-hub==0.24.6" \
    "bitsandbytes==0.50.1" "peft==0.20.0" "sentencepiece==0.2.2" "einops==0.6.1" "timm==0.6.13" \
    pyarrow pandas lmdb safetensors
!pip -q install -e /kaggle/working/GeoChat --no-deps
```
> ⚠️ These exact versions are required — GeoChat needs the older `transformers 4.31.0`.
> Do **not** run `pip install -U ...` on these.

## Step 4 — Check the GPU is there  *(Cell 3)*
```python
import sys
sys.path.insert(0, "/kaggle/working/GeoChat")
import geochat
import torch
print("geochat OK · GPU:", torch.cuda.get_device_name(0))
```
You should see something like **`GPU: Tesla T4`**. That's your cloud NVIDIA GPU. 🎉

## Step 5 — Get the dataset text file  *(Cell 4)*
```bash
!git clone https://huggingface.co/datasets/BIFOLD-BigEarthNetv2-0/BigEarthNet.txt /kaggle/working/BENtxt
```

## Step 6 — Get the satellite images (the one tricky part)
The text file has the questions/answers, but training also needs the actual
**Sentinel satellite image pixels**, packaged as an "LMDB". Try in this order:

- **Easiest:** on Kaggle, click **"+ Add Data"** and search **`BigEarthNet v2.0`**
  (or `reBEN`). If someone has uploaded the images or a ready-made LMDB, attach it —
  and you can skip the encoding.
- **Otherwise:** download a small sample from **https://bigearth.net** and convert it
  with the `rico-hdl` tool. Full commands are in
  [`FINE_TUNING.md`](FINE_TUNING.md) (Steps 2–3).
- **If you get stuck here → message the team lead.** This is the normal sticking
  point; don't spend hours fighting it alone.

You need the images available at a path like `/kaggle/working/Encoded-BigEarthNet`.

## Step 7 — Build the training data  *(Cell 5)*
```bash
!python training/prepare_data.py --src /kaggle/working/BENtxt/BigEarthNet.txt.parquet --out data/subset --n 3000 --val-n 600
!python training/render_images.py --lmdb /kaggle/working/Encoded-BigEarthNet --jsonl data/subset/train.jsonl data/subset/val.jsonl --out data/images --size 512
!python training/convert_to_llava.py --subset data/subset --images data/images
```

## Step 8 — Fine-tune (this uses the GPU)  *(Cell 6)*
```bash
!python -m geochat.train.train \
  --model_name_or_path MBZUAI/geochat-7B --version v1 \
  --data_path data/subset/train_llava.json --image_folder data/images \
  --vision_tower openai/clip-vit-large-patch14-336 \
  --mm_use_im_start_end False --mm_use_im_patch_token False --image_aspect_ratio pad \
  --bits 4 --lora_enable True --lora_r 16 --lora_alpha 32 \
  --bf16 False --fp16 True --tf32 False --gradient_checkpointing True \
  --per_device_train_batch_size 1 --gradient_accumulation_steps 16 \
  --num_train_epochs 1 --learning_rate 2e-4 --model_max_length 2048 \
  --output_dir /kaggle/working/lora-geochat --report_to none
```
> **If it says "CUDA out of memory":** change `--model_max_length 2048` to `1536`
> and `--gradient_accumulation_steps 16` to `32`, then re-run this cell.

## Step 9 — Measure before vs after  *(Cell 7)*
```bash
# BEFORE (original model)
!python training/evaluate_vqa.py --data data/subset/val_llava.json --images data/images --limit 200
# AFTER (your fine-tuned adapter)
!python training/evaluate_vqa.py --data data/subset/val_llava.json --images data/images --limit 200 --adapter /kaggle/working/lora-geochat
```
Write down both accuracy numbers (e.g. **BEFORE 0.62 → AFTER 0.78**). That's the result.

## Step 10 — Download the adapter and send it  *(Cell 8)*
```python
import shutil
shutil.make_archive("/kaggle/working/lora-geochat", "zip", "/kaggle/working/lora-geochat")
print("Now download lora-geochat.zip from the Output tab (right panel).")
```
Download **`lora-geochat.zip`** from the notebook's **Output** tab and send it to the
team lead, along with your before/after numbers.

---

## Prefer Google Colab? Same steps.
1. Go to **https://colab.research.google.com** → **New notebook**.
2. **Runtime → Change runtime type → T4 GPU → Save**.
3. Run the exact same cells (2–10) above.
Kaggle is a little steadier for long jobs, but Colab works too.

## Quick troubleshooting
| Problem | Fix |
|---|---|
| "GPU not available" | Settings → Accelerator = GPU T4; verify your phone on Kaggle |
| `pip install rico-hdl` fails | it's a downloadable tool, not a pip package — see FINE_TUNING.md |
| `CUDA out of memory` | `--model_max_length 1536`, `--gradient_accumulation_steps 32` |
| asks for a "wandb" login | make sure the train command has `--report_to none` |
| can't find BigEarthNet images | that's Step 6 — try Kaggle "Add Data" first, else ask the team lead |
| session disconnected | Kaggle stops idle sessions; keep the tab open, or re-run from Cell 1 |

## What your laptop is (and isn't) doing
- Your laptop = just a screen + keyboard for the browser. **No GPU used locally.**
- All the heavy work (model + training) runs on **Kaggle's cloud NVIDIA T4**.
- So a basic laptop, no NVIDIA, Mac, AMD — all totally fine. 👍
