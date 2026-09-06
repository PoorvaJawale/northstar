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
