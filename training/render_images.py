"""
Step 2 — Render RGB PNGs from the BigEarthNet v2.0 LMDB.

GeoChat's vision encoder (CLIP-L, interpolated to 504px) wants ordinary 3-band
RGB images. BigEarthNet stores 12-band Sentinel-2 reflectance in an LMDB of
safetensors. This script reads the S2 bands B04/B03/B02 (red/green/blue) for the
exact patch_ids used by your train/val subset, applies a 2–98 percentile stretch
to 8-bit, and writes one PNG per patch into an image_folder that the trainer and
inference both consume.

Only the patches referenced by train.jsonl / val.jsonl are rendered, so you can
work from a SMALL BigEarthNet sample — you do NOT need the full archive.

Usage (on Kaggle or locally, once you have the LMDB):
    python training/render_images.py \
        --lmdb  Encoded-BigEarthNet \
        --jsonl data/subset/train.jsonl data/subset/val.jsonl \
        --out   data/images --size 512

Requires: lmdb, safetensors, numpy, Pillow  (all light; no torch needed).
"""
from __future__ import annotations
import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image

try:
    import lmdb
    from safetensors.numpy import load as safetensor_load
except Exception as e:  # pragma: no cover
    raise SystemExit(
        "This script needs `lmdb` and `safetensors`. Install them in your env "
        "(they are also used by BigEarthNet.txt's datamodule). Original error: " + str(e)
    )

RGB_BANDS = ["B04", "B03", "B02"]  # red, green, blue


def collect_patch_ids(jsonl_paths: list[Path]) -> list[str]:
    ids: list[str] = []
    seen: set[str] = set()
    for p in jsonl_paths:
        with open(p, "r", encoding="utf-8") as f:
            for line in f:
                if not line.strip():
                    continue
                pid = json.loads(line)["patch_id"]
                if pid not in seen:
                    seen.add(pid)
                    ids.append(pid)
    return ids


def stretch_to_uint8(bands: list[np.ndarray]) -> np.ndarray:
    """Per-channel 2–98 percentile stretch -> HxWx3 uint8."""
    chans = []
    for b in bands:
        b = b.astype(np.float32)
        lo, hi = np.percentile(b, 2), np.percentile(b, 98)
        hi = hi if hi > lo else lo + 1.0
        chans.append(np.clip((b - lo) / (hi - lo), 0, 1))
    rgb = np.stack(chans, axis=-1)          # H, W, 3
    return (rgb * 255).astype(np.uint8)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--lmdb", required=True, help="Path to Encoded-BigEarthNet LMDB dir")
    ap.add_argument("--jsonl", nargs="+", required=True,
                    help="One or more *.jsonl from prepare_data.py")
    ap.add_argument("--out", default="data/images")
    ap.add_argument("--size", type=int, default=512, help="Output PNG side (px)")
    args = ap.parse_args()

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    ids = collect_patch_ids([Path(p) for p in args.jsonl])
    print(f"Patches to render: {len(ids):,}")

    env = lmdb.open(args.lmdb, readonly=True, lock=False, meminit=False, readahead=True)
    made, missing = 0, 0
    with env.begin(write=False, buffers=True) as txn:
        for i, pid in enumerate(ids):
            dst = out / f"{pid}.png"
            if dst.exists():
                made += 1
                continue
            raw = txn.get(pid.encode())
            if raw is None:
                missing += 1
                continue
            data = safetensor_load(bytes(raw))          # {band_name: HxW array}
            try:
                bands = [np.asarray(data[b]) for b in RGB_BANDS]
            except KeyError:
                missing += 1
                continue
            img = Image.fromarray(stretch_to_uint8(bands))
            if args.size:
                img = img.resize((args.size, args.size), Image.BILINEAR)
            img.save(dst)
            made += 1
            if (i + 1) % 500 == 0:
                print(f"  {i + 1:,}/{len(ids):,} rendered")

    env.close()
    print(f"Done. Wrote/kept {made:,} PNGs to {out}. Missing patches: {missing:,}")
    if missing:
        print("NOTE: missing patches are ones not in your LMDB sample — that's fine, "
              "convert_to_llava.py will drop records without a rendered image.")


if __name__ == "__main__":
    main()
