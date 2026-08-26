# Training — the mandatory fine-tune

The PS requires **at least one component adapted on BigEarthNet.txt**. This folder
produces that adapter + the before/after numbers for your slide.

## Steps
1. **Get the data.** Download BigEarthNet.txt from https://txt.bigearth.net
   (co-registered Sentinel-1 SAR + Sentinel-2 optical + caption/VQA/referring text).
2. **Subset it.** `python training/prepare_data.py --src <path> --out data/subset --n 3000 --task vqa`
   → writes `data/subset/train.jsonl` + `val.jsonl`. Keep it small (a few k) for speed.
3. **Fine-tune.** On a GPU (Kaggle/Colab/college cluster):
   `python training/lora_finetune.py --data data/subset --base MBZUAI/GeoChat --out models/lora-geochat`
4. **Wire it in.** Set `LORA_ADAPTER=models/lora-geochat` in your environment so the
   GeoChat tool loads it when `SATQUERY_MOCK=0`.
5. **Record numbers.** The script prints `BEFORE: x   AFTER: y` — that table is your
   "we adapted it, we didn't wrap GPT" proof.

## Notes
- `bitsandbytes` 4-bit is easiest on Linux/WSL2 (not native Windows).
- If GeoChat LoRA is too heavy in the time you have, the safe fallback is to LoRA a
  **ViT / RemoteCLIP classification head** on BigEarthNet land-cover labels — same
  requirement satisfied, faster to train. Swap `--base` and the dataset accordingly.
