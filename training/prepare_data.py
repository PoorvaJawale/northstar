"""
Phase 2.1 — Prepare a SMALL stratified subset of BigEarthNet.txt for the LoRA
fine-tune. BigEarthNet.txt has ~464k pairs / 9.6M annotations — DO NOT train on
all of it for the internal round. A few thousand balanced samples is enough to
show a real before/after gain in hours.

This is a TEMPLATE — adapt the paths/fields to the actual BigEarthNet.txt
download layout from https://txt.bigearth.net once your Data person confirms it.
"""
from __future__ import annotations
import argparse
import json
import random
from pathlib import Path


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True, help="path to BigEarthNet.txt annotations")
    ap.add_argument("--out", default="data/subset", help="output dir")
    ap.add_argument("--n", type=int, default=3000, help="samples to keep")
    ap.add_argument("--task", default="vqa", choices=["vqa", "caption", "grounding"])
    args = ap.parse_args()

    out = Path(args.out); out.mkdir(parents=True, exist_ok=True)

    # === YOUR INTERVENTION: load real annotations here ===================
    # records = load_bigearthnet_txt(args.src, task=args.task)
    # Each record should look like:
    #   {"image": "<path or [optical,sar]>", "question": "...", "answer": "..."}
    # For captioning: {"image": ..., "caption": "..."}
    # For grounding:  {"image": ..., "expression": "...", "box": [x0,y0,x1,y1]}
    raise SystemExit(
        "prepare_data.py is a template — wire it to the real BigEarthNet.txt "
        "layout (see INTERVENTION.md #5). Below is the stratified-sampling shape."
    )

    # Reference sampling logic (stratify by land-cover label for balance):
    # by_label = defaultdict(list)
    # for r in records: by_label[r["label"]].append(r)
    # per = max(1, args.n // len(by_label))
    # subset = []
    # for lbl, rows in by_label.items():
    #     random.shuffle(rows); subset += rows[:per]
    # random.shuffle(subset)
    # split = int(len(subset) * 0.9)
    # (out / "train.jsonl").write_text("\n".join(json.dumps(r) for r in subset[:split]))
    # (out / "val.jsonl").write_text("\n".join(json.dumps(r) for r in subset[split:]))


if __name__ == "__main__":
    main()
