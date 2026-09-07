"""Helpers to render evidence overlays (boxes / masks / change maps) to base64 PNG.

Used by both the mock tools (to produce something real to look at) and by the
real tools (to visualise genuine model outputs). Pure Pillow/numpy — no GPU.
"""
from __future__ import annotations
import base64
import io as _io

import numpy as np
from PIL import Image, ImageDraw


def _base_rgb(arr: np.ndarray) -> Image.Image:
    a = arr.astype(np.float32)
    if a.ndim == 2:
        a = a[..., None]
    disp = a[..., :3] if a.shape[2] >= 3 else np.repeat(a[..., :1], 3, axis=2)
    lo, hi = np.percentile(disp, 2), np.percentile(disp, 98)
    hi = hi if hi > lo else lo + 1.0
    disp = np.clip((disp - lo) / (hi - lo), 0, 1)
    return Image.fromarray((disp * 255).astype(np.uint8)).convert("RGB")


def _encode(img: Image.Image, max_side: int = 640) -> str:
    img = img.copy()
    img.thumbnail((max_side, max_side))
    buf = _io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("ascii")


def render_bbox(arr: np.ndarray, box: list[float], label: str = "") -> str:
    """box = [x0, y0, x1, y1] in pixel coords."""
    img = _base_rgb(arr)
    d = ImageDraw.Draw(img)
    d.rectangle(box, outline=(255, 90, 40), width=max(2, img.width // 150))
    if label:
        d.text((box[0] + 4, box[1] + 4), label, fill=(255, 90, 40))
    return _encode(img)


def to_norm_rgb(arr: np.ndarray) -> np.ndarray:
    """arr -> float32 HxWx3 in [0,1], per-channel 2-98% contrast stretch."""
    a = arr.astype(np.float32)
    if a.ndim == 2:
        a = a[..., None]
    a = a[..., :3] if a.shape[2] >= 3 else np.repeat(a[..., :1], 3, axis=2)
    out = np.empty(a.shape[:2] + (3,), dtype=np.float32)
    for i in range(3):
        c = a[..., i]
        lo, hi = np.percentile(c, 2), np.percentile(c, 98)
        hi = hi if hi > lo else lo + 1.0
        out[..., i] = np.clip((c - lo) / (hi - lo), 0, 1)
    return out


def resize_to(arr: np.ndarray, hw: tuple[int, int]) -> np.ndarray:
    """Resize a float[0,1] HxWx3 (or HxW) array to (h, w)."""
    h, w = hw
    if arr.shape[0] == h and arr.shape[1] == w:
        return arr
    mode_arr = (np.clip(arr, 0, 1) * 255).astype(np.uint8)
    im = Image.fromarray(mode_arr)
    im = im.resize((w, h))
    return np.asarray(im).astype(np.float32) / 255.0


def otsu_threshold(x: np.ndarray) -> tuple[float, float]:
    """Otsu threshold for values in [0,1]. Returns (threshold, separability 0..1)."""
    hist, edges = np.histogram(x.ravel(), bins=256, range=(0.0, 1.0))
    hist = hist.astype(np.float64)
    total = hist.sum()
    if total == 0:
        return 0.5, 0.0
    p = hist / total
    omega = np.cumsum(p)
    mids = (edges[:-1] + edges[1:]) / 2
    mu = np.cumsum(p * mids)
    mu_t = mu[-1]
    denom = omega * (1 - omega)
    denom[denom == 0] = 1e-12
    sigma_b = (mu_t * omega - mu) ** 2 / denom
    idx = int(np.nanargmax(sigma_b))
    sep = float(np.clip(sigma_b[idx] / (x.var() + 1e-9), 0, 1))
    return float(mids[idx]), sep


def render_boxes(arr: np.ndarray, boxes: list[list[float]], label: str = "") -> str:
    """Draw zero or more [x0,y0,x1,y1] pixel boxes on the image (one overlay).
    With an empty list it just returns the scene, so grounding always has a
    picture to show as evidence."""
    img = _base_rgb(arr)
    d = ImageDraw.Draw(img)
    wpx = max(2, img.width // 150)
    for box in boxes:
        d.rectangle(box, outline=(255, 90, 40), width=wpx)
    if label and boxes:
        d.text((boxes[0][0] + 4, boxes[0][1] + 4), label, fill=(255, 90, 40))
    return _encode(img)


def render_mask(arr: np.ndarray, mask: np.ndarray, color=(45, 212, 191)) -> str:
    """Overlay a boolean/float mask (H,W) on the image."""
    img = _base_rgb(arr)
    m = np.asarray(mask).astype(np.float32)
    if m.max() > 1:
        m = m / m.max()
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    mimg = Image.fromarray((m * 160).astype(np.uint8)).resize(img.size)
    tint = Image.new("RGBA", img.size, color + (0,))
    tint.putalpha(mimg)
    out = Image.alpha_composite(img.convert("RGBA"), tint).convert("RGB")
    return _encode(out)
