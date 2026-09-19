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
from ._render import render_bbox, render_boxes
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
        self.emit(f"Loading GeoChat weights ({config.GEOCHAT_MODEL}) — first run only",
                  model=config.GEOCHAT_MODEL, device=config.DEVICE)
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
        self.emit("Preparing the image for the vision encoder",
                  shape=list(images[0].shape))
        image = numpy_to_pil_rgb(images[0])

        if task == "single_caption":
            prompt = self._PROMPTS["single_caption"]
        elif task == "single_grounding":
            prompt = f"[refer] {self._referring_expression(query)}"
        else:  # single_vqa
            prompt = query

        self.emit(f"Prompting GeoChat for {task}", prompt=prompt)
        text, conf, _ = self._runner.generate(
            image, prompt,
            max_new_tokens=int(params.get("max_new_tokens", 256)),
            temperature=float(params.get("temperature", 0.2)),
        )
        self.emit("Model answered", chars=len(text), confidence=round(conf, 3))

        evidence = []
        h, w = images[0].shape[0], images[0].shape[1]
        boxes = self._parse_boxes(text, w, h)

        if task == "single_grounding":
            self.emit("Parsing the predicted bounding box(es)")
            ref = self._referring_expression(query)
            if boxes:
                self.emit("Drawing the box overlay", n=len(boxes),
                          boxes=[[round(v, 1) for v in b] for b in boxes])
                evidence.append(Evidence(
                    kind="bbox", label=ref,
                    image_b64=render_boxes(images[0], boxes, ref),
                    data={"boxes_xyxy": boxes, "raw": text}))
                out_text = (f"Highlighted {ref}: {len(boxes)} region"
                            f"{'s' if len(boxes) != 1 else ''} marked on the image.")
            else:
                # No parseable coordinates: still return the scene as evidence so
                # the user always sees the image the model looked at.
                self.emit("No box parsed; showing the scene without an overlay")
                evidence.append(Evidence(
                    kind="overlay", label=ref,
                    image_b64=render_boxes(images[0], [], ref),
                    data={"raw": text}))
                out_text = self._clean_text(text) or f"Could not localise {ref} in the image."
        else:
            # VQA / caption: GeoChat sometimes grounds objects and emits box tokens
            # ({<..>} groups, <NN> tokens, <p> tags). Strip them for a clean answer,
            # and if it DID ground, draw the boxes so the image still appears.
            out_text = self._clean_text(text)
            if boxes:
                self.emit("GeoChat grounded objects — drawing them on the image", n=len(boxes))
                evidence.append(Evidence(
                    kind="bbox", label="located objects",
                    image_b64=render_boxes(images[0], boxes, ""),
                    data={"boxes_xyxy": boxes, "raw": text}))
        return ToolResult(text=out_text, evidence=evidence, confidence=conf,
                          tool_name=self.name, params_used=params)

    @staticmethod
    def _clean_text(text: str) -> str:
        """Strip GeoChat's grounding markup ({<x><y>...} box groups, stray <NN> /
        <delim> tokens and <p> tags) so the displayed answer reads as plain text."""
        import re
        t = re.sub(r"</?p>", "", text or "")
        t = re.sub(r"\{[^}]*\}", "", t)          # {<x0><y0><x1><y1>|<angle>} groups
        t = re.sub(r"<[^>]*>", "", t)            # any remaining <..> tokens
        t = re.sub(r"\s{2,}", " ", t)
        t = t.replace(" .", ".").replace(" ,", ",").replace(" ;", ";")
        return t.strip()

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
    def _parse_boxes(text: str, w: int, h: int) -> list[list[float]]:
        """Parse GeoChat grounding output into pixel boxes. GeoChat emits one or
        more oriented boxes like `{<x0><y0><x1><y1>|<angle>}` on a 0-100 grid.
        We take each brace group's first four numbers, scale to pixels, and
        normalise to [xmin,ymin,xmax,ymax] (so reversed/rotated coords never get
        dropped). Falls back to the first four bare numbers if no braces.
        Returns a possibly-empty list."""
        import re
        sx, sy = w / 100.0, h / 100.0
        groups = re.findall(r"\{([^}]*)\}", text)
        chunks = groups if groups else [text]
        boxes: list[list[float]] = []
        for ch in chunks:
            nums = re.findall(r"\d+(?:\.\d+)?", ch)
            if len(nums) < 4:
                continue
            x0, y0, x1, y1 = (float(v) for v in nums[:4])
            xa, xb = sorted((x0 * sx, x1 * sx))
            ya, yb = sorted((y0 * sy, y1 * sy))
            if xb - xa < 1 or yb - ya < 1:      # degenerate -> skip
                continue
            boxes.append([xa, ya, xb, yb])
        return boxes

    # ---- MOCK inference (runs today) -------------------------------------
    def _mock(self, task, images, query, params) -> ToolResult:
        img = images[0]
        h, w = img.shape[0], img.shape[1]
        self.emit(f"[MOCK] Synthesising a {task} answer (no GPU needed)")
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
