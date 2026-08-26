"""
Phase 1.4 — Optical-SAR fusion tool.

Takes a CO-REGISTERED optical + SAR pair of the same area and extracts
information neither image gives alone (e.g. water under cloud via SAR +
land-cover context via optical). MOCK path synthesises a fused mask.
"""
from __future__ import annotations
from typing import Any

import numpy as np

from .base import Tool
from ._render import render_mask
from ..schemas import ToolResult, Evidence, Task
from .. import config


class OpticalSarTool(Tool):
    name = "optical_sar"
    tasks = ["cross_modal"]

    def __init__(self) -> None:
        self._model = None

    def _ensure_loaded(self) -> None:
        if self._model is not None:
            return
        # === YOUR INTERVENTION POINT #4 ==================================
        # Load your dual-encoder fusion model (config.OPTICAL_SAR_MODEL),
        # trained on BigEarthNet.txt co-registered S1+S2 pairs.
        raise NotImplementedError

    def run(self, task: Task, images: list[np.ndarray], query: str,
            params: dict[str, Any] | None = None) -> ToolResult:
        params = params or {}
        if config.MOCK_MODE:
            return self._mock(task, images, query, params)
        return self._real(task, images, query, params)

    def _real(self, task, images, query, params) -> ToolResult:
        self._ensure_loaded()
        # optical, sar = images[0], images[1]
        # fused = self._model(optical, sar)
        raise NotImplementedError(
            "Optical-SAR real inference not implemented. Run MOCK or see INTERVENTION.md #4."
        )

    def _mock(self, task, images, query, params) -> ToolResult:
        opt = images[0]
        h, w = opt.shape[0], opt.shape[1]
        targets = params.get("target_classes", ["built_up", "water"])
        # synthetic: water in lower band, built-up scattered upper-left
        yy, xx = np.mgrid[0:h, 0:w]
        water = (yy > h * 0.7).astype(float)
        built = (((xx < w * 0.4) & (yy < h * 0.4))).astype(float)
        mask = np.clip(water + built * 0.6, 0, 1)
        ev = Evidence(kind="overlay", label="built-up (teal) + water (blue)",
                      image_b64=render_mask(opt, mask),
                      data={"targets": targets})
        text = ("[MOCK] Fusing optical + SAR: SAR confirms open water in the "
                "lower third (cloud-robust) while optical resolves built-up "
                "clusters in the upper-left. Combined read-out is more reliable "
                "than either sensor alone.")
        return ToolResult(text=text, evidence=[ev], confidence=0.81,
                          tool_name=self.name, params_used=params)
