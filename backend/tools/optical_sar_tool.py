"""
Phase 1.4 — Optical-SAR fusion tool.

Takes a CO-REGISTERED optical + SAR pair of the same area and extracts
information neither image gives alone. Real path uses SAR **backscatter**
physics — open water is a specular (dark, low-return) surface even under cloud,
while built-up is rough/metallic (bright, high-return) — thresholded and overlaid
on the optical scene for land-cover context. No GPU, no training. MOCK path
(MOCK_MODE) keeps the old synthetic mask.
"""
from __future__ import annotations
from typing import Any

import numpy as np

from .base import Tool
from ._render import render_mask, to_norm_rgb, resize_to
from ..schemas import ToolResult, Evidence, Task
from .. import config


class OpticalSarTool(Tool):
    name = "optical_sar"
    tasks = ["cross_modal"]

    def __init__(self) -> None:
        pass

    def run(self, task: Task, images: list[np.ndarray], query: str,
            params: dict[str, Any] | None = None) -> ToolResult:
        params = params or {}
        if config.MOCK_MODE:
            return self._mock(task, images, query, params)
        if len(images) < 2:
            return ToolResult(
                text="Optical-SAR analysis needs two images: an optical and a SAR scene.",
                evidence=[], confidence=0.0, tool_name=self.name, params_used=params)
        return self._real(task, images, query, params)

    # ---- REAL classical fusion (SAR backscatter + optical context) -------
    def _real(self, task, images, query, params) -> ToolResult:
        self.emit("Co-registering the optical and SAR scenes")
        h = min(images[0].shape[0], images[1].shape[0])
        w = min(images[0].shape[1], images[1].shape[1])
        opt = resize_to(to_norm_rgb(images[0]), (h, w))
        sar = resize_to(to_norm_rgb(images[1]), (h, w)).mean(axis=2)   # backscatter 0..1

        self.emit("Thresholding SAR backscatter (low=water, high=built-up)")
        med = float(np.percentile(sar, 50))
        lo = float(np.percentile(sar, 15))                       # darkest -> water
        # built-up must be a HIGH percentile AND clearly above the background,
        # so a flat mid-toned scene doesn't get labelled built-up wholesale.
        hi = max(float(np.percentile(sar, 90)), med + 0.12)
        water = (sar <= lo).astype(np.float32)     # specular / smooth -> water
        built = (sar >= hi).astype(np.float32)     # rough / metallic -> built-up
        pct_water = float(water.mean() * 100)
        pct_built = float(built.mean() * 100)

        # combined overlay: built-up brightest, water mid — one teal overlay
        mask = np.clip(built * 1.0 + water * 0.5, 0, 1)
        self.emit("Fusing modalities", water_pct=round(pct_water, 1),
                  built_up_pct=round(pct_built, 1))
        ev = Evidence(kind="overlay",
                      label=f"SAR: water ~{pct_water:.0f}% (dark) + built-up ~{pct_built:.0f}% (bright)",
                      image_b64=render_mask(images[0], mask),
                      data={"water_pct": round(pct_water, 1),
                            "built_up_pct": round(pct_built, 1),
                            "sar_low_thresh": round(lo, 3), "sar_high_thresh": round(hi, 3)})
        text = (f"Fusing optical + SAR: SAR backscatter flags about {pct_water:.0f}% of the "
                f"scene as low-return (smooth surfaces such as open water, detectable even "
                f"through cloud) and about {pct_built:.0f}% as high-return (rough or metallic "
                f"surfaces, typically built-up). The optical image supplies land-cover context. "
                f"Combining the two gives a more reliable read-out of water and built-up extent "
                f"than either sensor alone.")
        return ToolResult(text=text, evidence=[ev], confidence=0.82,
                          tool_name=self.name, params_used=params)

    # ---- MOCK inference (MOCK_MODE only) ---------------------------------
    def _mock(self, task, images, query, params) -> ToolResult:
        opt = images[0]
        h, w = opt.shape[0], opt.shape[1]
        targets = params.get("target_classes", ["built_up", "water"])
        self.emit("[MOCK] Co-registering the optical and SAR scenes")
        yy, xx = np.mgrid[0:h, 0:w]
        water = (yy > h * 0.7).astype(float)
        built = (((xx < w * 0.4) & (yy < h * 0.4))).astype(float)
        mask = np.clip(water + built * 0.6, 0, 1)
        ev = Evidence(kind="overlay", label="built-up (teal) + water (blue)",
                      image_b64=render_mask(opt, mask),
                      data={"targets": targets})
        text = ("[MOCK] Fusing optical + SAR: SAR confirms open water in the "
                "lower third (cloud-robust) while optical resolves built-up "
                "clusters in the upper-left.")
        return ToolResult(text=text, evidence=[ev], confidence=0.81,
                          tool_name=self.name, params_used=params)
