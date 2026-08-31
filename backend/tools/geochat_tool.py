"""
Phase 1.2 — GeoChat tool: single-image VQA, captioning, grounding.

MOCK_MODE=True  -> returns realistic synthetic answers + a rendered box, so you
                   can demo the whole pipeline with no GPU.
MOCK_MODE=False -> loads the real GeoChat VLM (optionally with your LoRA adapter)
                   and runs actual inference.  <-- YOUR TEAM fills in the marked
                   TODO once weights + torch/transformers are installed.
"""
from __future__ import annotations
from typing import Any

import numpy as np

from .base import Tool
from ._render import render_bbox
from ..schemas import ToolResult, Evidence, Task
from .. import config


class GeoChatTool(Tool):
    name = "geochat"
    tasks = ["single_vqa", "single_caption", "single_grounding"]

    def __init__(self) -> None:
        self._runner = None   # lazy GeoChatRunner

    # ---- real model loading (lazy; only when not mock) --------------------
    def _ensure_loaded(self) -> None:
        if self._runner is not None:
            return
        # Loads GeoChat via the correct geochat.* loader (see geochat_runtime.py).
        # Requires: torch (CUDA), transformers==4.31.0, the geochat-7B checkpoint,
        # and optionally your LoRA adapter (config.LORA_ADAPTER).
        from .geochat_runtime import GeoChatRunner
        self._runner = GeoChatRunner(
            model_path=config.GEOCHAT_MODEL,
            conv_mode=config.GEOCHAT_CONV_MODE,
            load_4bit=config.GEOCHAT_LOAD_4BIT,
            load_8bit=config.GEOCHAT_LOAD_8BIT,
            adapter=config.LORA_ADAPTER or None,
            device=config.DEVICE,
        )

    # ---- entry point ------------------------------------------------------
    def run(self, task: Task, images: list[np.ndarray], query: str,
            params: dict[str, Any] | None = None) -> ToolResult:
        params = params or {}
        if config.MOCK_MODE:
            return self._mock(task, images, query, params)
        return self._real(task, images, query, params)

    # ---- REAL inference --------------------------------------------------
    _PROMPTS = {
        "single_caption": "Describe the land-cover and major objects visible in this image.",
        "single_grounding": "[refer] {q}",
    }

    def _real(self, task, images, query, params) -> ToolResult:
        from .geochat_runtime import numpy_to_pil_rgb
        self._ensure_loaded()
        image = numpy_to_pil_rgb(images[0])

        if task == "single_caption":
            prompt = self._PROMPTS["single_caption"]
        elif task == "single_grounding":
            prompt = f"[refer] {self._referring_expression(query)}"
        else:  # single_vqa
            prompt = query

        text, conf, _ = self._runner.generate(
            image, prompt,
            max_new_tokens=int(params.get("max_new_tokens", 256)),
            temperature=float(params.get("temperature", 0.2)),
        )

        evidence = []
        if task == "single_grounding":
            h, w = images[0].shape[0], images[0].shape[1]
            box = self._parse_box(text, w, h)
            if box:
                evidence.append(Evidence(
                    kind="bbox", label=query,
                    image_b64=render_bbox(images[0], box, query),
                    data={"box_xyxy": box}))
        return ToolResult(text=text, evidence=evidence, confidence=conf,
                          tool_name=self.name, params_used=params)

    @staticmethod
    def _referring_expression(query: str) -> str:
        """GeoChat grounds a noun phrase, not an instruction. Turn e.g.
        'Highlight the roundabout' into 'the roundabout' so the model outputs a
        box instead of a description. Falls back to the original query."""
        import re
        q = query.strip().rstrip(".?!")
        q = re.sub(
            r"(?i)^\s*(please\s+)?(highlight|show(\s+me)?|mark|find|locate|detect|"
            r"identify|point\s+(to|out)|where(\s+is|'s)?|give\s+(me\s+)?the\s+"
            r"(bounding\s+)?box\s+(of|for)?)\s+", "", q)
        q = re.sub(r"(?i)\s+(referred\s+to\s+in\s+the\s+query|in\s+(the|this)\s+image)\s*$", "", q)
        return q.strip() or query.strip()

    @staticmethod
    def _parse_box(text: str, w: int, h: int):
        """Parse GeoChat's {<x><y><x><y>|<angle>} grounding output (0-100 grid)
        and scale to pixels. Prefers the bracketed format; falls back to the
        first four numbers. Returns [x0,y0,x1,y1] or None (then we show text)."""
        import re
        m = re.search(r"<\s*([\d.]+)\s*>\s*<\s*([\d.]+)\s*>\s*<\s*([\d.]+)\s*>\s*<\s*([\d.]+)\s*>", text)
        if m:
            vals = [float(x) for x in m.groups()]
        else:
            nums = re.findall(r"\d+(?:\.\d+)?", text.replace("|", " "))
            if len(nums) < 4:
                return None
            vals = [float(v) for v in nums[:4]]
        x0, y0, x1, y1 = vals
        sx, sy = w / 100.0, h / 100.0
        box = [x0 * sx, y0 * sy, x1 * sx, y1 * sy]
        if box[2] <= box[0] or box[3] <= box[1]:
            return None
        return box

    # ---- MOCK inference (runs today) -------------------------------------
    def _mock(self, task, images, query, params) -> ToolResult:
        img = images[0]
        h, w = img.shape[0], img.shape[1]
        if task == "single_caption":
            return ToolResult(
                text=("[MOCK] The scene shows a mix of built-up areas, "
                      "vegetation and a water body along the lower-right, "
                      "typical of a peri-urban landscape."),
                confidence=0.82, tool_name=self.name, params_used=params,
            )
        if task == "single_grounding":
            box = [w * 0.55, h * 0.55, w * 0.9, h * 0.85]
            ev = Evidence(kind="bbox", label="water body",
                          image_b64=render_bbox(img, box, "water body"),
                          data={"box_xyxy": box})
            return ToolResult(
                text="[MOCK] Highlighted the referred water body (lower-right).",
                evidence=[ev], confidence=0.79, tool_name=self.name, params_used=params,
            )
        # default: single_vqa
        return ToolResult(
            text=("[MOCK] Yes — a water body is visible in the lower-right "
                  "quadrant; the rest is mostly built-up and cropland."),
            confidence=0.80, tool_name=self.name, params_used=params,
        )
