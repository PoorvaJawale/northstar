"""Download a Sen1Floods11 subset for SAR flood segmentation training.

Sen1Floods11 is hosted in a public Google Cloud Storage bucket. The full bucket
is roughly 14 GB; this script downloads only the split CSV files and a bounded
number of Sentinel-1/label chips so a laptop can start training quickly.

Examples:
    python training/download_sen1floods11.py --max-train 80 --max-val 20
    python training/download_sen1floods11.py --all
"""
from __future__ import annotations

import argparse
import csv
from pathlib import Path
from urllib.parse import quote

import requests
from tqdm import tqdm


BASE = "https://storage.googleapis.com/sen1floods11/v1.1"
SPLITS = {
    "train": "splits/flood_handlabeled/flood_train_data.csv",
    "val": "splits/flood_handlabeled/flood_valid_data.csv",
    "test": "splits/flood_handlabeled/flood_test_data.csv",
}
S1_DIR = "data/flood_events/HandLabeled/S1Hand"
LABEL_DIR = "data/flood_events/HandLabeled/LabelHand"


def download(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size > 0:
        return
    with requests.get(url, stream=True, timeout=60) as r:
        r.raise_for_status()
        total = int(r.headers.get("content-length") or 0)
        with dest.open("wb") as f, tqdm(total=total, unit="B", unit_scale=True,
                                        desc=dest.name) as bar:
            for chunk in r.iter_content(chunk_size=1024 * 1024):
                if chunk:
                    f.write(chunk)
                    bar.update(len(chunk))


def read_pairs(csv_path: Path, limit: int | None) -> list[tuple[str, str]]:
    pairs: list[tuple[str, str]] = []
    with csv_path.open("r", encoding="utf-8") as f:
        sample = f.read(2048)
        f.seek(0)
        has_header = "S1" in sample.splitlines()[0] and "," in sample.splitlines()[0] \
            and not sample.splitlines()[0].endswith(".tif")
        reader = csv.DictReader(f) if has_header else csv.reader(f)
        for row in reader:
            if isinstance(row, dict):
                s1 = next((v for k, v in row.items() if k and "s1" in k.lower() and v), None)
                label = next((v for k, v in row.items() if k and "label" in k.lower() and v), None)
            else:
                s1 = row[0] if len(row) > 0 else None
                label = row[1] if len(row) > 1 else None
            if not s1:
                continue
            s1_name = Path(s1).name
            label_name = Path(label).name if label else s1_name.replace("_S1Hand.tif", "_LabelHand.tif")
            pairs.append((s1_name, label_name))
            if limit is not None and len(pairs) >= limit:
                break
    return pairs


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="data/sen1floods11")
    ap.add_argument("--max-train", type=int, default=80)
    ap.add_argument("--max-val", type=int, default=20)
    ap.add_argument("--all", action="store_true", help="download every chip in train/val")
    args = ap.parse_args()

    root = Path(args.out)
    split_dir = root / "splits"
    for name, rel in SPLITS.items():
        download(f"{BASE}/{rel}", split_dir / Path(rel).name)

    limits = {
        "train": None if args.all else args.max_train,
        "val": None if args.all else args.max_val,
    }
    for split, limit in limits.items():
        csv_path = split_dir / Path(SPLITS[split]).name
        for s1_name, label_name in read_pairs(csv_path, limit):
            download(f"{BASE}/{S1_DIR}/{quote(s1_name)}", root / "S1Hand" / s1_name)
            download(f"{BASE}/{LABEL_DIR}/{quote(label_name)}", root / "LabelHand" / label_name)

    print(f"Downloaded Sen1Floods11 subset to {root.resolve()}")


if __name__ == "__main__":
    main()
