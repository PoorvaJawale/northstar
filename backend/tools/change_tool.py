"""
Phase 1.3 — Change tool: bi-temporal change-VQA + change map.

Takes TWO co-located images from different dates and reports what changed.
MOCK path synthesises a plausible change mask; real path wraps a change model
(e.g. ChangeFormer / BIT from the open-cd toolbox) + a caption pass.
"""
from __future__ import annotations
from typing import Any

import numpy as np

from .base import Tool
from ._render import render_mask
from ..schemas import ToolResult, Evidence, Task
from .. import config


class ChangeTool(Tool):
    name = "change"
    tasks = ["change_vqa", "change_map"]

    def __init__(self) -> None:
        self._model = None

    def _ensure_loaded(self) -> None:
        if self._model is not None:
            return
        # === YOUR INTERVENTION POINT #3 ==================================
        # Load ChangeFormer/BIT weights (config.CHANGE_MODEL). See open-cd:
        #   https://github.com/likyoo/open-cd
        raise NotImplementedError

    def run(self, task: Task, images: list[np.ndarray], query: str,
            params: dict[str, Any] | None = None) -> ToolResult:
        params = params or {}
        if config.MOCK_MODE:
            return self._mock(task, images, query, params)
        return self._real(task, images, query, params)

    def _real(self, task, images, query, params) -> ToolResult:
        self._ensure_loaded()
        # img_a, img_b = images[0], images[1]
        # mask = self._model(img_a, img_b) > params.get("threshold", 0.5)
        # text = caption_change(mask)   # describe direction/location
        raise NotImplementedError(
            "Change real inference not implemented. Run MOCK or see INTERVENTION.md #3."
        )

    def _mock(self, task, images, query, params) -> ToolResult:
        a = images[0]
        h, w = a.shape[0], a.shape[1]
        # synthetic change blob in the top-right (as if new built-up appeared)
        yy, xx = np.mgrid[0:h, 0:w]
        cy, cx = h * 0.3, w * 0.7
        mask = (((xx - cx) ** 2 + (yy - cy) ** 2) < (min(h, w) * 0.18) ** 2).astype(float)
        pct = float(mask.mean() * 100)
        ev = Evidence(kind="change_map", label="change mask",
                      image_b64=render_mask(a, mask),
                      data={"changed_fraction_pct": round(pct, 2)})
        if task == "change_map":
            text = f"[MOCK] Change map generated: ~{pct:.1f}% of the scene changed."
        else:  # change_vqa / description
            text = (f"[MOCK] Built-up area INCREASED between the two dates, "
                    f"mainly in the north-east (~{pct:.1f}% of the scene).")
        return ToolResult(text=text, evidence=[ev], confidence=0.77,
                          tool_name=self.name, params_used=params)
