"""Train/export a Sentinel-1 SAR flood segmentation UNet.

Input dataset layout:
    data/sen1floods11/
      S1Hand/*_S1Hand.tif          # 2-band VV/VH Sentinel-1 chips
      LabelHand/*_LabelHand.tif    # flood/water mask, 1 = water/flood

Output:
    models/flood_unet_sentinel1.onnx

This is intentionally compact and CPU-capable for a laptop demo, while still
being a real supervised SAR flood segmentation model.
"""
from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import torch
from torch import nn
from torch.utils.data import DataLoader, Dataset
from tqdm import tqdm


def read_tif(path: Path) -> np.ndarray:
    try:
        import tifffile

        arr = tifffile.imread(path)
    except Exception:
        from PIL import Image

        arr = np.asarray(Image.open(path))
    arr = np.asarray(arr)
    if arr.ndim == 3 and arr.shape[0] <= 16:
        arr = np.transpose(arr, (1, 2, 0))
    if arr.ndim == 2:
        arr = arr[..., None]
    return arr


def norm_s1(arr: np.ndarray) -> np.ndarray:
    x = arr.astype(np.float32)
    x = x[..., :2] if x.shape[-1] >= 2 else np.repeat(x[..., :1], 2, axis=-1)
    x = np.nan_to_num(x, nan=-50.0, posinf=1.0, neginf=-50.0)
    x = np.clip(x, -50.0, 1.0)
    x = (x + 50.0) / 51.0
    return np.transpose(x, (2, 0, 1)).astype(np.float32)


class FloodDataset(Dataset):
    def __init__(self, root: Path) -> None:
        self.root = root
        self.s1_paths = sorted((root / "S1Hand").glob("*_S1Hand.tif"))
        if not self.s1_paths:
            raise FileNotFoundError(f"No S1Hand chips found under {root}")

    def __len__(self) -> int:
        return len(self.s1_paths)

    def __getitem__(self, idx: int):
        s1_path = self.s1_paths[idx]
        label_path = self.root / "LabelHand" / s1_path.name.replace("_S1Hand.tif", "_LabelHand.tif")
        x = norm_s1(read_tif(s1_path))
        y = read_tif(label_path)[..., 0]
        y = np.where(y < 0, 0, y).astype(np.float32)
        y = (y > 0).astype(np.float32)[None]
        return torch.from_numpy(x), torch.from_numpy(y)


class ConvBlock(nn.Module):
    def __init__(self, cin: int, cout: int) -> None:
        super().__init__()
        self.net = nn.Sequential(
            nn.Conv2d(cin, cout, 3, padding=1),
            nn.BatchNorm2d(cout),
            nn.ReLU(inplace=True),
            nn.Conv2d(cout, cout, 3, padding=1),
            nn.BatchNorm2d(cout),
            nn.ReLU(inplace=True),
        )

    def forward(self, x):
        return self.net(x)


class SmallUNet(nn.Module):
    def __init__(self) -> None:
        super().__init__()
        self.e1 = ConvBlock(2, 32)
        self.e2 = ConvBlock(32, 64)
        self.e3 = ConvBlock(64, 128)
        self.pool = nn.MaxPool2d(2)
        self.u2 = nn.ConvTranspose2d(128, 64, 2, stride=2)
        self.d2 = ConvBlock(128, 64)
        self.u1 = nn.ConvTranspose2d(64, 32, 2, stride=2)
        self.d1 = ConvBlock(64, 32)
        self.out = nn.Conv2d(32, 1, 1)

    def forward(self, x):
        e1 = self.e1(x)
        e2 = self.e2(self.pool(e1))
        e3 = self.e3(self.pool(e2))
        d2 = self.d2(torch.cat([self.u2(e3), e2], dim=1))
        d1 = self.d1(torch.cat([self.u1(d2), e1], dim=1))
        return self.out(d1)


def dice_score(logits, target, eps=1e-6) -> float:
    pred = (torch.sigmoid(logits) > 0.5).float()
    inter = (pred * target).sum()
    union = pred.sum() + target.sum()
    return float((2 * inter + eps) / (union + eps))


def export_onnx(model: nn.Module, out: Path, device: torch.device) -> None:
    out.parent.mkdir(parents=True, exist_ok=True)
    model.eval()
    dummy = torch.randn(1, 2, 512, 512, device=device)
    torch.onnx.export(
        model, dummy, out,
        input_names=["sar"], output_names=["flood_logits"],
        dynamic_axes={"sar": {0: "batch", 2: "height", 3: "width"},
                      "flood_logits": {0: "batch", 2: "height", 3: "width"}},
        opset_version=17,
        dynamo=False,
    )


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default="data/sen1floods11")
    ap.add_argument("--out", default="models/flood_unet_sentinel1.onnx")
    ap.add_argument("--epochs", type=int, default=8)
    ap.add_argument("--batch-size", type=int, default=2)
    ap.add_argument("--lr", type=float, default=1e-3)
    args = ap.parse_args()

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    ds = FloodDataset(Path(args.data))
    loader = DataLoader(ds, batch_size=args.batch_size, shuffle=True, num_workers=0)
    model = SmallUNet().to(device)
    loss_fn = nn.BCEWithLogitsLoss(pos_weight=torch.tensor([2.0], device=device))
    opt = torch.optim.AdamW(model.parameters(), lr=args.lr)

    for epoch in range(1, args.epochs + 1):
        model.train()
        losses, dices = [], []
        for x, y in tqdm(loader, desc=f"epoch {epoch}/{args.epochs}"):
            x, y = x.to(device), y.to(device)
            opt.zero_grad(set_to_none=True)
            logits = model(x)
            loss = loss_fn(logits, y)
            loss.backward()
            opt.step()
            losses.append(float(loss.detach().cpu()))
            dices.append(dice_score(logits.detach(), y))
        print(f"epoch={epoch} loss={np.mean(losses):.4f} dice={np.mean(dices):.4f}")

    export_onnx(model, Path(args.out), device)
    print(f"Exported ONNX model to {Path(args.out).resolve()}")


if __name__ == "__main__":
    main()
