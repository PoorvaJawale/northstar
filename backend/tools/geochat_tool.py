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
        self._model = None
        self._processor = None

    # ---- real model loading (lazy; only when not mock) --------------------
    def _ensure_loaded(self) -> None:
        if self._model is not None:
            return
        # === YOUR INTERVENTION POINT #1 ===================================
        # Requires: torch (CUDA), transformers, the GeoChat weights, and
        # optionally your LoRA adapter from training/.
        import torch
        from transformers import AutoModelForCausalLM, AutoProcessor

        self._processor = AutoProcessor.from_pretrained(config.GEOCHAT_MODEL)
        self._model = AutoModelForCausalLM.from_pretrained(
            config.GEOCHAT_MODEL,
            torch_dtype=torch.float16,
            device_map=config.DEVICE,
            load_in_4bit=True,          # bitsandbytes; use WSL2 on Windows
        )
        if config.LORA_ADAPTER:
            from peft import PeftModel
            self._model = PeftModel.from_pretrained(self._model, config.LORA_ADAPTER)
        self._model.eval()
        # ==================================================================

    # ---- entry point ------------------------------------------------------
    def run(self, task: Task, images: list[np.ndarray], query: str,
            params: dict[str, Any] | None = None) -> ToolResult:
        params = params or {}
        if config.MOCK_MODE:
            return self._mock(task, images, query, params)
        return self._real(task, images, query, params)

    # ---- REAL inference (fill in) ----------------------------------------
    def _real(self, task, images, query, params) -> ToolResult:
        self._ensure_loaded()
        img = images[0]
        # === YOUR INTERVENTION POINT #2 ==================================
        # Build the prompt per task, run the model, parse text (and, for
        # grounding, parse the predicted box). Derive confidence from the
        # model's token/softmax scores — NOT a constant.
        #
        # prompt = self._build_prompt(task, query)
        # inputs = self._processor(images=img, text=prompt, return_tensors="pt")...
        # out = self._model.generate(**inputs, max_new_tokens=params.get("max_new_tokens",256))
        # text = self._processor.decode(out[0], skip_special_tokens=True)
        # box  = self._parse_box(text)   # for grounding
        # conf = self._score_to_conf(out.scores)
        raise NotImplementedError(
            "GeoChat real inference not implemented yet. Run in MOCK mode "
            "(SATQUERY_MOCK=1) or implement _real(). See INTERVENTION.md #1."
        )

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
