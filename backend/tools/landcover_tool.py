"""
Phase 5 — Land-cover area tool.

Answers "how big is the <water / vegetation / built-up / bare> area?" — the
measurement questions GeoChat (a text VQA model) cannot answer. It segments the
named class from the scene and reports its extent, which the controller turns
into real hectares when the input is georeferenced (else % of the scene).

Segmentation is colour/index based on the displayed RGB — fast, CPU-only, no
training. It is an ESTIMATE and says so: on RGB, "cropland" specifically (vs
forest/grass) needs NIR bands (NDVI), so a cropland request is answered as
"vegetation" with that caveat noted.
"""
from __future__ import annotations
from typing import Any

import numpy as np

from .base import Tool
from ._render import render_mask, to_norm_rgb, otsu_threshold
from ..geo.alignment import measure_area
from ..schemas import ToolResult, Evidence, Task
from .. import config

# query keyword -> canonical class
_CLASS_KEYWORDS = {
    "water": ["water", "lake", "river", "reservoir", "pond", "sea", "coast", "wetland"],
    "vegetation": ["vegetation", "veg", "crop", "cropland", "farm", "agri", "forest",
                   "tree", "green", "grass", "field", "plantation"],
    "built_up": ["built", "building", "urban", "settlement", "city", "concrete",
                 "construction", "built-up", "builtup", "road", "infrastructure"],
    "bare": ["bare", "soil", "barren", "sand", "desert", "fallow", "rock"],
}
_CLASS_COLOR = {"water": "#3a86ff", "vegetation": "#31c48d",
                "built_up": "#f59e0b", "bare": "#d6a15e"}
_CLASS_LABEL = {"water": "water", "vegetation": "vegetation",
                "built_up": "built-up", "bare": "bare ground / soil"}
_CLASS_RGB = {"water": (58, 134, 255), "vegetation": (49, 196, 141),
              "built_up": (245, 158, 11), "bare": (214, 161, 94)}


def detect_class(query: str) -> str:
    q = (query or "").lower()
    best, best_hits = "vegetation", 0
    for cls, kws in _CLASS_KEYWORDS.items():
        hits = sum(1 for k in kws if k in q)
        if hits > best_hits:
            best, best_hits = cls, hits
    return best


class LandCoverTool(Tool):
    name = "landcover"
    tasks = ["landcover_area"]

    def __init__(self) -> None:
        pass

    def run(self, task: Task, images: list[np.ndarray], query: str,
            params: dict[str, Any] | None = None) -> ToolResult:
        params = params or {}
        if not images:
            return ToolResult(text="Land-cover measurement needs an image.",
                              evidence=[], confidence=0.0, tool_name=self.name, params_used=params)
        cls = detect_class(query)
        rgb = to_norm_rgb(images[0])                       # HxWx3 in [0,1]
        mask, sep = self._segment(rgb, cls)
        pct = float(mask.mean() * 100)
        area = measure_area(int(mask.sum()), int(mask.size), None)  # gsd added by controller
        conf = round(float(np.clip(0.55 + 0.3 * sep, 0.5, 0.9)), 3)

        self.emit("Segmenting land cover", cls=cls, pct=round(pct, 2))
        ev = Evidence(kind="heatmap", label=f"{_CLASS_LABEL[cls]} (~{pct:.0f}%)",
                      color=_CLASS_COLOR[cls], area=area,
                      image_b64=render_mask(images[0], mask, color=_CLASS_RGB[cls]),
                      data={"class": cls, "pct": round(pct, 2)})

        cropland = any(k in (query or "").lower() for k in ("crop", "farm", "agri", "field"))
        caveat = (" (estimated from colour as vegetation; distinguishing cropland from "
                  "forest/grass needs NIR bands)" if cropland and cls == "vegetation" else "")
        if pct < 1:
            text = (f"Very little {_CLASS_LABEL[cls]} detected in this scene "
                    f"(~{pct:.1f}% of the image){caveat}.")
        else:
            text = (f"About {pct:.1f}% of the scene is {_CLASS_LABEL[cls]}{caveat}. "
                    f"The exact area is measured from the segmented mask "
                    f"(hectares when the image is georeferenced).")
        return ToolResult(text=text, evidence=[ev], confidence=conf, area=area,
                          tool_name=self.name, params_used=params)

    # ---- colour / index segmentation (RGB, CPU) --------------------------
    @staticmethod
    def _segment(rgb: np.ndarray, cls: str) -> tuple[np.ndarray, float]:
        R, G, B = rgb[..., 0], rgb[..., 1], rgb[..., 2]
        lum = rgb.mean(axis=2)
        mx, mn = rgb.max(axis=2), rgb.min(axis=2)
        sat = mx - mn
        if cls == "vegetation":
            score = 2 * G - R - B                       # excess-green index
        elif cls == "water":
            score = (1 - lum) + (B - np.maximum(R, G))  # dark + blue-dominant
        elif cls == "built_up":
            score = lum - 2 * sat                        # bright + low saturation (grey)
        else:  # bare / soil
            score = (R - B) + (0.5 - np.abs(lum - 0.5))  # reddish + mid brightness
        s = score.astype(np.float32)
        s = (s - s.min()) / (float(np.ptp(s)) + 1e-6)   # normalise to [0,1]
        thr, sep = otsu_threshold(s)
        return (s >= thr).astype(np.float32), sep
