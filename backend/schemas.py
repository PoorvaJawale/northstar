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
    preview_png_b64: Optional[str] = None  # small display image


class InputConfig(BaseModel):
    """Result of the input inspector: what did the user actually give us?"""
    input_type: InputType
    n_images: int
    modalities: list[Modality]
    images: list[ImageMeta]
    compatible: bool = True
    issue: Optional[str] = None   # populated when compatible == False


class Evidence(BaseModel):
    """A single piece of visual/spatial evidence returned with an answer."""
    kind: Literal["bbox", "mask", "change_map", "overlay", "text"]
    label: Optional[str] = None
    image_b64: Optional[str] = None       # rendered overlay to show in the UI
    data: Optional[dict[str, Any]] = None # raw coords/values if useful


class TraceStep(BaseModel):
    """One auditable step of the agent's execution (this is what ISRO evaluates)."""
    stage: str                    # e.g. "inspect", "classify", "select", "execute", "fuse"
    detail: str
    data: dict[str, Any] = Field(default_factory=dict)


class ToolResult(BaseModel):
    """Uniform output shape every specialist tool must return."""
    text: str = ""
    evidence: list[Evidence] = Field(default_factory=list)
    confidence: float = 0.0
    tool_name: str = ""
    params_used: dict[str, Any] = Field(default_factory=dict)


class QueryResponse(BaseModel):
    """Final response to the frontend."""
    query: str
    task: Optional[Task] = None
    tools_used: list[str] = Field(default_factory=list)
    answer: str = ""
    confidence: float = 0.0
    evidence: list[Evidence] = Field(default_factory=list)
    trace: list[TraceStep] = Field(default_factory=list)
    input_config: Optional[InputConfig] = None
    ok: bool = True
    error: Optional[str] = None
    report_id: Optional[str] = None
