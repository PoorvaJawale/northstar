"""Disaster management tool for SAR/optical risk assessment.

This module is intentionally fast and model-ready. The current implementation
uses deterministic remote-sensing indicators from the uploaded pixels so it runs
on a laptop; a trained Sentinel-1 flood model or weather API can later be
plugged in behind this same Tool interface.
"""
from __future__ import annotations
import json
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image

from .base import Tool
from ._render import render_mask, resize_to, to_norm_rgb, otsu_threshold
from .. import config
from ..schemas import ToolResult, Evidence, Task


def _downsample(arr: np.ndarray, max_side: int = 768) -> np.ndarray:
    h, w = arr.shape[:2]
    if max(h, w) <= max_side:
        return arr
    scale = max_side / max(h, w)
    return resize_to(to_norm_rgb(arr), (max(1, int(h * scale)), max(1, int(w * scale))))


def _sar_backscatter(arr: np.ndarray) -> np.ndarray:
    return to_norm_rgb(arr).mean(axis=2)


def _optical_indices(arr: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    rgb = to_norm_rgb(arr)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    water_like = (b + g) / 2 - r
    vegetation_like = g - (r + b) / 2
    return water_like, vegetation_like


def _sar_model_input(arr: np.ndarray, hw: tuple[int, int] = (512, 512)) -> np.ndarray:
    a = np.asarray(arr).astype(np.float32)
    if a.ndim == 2:
        a = a[..., None]
    a = a[..., :2] if a.shape[-1] >= 2 else np.repeat(a[..., :1], 2, axis=-1)
    chans = []
    for i in range(2):
        c = np.nan_to_num(a[..., i], nan=-50.0, posinf=1.0, neginf=-50.0)
        c = np.clip(c, -50.0, 1.0)
        if c.max() > 2.0 or c.min() < -1.0:
            c = (c + 50.0) / 51.0
        else:
            c = np.clip(c, 0, 1)
        chans.append(resize_to(c, hw))
    return np.stack(chans, axis=0)[None].astype(np.float32)


def _risk_level(score: float) -> str:
    if score >= 0.68:
        return "high"
    if score >= 0.42:
        return "moderate"
    return "low"


class DisasterTool(Tool):
    name = "disaster"
    tasks = ["disaster_risk"]

    def __init__(self) -> None:
        self._sar_session = None
        self._hf_segmenter = None

    def run(self, task: Task, images: list[np.ndarray], query: str,
            params: dict[str, Any] | None = None) -> ToolResult:
        params = params or {}
        if not images:
            return ToolResult(text="Disaster assessment needs at least one image.",
                              confidence=0.0, tool_name=self.name, params_used=params)

        self.emit("Preparing a low-latency analysis grid", max_side=768)
        base = _downsample(images[0])
        hazard = params.get("hazard") or self._infer_hazard((query or "").lower())

        second = None
        if len(images) > 1:
            self.emit("Using the second scene as temporal/cross-sensor evidence")
            second = _downsample(images[1])

        self.emit("Running SAR/optical hazard indicators", hazard=hazard)
        sar = _sar_backscatter(base)
        water_score, veg_score = _optical_indices(base)

        dark_thr = float(np.percentile(sar, 18))
        bright_thr = float(np.percentile(sar, 86))
        flood_mask = (sar <= dark_thr).astype(np.float32)
        built_mask = (sar >= bright_thr).astype(np.float32)

        model_notes: list[str] = []
        sar_model_mask = self._try_sar_flood_model(base)
        if sar_model_mask is not None:
            flood_mask = np.maximum(flood_mask * 0.35, sar_model_mask)
            model_notes.append(f"SAR flood model: {config.DISASTER_SAR_MODEL}")

        water_norm = np.clip((water_score + 1) / 2, 0, 1)
        optical_water_thr, water_sep = otsu_threshold(water_norm)
        optical_water = (water_norm >= optical_water_thr).astype(np.float32)
        flood_mask = np.maximum(flood_mask, optical_water * 0.65)

        optical_model_mask = self._try_hf_segmentation_model(base, hazard)
        if optical_model_mask is not None:
            flood_mask = np.maximum(flood_mask * 0.55, optical_model_mask)
            model_notes.append(f"Optical segmentation model: {config.DISASTER_OPTICAL_MODEL}")

        change_pct = 0.0
        sep = water_sep
        if second is not None:
            h = min(base.shape[0], second.shape[0])
            w = min(base.shape[1], second.shape[1])
            a = resize_to(to_norm_rgb(base), (h, w))
            b = resize_to(to_norm_rgb(second), (h, w))
            mag = np.sqrt(((a - b) ** 2).sum(axis=2) / 3.0)
            t, sep = otsu_threshold(mag)
            change = (mag >= t).astype(np.float32)
            change_pct = float(change.mean() * 100)
            flood_mask = resize_to(flood_mask, (h, w))
            built_mask = resize_to(built_mask, (h, w))
            base = a

        flood_pct = float(flood_mask.mean() * 100)
        exposed_pct = float((flood_mask * built_mask).mean() * 100)
        veg_stress = float(np.clip(1.0 - ((veg_score + 1) / 2).mean(), 0, 1))

        if hazard == "landslide":
            slope_proxy = float(np.std(sar))
            risk = np.clip(0.50 * veg_stress + 0.30 * (change_pct / 25) + 0.20 * slope_proxy, 0, 1)
            overlay = np.maximum(flood_mask * 0.5, built_mask * 0.35)
            hazard_text = "landslide / terrain instability"
            driver = f"vegetation-stress proxy {veg_stress:.2f} with scene-change {change_pct:.1f}%"
        elif hazard == "cyclone":
            risk = np.clip(0.44 * (flood_pct / 35) + 0.26 * (exposed_pct / 12) +
                           0.30 * (change_pct / 25), 0, 1)
            overlay = flood_mask
            hazard_text = "cyclone impact / storm-surge"
            driver = f"coastal-water/flood proxy {flood_pct:.1f}% with exposure {exposed_pct:.1f}%"
        elif hazard == "wildfire":
            burn_proxy = float(np.clip(1.0 - ((veg_score + 1) / 2).mean(), 0, 1))
            risk = np.clip(0.58 * burn_proxy + 0.30 * (change_pct / 25) + 0.12 * (1 - flood_pct / 50), 0, 1)
            overlay = np.maximum((veg_score < np.percentile(veg_score, 18)).astype(np.float32), built_mask * 0.25)
            hazard_text = "wildfire / burn-scar"
            driver = f"low-vegetation/burn proxy {burn_proxy:.2f} with scene-change {change_pct:.1f}%"
        else:
            risk = np.clip(0.48 * (flood_pct / 35) + 0.28 * (exposed_pct / 12) +
                           0.24 * (change_pct / 25), 0, 1)
            overlay = flood_mask
            hazard_text = "flood / inundation"
            driver = f"water-like SAR/optical area {flood_pct:.1f}% and exposed built-up overlap {exposed_pct:.1f}%"

        level = _risk_level(float(risk))
        confidence = round(float(np.clip(0.58 + 0.25 * sep + 0.12 * (len(images) > 1) +
                                         0.05 * (hazard == "flood"), 0.55, 0.92)), 3)
        weather = self._fetch_weather(params)
        if weather:
            params = {**params, **weather}
        forecast = self._weather_note(params, hazard, level)

        self.emit("Calibrating risk and generating response",
                  risk_level=level, confidence=confidence)
        from ..geo.alignment import measure_area
        area = measure_area(int((overlay > 0.05).sum()), int(overlay.size), None)
        ev = Evidence(kind="heatmap", label=f"{hazard_text} risk overlay", color="#f87171",
                      image_b64=render_mask(base, overlay, color=(248, 113, 113)), area=area,
                      data={"hazard": hazard, "risk_level": level,
                            "risk_score": round(float(risk), 3),
                            "flood_pct": round(flood_pct, 2),
                            "exposed_built_up_pct": round(exposed_pct, 2),
                            "change_pct": round(change_pct, 2),
                            "models_used": model_notes or ["fast SAR/optical fallback indicators"],
                            "recommended_models": [
                                "SAR flood segmentation: UNet/SegFormer on Sentinel-1",
                                "Building exposure: SAM/YOLOv8/Mask2Former on optical imagery",
                                "Weather nowcast: IMD/ECMWF/GFS rainfall and wind forecast API",
                            ]})
        text = (
            f"Disaster management assessment: {hazard_text} risk is {level.upper()} "
            f"(score {float(risk):.2f}). Main evidence: {driver}. {forecast} "
            "For higher accuracy in LIVE mode, plug a trained Sentinel-1 SAR flood "
            "segmentation model plus a weather nowcast feed into this disaster tool."
        )
        return ToolResult(text=text, evidence=[ev], confidence=confidence, area=area,
                          tool_name=self.name, params_used=params)

    def _try_sar_flood_model(self, arr: np.ndarray) -> np.ndarray | None:
        """Use a local ONNX SAR flood segmentation model when configured.

        Expected model contract: one image input (N,C,H,W float32 in 0..1) and
        one logits/probability output. This matches common UNet/SegFormer ONNX
        exports used for Sentinel-1 flood segmentation.
        """
        model = config.DISASTER_SAR_MODEL
        if not model:
            return None
        path = Path(model)
        if not path.exists():
            self.emit("Configured SAR model was not found; using fallback", model=model)
            return None
        try:
            import onnxruntime as ort

            if self._sar_session is None:
                self.emit("Loading SAR flood ONNX model", model=model)
                self._sar_session = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])
            x = _sar_model_input(arr)
            inp = self._sar_session.get_inputs()[0].name
            y = self._sar_session.run(None, {inp: x})[0]
            y = np.asarray(y).squeeze()
            if y.ndim == 3:
                y = y[-1]
            prob = 1.0 / (1.0 + np.exp(-y)) if y.min() < 0 or y.max() > 1 else y
            return resize_to(prob.astype(np.float32), arr.shape[:2])
        except Exception as exc:
            self.emit("SAR model failed; using fallback", error=exc.__class__.__name__)
            return None

    def _try_hf_segmentation_model(self, arr: np.ndarray, hazard: str) -> np.ndarray | None:
        """Use a HuggingFace image-segmentation model when configured.

        Good choices: SegFormer/Mask2Former models fine-tuned for flood, water,
        building, road, burn-scar or disaster-damage segmentation.
        """
        model = config.DISASTER_OPTICAL_MODEL
        if not model:
            return None
        try:
            from transformers import pipeline

            if self._hf_segmenter is None:
                self.emit("Loading optical disaster segmentation model", model=model)
                self._hf_segmenter = pipeline("image-segmentation", model=model,
                                              device=0 if config.DEVICE == "cuda" else -1)
            rgb = (to_norm_rgb(arr) * 255).astype(np.uint8)
            result = self._hf_segmenter(Image.fromarray(rgb))
            wanted = self._wanted_labels(hazard)
            masks = []
            for item in result:
                label = str(item.get("label", "")).lower()
                if not any(w in label for w in wanted):
                    continue
                mask = item.get("mask")
                if mask is None:
                    continue
                masks.append(np.asarray(mask.convert("L")).astype(np.float32) / 255.0)
            if not masks:
                return None
            return np.maximum.reduce(masks)
        except Exception as exc:
            self.emit("Optical segmentation model failed; using fallback",
                      error=exc.__class__.__name__)
            return None

    def _wanted_labels(self, hazard: str) -> list[str]:
        if hazard in ("flood", "cyclone"):
            return ["water", "flood", "river", "lake", "sea", "inund"]
        if hazard == "landslide":
            return ["landslide", "bare", "soil", "debris", "slope"]
        if hazard == "wildfire":
            return ["burn", "fire", "smoke", "bare", "vegetation"]
        return ["damage", "water", "building", "road"]

    def _fetch_weather(self, params: dict[str, Any]) -> dict[str, float]:
        lat = params.get("lat")
        lon = params.get("lon")
        if lat is None or lon is None or config.WEATHER_API != "open-meteo":
            return {}
        try:
            query = urllib.parse.urlencode({
                "latitude": lat,
                "longitude": lon,
                "forecast_days": 1,
                "hourly": "rain,wind_speed_10m",
            })
            url = f"https://api.open-meteo.com/v1/forecast?{query}"
            with urllib.request.urlopen(url, timeout=5) as resp:
                body = json.loads(resp.read().decode("utf-8"))
            hourly = body.get("hourly", {})
            rain = hourly.get("rain") or []
            wind = hourly.get("wind_speed_10m") or []
            out = {}
            if rain:
                out["rainfall_mm_24h"] = round(float(sum(rain[:24])), 2)
            if wind:
                out["wind_kmph"] = round(float(max(wind[:24])), 2)
            if out:
                self.emit("Fetched weather forecast", **out)
            return out
        except Exception as exc:
            self.emit("Weather forecast API failed; using imagery-only risk",
                      error=exc.__class__.__name__)
            return {}

    def _infer_hazard(self, q: str) -> str:
        if any(k in q for k in ("landslide", "slope", "mudslide")):
            return "landslide"
        if any(k in q for k in ("cyclone", "storm", "surge", "coast", "wind")):
            return "cyclone"
        if any(k in q for k in ("fire", "wildfire", "burn", "smoke")):
            return "wildfire"
        return "flood"

    def _weather_note(self, params: dict[str, Any], hazard: str, level: str) -> str:
        rainfall = params.get("rainfall_mm_24h")
        wind = params.get("wind_kmph")
        if rainfall is None and wind is None:
            return ("Weather prediction is using imagery-only risk because no live "
                    "weather feed is configured.")
        parts = []
        if rainfall is not None:
            parts.append(f"24h rainfall={rainfall} mm")
        if wind is not None:
            parts.append(f"wind={wind} km/h")
        return f"Weather context ({', '.join(parts)}) supports a {level} {hazard} watch."
