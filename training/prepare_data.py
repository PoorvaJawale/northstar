from __future__ import annotations

import argparse
import json
import random
from pathlib import Path

import pandas as pd


def stratified_sample(df: pd.DataFrame, n: int, seed: int = 42) -> pd.DataFrame:
    """Sample approximately n rows while preserving category proportions."""
    rng = random.Random(seed)

    groups = list(df.groupby("category", dropna=False))
    groups.sort(key=lambda x: str(x[0]))

    total = len(df)
    allocations = []

    for category, group in groups:
        target = max(1, round(n * len(group) / total))
        allocations.append((category, group, target))

    # Correct rounding so total is as close to n as possible.
    while sum(x[2] for x in allocations) > n:
        idx = max(
            range(len(allocations)),
            key=lambda i: allocations[i][2]
        )
        if allocations[idx][2] > 1:
            category, group, target = allocations[idx]
            allocations[idx] = (category, group, target - 1)

    while sum(x[2] for x in allocations) < n:
        idx = max(
            range(len(allocations)),
            key=lambda i: len(allocations[i][1]) - allocations[i][2]
        )
        category, group, target = allocations[idx]
        if target < len(group):
            allocations[idx] = (category, group, target + 1)
        else:
            break

    samples = []

    for category, group, target in allocations:
        if target <= 0:
            continue

        # pandas sample gets reproducible selection.
        samples.append(
            group.sample(
                n=min(target, len(group)),
                random_state=rng.randint(0, 2**32 - 1),
            )
        )

    result = pd.concat(samples, ignore_index=True)
    result = result.sample(
        frac=1,
        random_state=seed,
    ).reset_index(drop=True)

    return result


def to_records(df: pd.DataFrame) -> list[dict]:
    records = []

    for _, row in df.iterrows():
        records.append({
            "image": row["patch_id"],
            "s1_name": row["s1_name"],
            "patch_id": row["patch_id"],
            "question": row["input"],
            "answer": row["output"],
            "type": row["type"],
            "category": row["category"],
        })

    return records


def write_jsonl(path: Path, records: list[dict]) -> None:
    with path.open("w", encoding="utf-8") as f:
        for record in records:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")


def main():
    ap = argparse.ArgumentParser()

    ap.add_argument(
        "--src",
        required=True,
        help="Path to BigEarthNet.txt.parquet",
    )

    ap.add_argument(
        "--out",
        default="data/subset",
        help="Output directory",
    )

    ap.add_argument(
        "--n",
        type=int,
        default=3000,
        help="Number of training annotations",
    )

    ap.add_argument(
        "--val-n",
        type=int,
        default=600,
        help="Number of validation annotations",
    )

    ap.add_argument(
        "--task",
        default="vqa",
        choices=["vqa"],
    )

    ap.add_argument(
        "--seed",
        type=int,
        default=42,
    )

    args = ap.parse_args()

    src = Path(args.src)
    out = Path(args.out)

    if not src.exists():
        raise FileNotFoundError(f"Dataset not found: {src}")

    out.mkdir(parents=True, exist_ok=True)

    columns = [
        "s1_name",
        "patch_id",
        "input",
        "output",
        "type",
        "category",
        "split",
    ]

    print(f"Loading {src}...")
    df = pd.read_parquet(src, columns=columns)

    # Keep only actual VQA examples.
    df = df[
        (df["split"].isin(["train", "validation"]))
        & (df["type"].isin(["binary", "mcq"]))
    ].copy()

    df = df.dropna(
        subset=["input", "output", "category", "patch_id"]
    )

    print(f"Usable VQA annotations: {len(df):,}")

    train_df = df[df["split"] == "train"].copy()
    val_df = df[df["split"] == "validation"].copy()

    print(f"Train pool: {len(train_df):,}")
    print(f"Validation pool: {len(val_df):,}")

    # Stratified sampling by question category.
    train_subset = stratified_sample(
        train_df,
        min(args.n, len(train_df)),
        seed=args.seed,
    )

    val_subset = stratified_sample(
        val_df,
        min(args.val_n, len(val_df)),
        seed=args.seed + 1,
    )

    train_records = to_records(train_subset)
    val_records = to_records(val_subset)

    write_jsonl(out / "train.jsonl", train_records)
    write_jsonl(out / "val.jsonl", val_records)

    print()
    print("Created:")
    print(f"  {out / 'train.jsonl'} -> {len(train_records):,} records")
    print(f"  {out / 'val.jsonl'}   -> {len(val_records):,} records")

    print()
    print("Training category distribution:")
    print(train_subset["category"].value_counts())

    print()
    print("Validation category distribution:")
    print(val_subset["category"].value_counts())


if __name__ == "__main__":
    main()