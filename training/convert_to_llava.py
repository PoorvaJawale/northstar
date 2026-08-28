"""
Step 4 — Convert prepare_data.py output (jsonl) into GeoChat/LLaVA training JSON.

GeoChat's trainer (geochat/train/train.py -> LazySupervisedDataset) expects a
JSON *list* where each item is:
    {
      "id": "<unique>",
      "image": "<filename inside --image_folder>",
      "conversations": [
        {"from": "human", "value": "<image>\n<question>"},
        {"from": "gpt",   "value": "<answer>"}
      ]
    }

This reads train.jsonl / val.jsonl, keeps only records whose rendered PNG exists
(so it works with a partial BigEarthNet sample), and writes train_llava.json /
val_llava.json next to them.

Usage:
    python training/convert_to_llava.py \
        --subset data/subset --images data/images
"""
from __future__ import annotations
import argparse
import json
from pathlib import Path

IMAGE_PLACEHOLDER = "<image>"


def convert(jsonl_path: Path, images_dir: Path, out_path: Path) -> tuple[int, int]:
    kept, dropped = 0, 0
    items = []
    with open(jsonl_path, "r", encoding="utf-8") as f:
        for idx, line in enumerate(f):
            if not line.strip():
                continue
            rec = json.loads(line)
            pid = rec["patch_id"]
            fname = f"{pid}.png"
            if not (images_dir / fname).exists():
                dropped += 1
                continue
            question = str(rec["question"]).strip()
            answer = str(rec["answer"]).strip()
            items.append({
                "id": f"{pid}-{idx}",
                "image": fname,
                "conversations": [
                    {"from": "human", "value": f"{IMAGE_PLACEHOLDER}\n{question}"},
                    {"from": "gpt", "value": answer},
                ],
            })
            kept += 1
    json.dump(items, open(out_path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    return kept, dropped


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--subset", default="data/subset", help="dir with train.jsonl / val.jsonl")
    ap.add_argument("--images", default="data/images", help="dir with rendered <patch_id>.png")
    args = ap.parse_args()

    subset = Path(args.subset)
    images = Path(args.images)

    for split in ("train", "val"):
        src = subset / f"{split}.jsonl"
        if not src.exists():
            print(f"skip {src} (not found)")
            continue
        out = subset / f"{split}_llava.json"
        kept, dropped = convert(src, images, out)
        print(f"{split}: kept {kept:,}  dropped {dropped:,} (no image)  -> {out}")

    print("\nUse these with the trainer:")
    print(f"  --data_path {subset / 'train_llava.json'}")
    print(f"  --image_folder {images}")


if __name__ == "__main__":
    main()
