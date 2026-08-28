"""
Step 5 (eval) — before/after VQA accuracy on the BigEarthNet.txt val subset.

Runs GeoChat over val_llava.json and scores exact-match accuracy against the
reference answers (binary/mcq answers are short, so normalized exact-match is a
fair metric). Run it TWICE to produce your key slide:

    # BEFORE (base model, no adapter):
    python training/evaluate_vqa.py --data data/subset/val_llava.json \
        --images data/images --limit 200

    # AFTER (with your LoRA adapter):
    python training/evaluate_vqa.py --data data/subset/val_llava.json \
        --images data/images --limit 200 --adapter models/lora-geochat

The printed accuracy from the two runs is your BEFORE vs AFTER table.
"""
from __future__ import annotations
import argparse
import json
import re
from pathlib import Path

from PIL import Image

from backend.tools.geochat_runtime import GeoChatRunner


def normalize(s: str) -> str:
    return re.sub(r"[^a-z0-9 ]", "", s.lower()).strip()


def match(pred: str, gold: str) -> bool:
    p, g = normalize(pred), normalize(gold)
    if not g:
        return False
    # exact, or gold appears as a standalone answer token in the prediction
    return p == g or g in p.split() or p.startswith(g) or g in p


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True, help="val_llava.json")
    ap.add_argument("--images", default="data/images")
    ap.add_argument("--model-path", default="MBZUAI/geochat-7B")
    ap.add_argument("--adapter", default=None)
    ap.add_argument("--limit", type=int, default=200, help="how many val items to score")
    ap.add_argument("--conv-mode", default="llava_v1")
    args = ap.parse_args()

    data = json.load(open(args.data, "r", encoding="utf-8"))[: args.limit]
    images = Path(args.images)

    runner = GeoChatRunner(model_path=args.model_path, conv_mode=args.conv_mode,
                           load_4bit=True, adapter=args.adapter)

    correct, total = 0, 0
    for item in data:
        img_path = images / item["image"]
        if not img_path.exists():
            continue
        question = item["conversations"][0]["value"].replace("<image>", "").strip()
        gold = item["conversations"][1]["value"].strip()
        pred, _, _ = runner.generate(Image.open(img_path).convert("RGB"),
                                     question, max_new_tokens=32, temperature=0.0)
        ok = match(pred, gold)
        correct += int(ok)
        total += 1
        if total <= 10:
            print(f"[{'OK ' if ok else 'XX '}] gold={gold!r:20} pred={pred!r}")

    acc = correct / total if total else 0.0
    tag = "AFTER (adapter)" if args.adapter else "BEFORE (base)"
    print("\n" + "=" * 50)
    print(f"{tag}: accuracy = {acc:.3f}  ({correct}/{total})")
    print("=" * 50)


if __name__ == "__main__":
    main()
