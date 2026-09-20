"""
Phase 5 — Explainable confidence.

Replaces one opaque "92%" with named, defensible dimensions:
  - model:               how certain the model/answer itself was
  - evidence_quality:    how clean the mask / histogram separation is
  - geospatial_validity: were the inputs actually aligned / overlapping

The `overall` is the mean of whatever dimensions apply, and `reasons` explains it
in plain words. `calibration_state` stays "uncalibrated" — an honest label saying
these scores are not yet fit against ground-truth correctness.
"""
from __future__ import annotations
from typing import Optional

from ..schemas import ConfidenceBreakdown, Alignment


def _band(x: float) -> str:
    return "strong" if x >= 0.8 else "moderate" if x >= 0.6 else "limited"


def geospatial_validity(align: Optional[Alignment]) -> tuple[Optional[float], Optional[str]]:
    """Turn an alignment report into a 0..1 validity score + a reason string."""
    if align is None:
        return None, None
    # single image: validity reflects whether we actually have geo-metadata
    if align.method == "single-image":
        if align.target_crs:
            return 0.9, f"georeferenced ({align.target_crs})"
        return 0.5, "no CRS — pixel measurements only, not geo-validated"
    if not align.aligned:
        return 0.5, "inputs not georeferenced — pixel-grid comparison, no CRS check"
    if align.overlap_pct is not None:
        v = round(max(0.0, min(1.0, align.overlap_pct / 100.0)), 3)
        return v, f"geographic overlap {align.overlap_pct:.0f}% ({align.target_crs})"
    return 0.85, f"common CRS {align.target_crs}, overlap not computed"


def build_confidence(*, model: Optional[float] = None,
                     evidence_quality: Optional[float] = None,
                     align: Optional[Alignment] = None,
                     extra_reasons: Optional[list[str]] = None) -> ConfidenceBreakdown:
    """Assemble the structured confidence object from whatever dimensions apply."""
    geo, geo_reason = geospatial_validity(align)
    dims = {"model": model, "evidence_quality": evidence_quality,
            "geospatial_validity": geo}
    present = [v for v in dims.values() if v is not None]
    overall = round(sum(present) / len(present), 3) if present else 0.0

    reasons: list[str] = []
    if model is not None:
        reasons.append(f"model certainty {_band(model)} ({model:.2f})")
    if evidence_quality is not None:
        reasons.append(f"evidence quality {_band(evidence_quality)} ({evidence_quality:.2f})")
    if geo_reason:
        reasons.append(geo_reason)
    if extra_reasons:
        reasons.extend(extra_reasons)

    return ConfidenceBreakdown(
        overall=overall, model=model, evidence_quality=evidence_quality,
        geospatial_validity=geo, calibration_state="uncalibrated", reasons=reasons)
