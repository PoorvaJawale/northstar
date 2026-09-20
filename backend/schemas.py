"""Pydantic data contracts shared by the agent, tools, API and report."""
from __future__ import annotations
from typing import Any, Literal, Optional
from pydantic import BaseModel, Field


# ---- Task & input taxonomy (the vocabulary the whole system agrees on) ----
Task = Literal[
    "single_vqa",       # Visual Question Answering on one image
    "single_caption",   # Caption / scene description of one image
    "single_grounding", # Text-guided region grounding (draw a box)
    "change_vqa",       # Change description / change-based VQA on a bi-temporal pair
    "change_map",       # Spatial change mask on a bi-temporal pair
    "cross_modal",      # Joint optical + SAR fusion analysis
    "disaster_risk",    # Disaster risk / short-horizon prediction from SAR/optical cues
    "landcover_area",   # Segment a land-cover class and measure its extent
]

InputType = Literal["single_image", "optical_sar_pair", "bitemporal_pair", "unknown"]
Modality = Literal["optical", "multispectral", "sar", "unknown"]


class ImageMeta(BaseModel):
    """What the GeoTIFF reader extracts from each uploaded file."""
    filename: str
    fmt: str                      # "GeoTIFF" | "TIFF" | "PNG" | "JPEG"
    width: int
    height: int
    bands: int
    modality: Modality = "unknown"
    georeferenced: bool = False
    bounds: Optional[list[float]] = None   # [minx, miny, maxx, maxy] if georeferenced
    crs: Optional[str] = None              # e.g. "EPSG:32643" if georeferenced
    gsd: Optional[float] = None            # ground sample distance, metres/pixel
    preview_png_b64: Optional[str] = None  # small display image


class InputConfig(BaseModel):
    """Result of the input inspector: what did the user actually give us?"""
    input_type: InputType
    n_images: int
    modalities: list[Modality]
    images: list[ImageMeta]
    compatible: bool = True
    issue: Optional[str] = None   # populated when compatible == False


class AreaMeasurement(BaseModel):
    """Physical extent of a detected region, from a mask + ground-sample-distance."""
    pixels: int                       # number of masked pixels
    pct: float                        # % of the scene the mask covers
    gsd_m: Optional[float] = None     # metres per pixel (None if not georeferenced)
    area_m2: Optional[float] = None
    area_ha: Optional[float] = None   # hectares (the human-friendly unit)
    area_km2: Optional[float] = None
    basis: str = "pixel-fraction"     # "geospatial" when gsd is real, else "pixel-fraction"


class ConfidenceBreakdown(BaseModel):
    """Confidence split into named, defensible dimensions instead of one opaque %."""
    overall: float                              # rolled-up score (0..1)
    model: Optional[float] = None               # model/answer certainty
    evidence_quality: Optional[float] = None    # how clean the mask / histogram is
    geospatial_validity: Optional[float] = None # were the inputs aligned / overlapping
    calibration_state: str = "uncalibrated"     # honest label — not fit to correctness yet
    reasons: list[str] = Field(default_factory=list)


class Alignment(BaseModel):
    """Result of co-registering a multi-image input to a common geographic grid."""
    aligned: bool                    # True if a real geographic alignment was done
    method: str                      # "crs-reproject" | "pixel-grid" (fallback)
    source_crs: list[Optional[str]] = Field(default_factory=list)
    target_crs: Optional[str] = None
    gsd_m: Optional[float] = None
    overlap_pct: Optional[float] = None
    resampling: Optional[str] = None
    note: Optional[str] = None


class Evidence(BaseModel):
    """A single piece of visual/spatial evidence returned with an answer."""
    kind: Literal["bbox", "mask", "change_map", "overlay", "heatmap", "layer", "text"]
    label: Optional[str] = None
    image_b64: Optional[str] = None       # rendered overlay to show in the UI
    data: Optional[dict[str, Any]] = None # raw coords/values if useful
    color: Optional[str] = None           # hex tint for the map layer, e.g. "#38b6ff"
    area: Optional[AreaMeasurement] = None  # physical extent when this layer is a mask


class TraceStep(BaseModel):
    """One auditable step of the agent's execution (this is what ISRO evaluates)."""
    stage: str                    # e.g. "inspect", "classify", "select", "execute", "fuse"
    detail: str
    data: dict[str, Any] = Field(default_factory=dict)
    kind: Literal["stage", "log"] = "stage"   # "log" = fine-grained tool progress
    ms: Optional[int] = None                  # wall-clock duration of the stage


class ToolResult(BaseModel):
    """Uniform output shape every specialist tool must return."""
    text: str = ""
    evidence: list[Evidence] = Field(default_factory=list)
    confidence: float = 0.0
    confidence_breakdown: Optional[ConfidenceBreakdown] = None
    area: Optional[AreaMeasurement] = None
    tool_name: str = ""
    params_used: dict[str, Any] = Field(default_factory=dict)


class QueryResponse(BaseModel):
    """Final response to the frontend."""
    query: str
    task: Optional[Task] = None
    tools_used: list[str] = Field(default_factory=list)
    answer: str = ""
    confidence: float = 0.0
    confidence_breakdown: Optional[ConfidenceBreakdown] = None
    area: Optional[AreaMeasurement] = None
    alignment: Optional[Alignment] = None
    evidence: list[Evidence] = Field(default_factory=list)
    trace: list[TraceStep] = Field(default_factory=list)
    input_config: Optional[InputConfig] = None
    ok: bool = True
    error: Optional[str] = None
    report_id: Optional[str] = None


class PlanPreview(BaseModel):
    """A dry-run of what the agent WILL do — shown before execution (Plan Preview)."""
    query: str
    input_type: InputType
    n_images: int
    task: Optional[Task] = None
    method: Optional[str] = None          # 'llm' | 'fallback'
    tool: Optional[str] = None            # the specialist that would run
    pipeline: list[str] = Field(default_factory=list)  # human-readable steps
    inputs: list[str] = Field(default_factory=list)    # what it will consume
    est_seconds: Optional[float] = None
    compatible: bool = True
    note: Optional[str] = None
