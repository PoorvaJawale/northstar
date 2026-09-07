"""
Phase 1.3 — Change tool: bi-temporal change-VQA + change map.

Takes TWO co-located images from different dates and reports what changed.
Real path uses classical **Change Vector Analysis (CVA)**: per-pixel spectral
difference magnitude between the two dates, Otsu-thresholded into a change mask —
no GPU, no training, computed from the actual pixels. MOCK path (MOCK_MODE) keeps
the old synthetic blob for GPU-less smoke tests.
"""
from __future__ import annotations
from typing import Any

import numpy as np

from .base import Tool
from ._render import render_mask, resize_to, otsu_threshold
from ..schemas import ToolResult, Evidence, Task
from .. import config


def _to3(arr: np.ndarray) -> np.ndarray:
    a = arr.astype(np.float32)
    if a.ndim == 2:
        a = a[..., None]
    return a[..., :3] if a.shape[2] >= 3 else np.repeat(a[..., :1], 3, axis=2)


def _norm_pair(x: np.ndarray, y: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Normalise two images with a SHARED per-channel 2-98% stretch, so that
    unchanged pixels map to the same value in both and cancel in the difference."""
    x3, y3 = _to3(x), _to3(y)
    ox, oy = np.empty_like(x3), np.empty_like(y3)
    for i in range(3):
        both = np.concatenate([x3[..., i].ravel(), y3[..., i].ravel()])
        lo, hi = np.percentile(both, 2), np.percentile(both, 98)
        hi = hi if hi > lo else lo + 1.0
        ox[..., i] = np.clip((x3[..., i] - lo) / (hi - lo), 0, 1)
        oy[..., i] = np.clip((y3[..., i] - lo) / (hi - lo), 0, 1)
    return ox, oy


def _resize_raw(arr: np.ndarray, hw: tuple[int, int]) -> np.ndarray:
    from PIL import Image
    h, w = hw
    a = _to3(arr)
    if a.shape[0] == h and a.shape[1] == w:
        return a
    im = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).resize((w, h))
    return np.asarray(im).astype(np.float32)


def _quadrant(cy: float, cx: float, h: int, w: int) -> str:
    v = "north" if cy < h / 3 else ("south" if cy > 2 * h / 3 else "")
    hor = "west" if cx < w / 3 else ("east" if cx > 2 * w / 3 else "")
    label = (v + ("-" if v and hor else "") + hor).strip("-")
    return f"the {label}" if label else "the centre"


class ChangeTool(Tool):
    name = "change"
    tasks = ["change_vqa", "change_map"]

    def __init__(self) -> None:
        pass

    def run(self, task: Task, images: list[np.ndarray], query: str,
            params: dict[str, Any] | None = None) -> ToolResult:
        params = params or {}
        if config.MOCK_MODE:
            return self._mock(task, images, query, params)
        if len(images) < 2:
            return ToolResult(
                text="Change analysis needs two images of the same area from two dates.",
                evidence=[], confidence=0.0, tool_name=self.name, params_used=params)
        return self._real(task, images, query, params)

    # ---- REAL classical change detection (CVA + Otsu) --------------------
    def _real(self, task, images, query, params) -> ToolResult:
        self.emit("Aligning the two dates to a common grid")
        h = min(images[0].shape[0], images[1].shape[0])
        w = min(images[0].shape[1], images[1].shape[1])
        a, b = _norm_pair(_resize_raw(images[0], (h, w)), _resize_raw(images[1], (h, w)))

        self.emit("Computing per-pixel change (Change Vector Analysis)")
        mag = np.sqrt(((a - b) ** 2).sum(axis=2) / 3.0)          # 0..1 change magnitude
        thresh, sep = otsu_threshold(mag)
        mask = (mag >= thresh).astype(np.float32)
        pct = float(mask.mean() * 100)
        self.emit("Thresholding the change map (Otsu)",
                  threshold=round(thresh, 3), changed_pct=round(pct, 2))

        ys, xs = np.where(mask > 0)
        where = _quadrant(float(ys.mean()), float(xs.mean()), h, w) if len(ys) else "the scene"

        # direction: is the changed region brighter (new built-up/bare) or darker
        # (vegetation/water gain) in the later image?
        ga, gb = a.mean(axis=2), b.mean(axis=2)
        da = float(ga[mask > 0].mean()) if len(ys) else 0.0
        db = float(gb[mask > 0].mean()) if len(ys) else 0.0
        if db > da + 0.03:
            direction, interp = "brighter", "consistent with new built-up or bare ground"
        elif db < da - 0.03:
            direction, interp = "darker", "consistent with vegetation or water gain"
        else:
            direction, interp = "similar in brightness", "a textural / mixed change"

        conf = round(float(np.clip(0.6 + 0.35 * sep, 0.5, 0.95)), 3)
        self.emit("Rendering the change overlay", location=where, direction=direction)
        ev = Evidence(kind="change_map", label=f"change (~{pct:.0f}%)",
                      image_b64=render_mask(images[0], mask),
                      data={"changed_pct": round(pct, 2), "threshold": round(thresh, 3),
                            "location": where, "direction": direction})

        if task == "change_map":
            text = (f"Change map generated: about {pct:.1f}% of the scene changed, "
                    f"concentrated in {where}.")
        else:
            ql = query.lower()
            if pct < 2:
                text = (f"Little to no significant change detected between the two dates "
                        f"(~{pct:.1f}% of the scene).")
            elif any(k in ql for k in ("increase", "decrease", "more", "less",
                                       "expand", "grow", "unchanged")):
                verdict = ("increased" if direction == "brighter"
                           else "decreased" if direction == "darker"
                           else "changed (direction unclear)")
                text = (f"Change detected: the built-up / bare area appears to have {verdict} "
                        f"(~{pct:.1f}% of the scene changed, mainly in {where}).")
            else:
                text = (f"About {pct:.1f}% of the scene changed between the two dates, "
                        f"mainly in {where}. The changed areas are {direction} in the later "
                        f"image, {interp}.")
        return ToolResult(text=text, evidence=[ev], confidence=conf,
                          tool_name=self.name, params_used=params)

    # ---- MOCK inference (MOCK_MODE only) ---------------------------------
    def _mock(self, task, images, query, params) -> ToolResult:
        a = images[0]
        h, w = a.shape[0], a.shape[1]
        self.emit("[MOCK] Comparing the two dates pixel-by-pixel")
        yy, xx = np.mgrid[0:h, 0:w]
        cy, cx = h * 0.3, w * 0.7
        mask = (((xx - cx) ** 2 + (yy - cy) ** 2) < (min(h, w) * 0.18) ** 2).astype(float)
        pct = float(mask.mean() * 100)
        ev = Evidence(kind="change_map", label="change mask",
                      image_b64=render_mask(a, mask),
                      data={"changed_fraction_pct": round(pct, 2)})
        if task == "change_map":
            text = f"[MOCK] Change map generated: ~{pct:.1f}% of the scene changed."
        else:
            text = (f"[MOCK] Built-up area INCREASED between the two dates, "
                    f"mainly in the north-east (~{pct:.1f}% of the scene).")
        return ToolResult(text=text, evidence=[ev], confidence=0.77,
                          tool_name=self.name, params_used=params)
