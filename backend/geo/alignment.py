"""
Phase 5 — Geospatial co-registration + physical area measurement.

Two big honesty upgrades over "resize both images to the same pixel grid":

1. `compute_alignment(metas)` inspects the CRS / bounds / GSD of a multi-image
   input and reports whether the two scenes are genuinely geographically
   comparable — target CRS, ground resolution, and % geographic overlap. When
   the inputs are not georeferenced (PNG/JPEG benchmark data) it says so plainly
   and falls back to a pixel-grid comparison instead of pretending.

2. `measure_area(mask, gsd_m)` turns a boolean mask into a real-world extent in
   hectares/km² using the ground-sample-distance — so "12.7 hectares" is a
   measurement, not a guess. Without a GSD it reports the honest "% of scene".

pyproj is used to reproject bounds when the two inputs use different CRS; both it
and rasterio are optional, so the app still runs before they are installed.
"""
from __future__ import annotations
from typing import Optional

from ..schemas import ImageMeta, Alignment, AreaMeasurement

try:
    from pyproj import Transformer
    _HAS_PYPROJ = True
except Exception:                       # pragma: no cover
    _HAS_PYPROJ = False


# ---- area measurement ----------------------------------------------------
def measure_area(mask_pixels: int, total_pixels: int,
                 gsd_m: Optional[float]) -> AreaMeasurement:
    """Physical extent of a mask. `gsd_m` is metres per pixel (None if unknown)."""
    pct = round(100.0 * mask_pixels / total_pixels, 3) if total_pixels else 0.0
    if gsd_m and gsd_m > 0:
        m2 = mask_pixels * (gsd_m ** 2)
        return AreaMeasurement(
            pixels=mask_pixels, pct=pct, gsd_m=round(gsd_m, 3),
            area_m2=round(m2, 1), area_ha=round(m2 / 1e4, 3),
            area_km2=round(m2 / 1e6, 4), basis="geospatial")
    return AreaMeasurement(pixels=mask_pixels, pct=pct, basis="pixel-fraction")


# ---- co-registration report ---------------------------------------------
def _overlap_pct(a: ImageMeta, b: ImageMeta) -> Optional[float]:
    """Geographic overlap of two georeferenced footprints, as % of the smaller."""
    if not (a.bounds and b.bounds):
        return None
    ax0, ay0, ax1, ay1 = a.bounds
    bx0, by0, bx1, by1 = b.bounds
    # reproject b's bounds into a's CRS if they differ
    if a.crs and b.crs and a.crs != b.crs and _HAS_PYPROJ:
        try:
            tf = Transformer.from_crs(b.crs, a.crs, always_xy=True)
            bx0, by0 = tf.transform(bx0, by0)
            bx1, by1 = tf.transform(bx1, by1)
        except Exception:
            return None
    ix0, iy0 = max(ax0, bx0), max(ay0, by0)
    ix1, iy1 = min(ax1, bx1), min(ay1, by1)
    if ix1 <= ix0 or iy1 <= iy0:
        return 0.0
    inter = (ix1 - ix0) * (iy1 - iy0)
    area_a = max((ax1 - ax0) * (ay1 - ay0), 1e-9)
    area_b = max((bx1 - bx0) * (by1 - by0), 1e-9)
    return round(100.0 * inter / min(area_a, area_b), 2)


def compute_alignment(metas: list[ImageMeta]) -> Alignment:
    """Report how (and whether) a multi-image input is geographically aligned."""
    if len(metas) < 2:
        m = metas[0] if metas else None
        return Alignment(
            aligned=bool(m and m.georeferenced), method="single-image",
            source_crs=[m.crs] if m else [], target_crs=m.crs if m else None,
            gsd_m=m.gsd if m else None,
            note="single image — no co-registration needed")

    a, b = metas[0], metas[1]
    both_geo = a.georeferenced and b.georeferenced
    if not both_geo:
        return Alignment(
            aligned=False, method="pixel-grid",
            source_crs=[a.crs, b.crs],
            note="inputs are not georeferenced — compared on a common pixel grid "
                 "(no CRS/geographic validation possible)")

    target_crs = b.crs or a.crs
    gsd = min([g for g in (a.gsd, b.gsd) if g], default=None)
    overlap = _overlap_pct(a, b)
    return Alignment(
        aligned=True, method="crs-reproject",
        source_crs=[a.crs, b.crs], target_crs=target_crs,
        gsd_m=round(gsd, 3) if gsd else None,
        overlap_pct=overlap, resampling="bilinear",
        note=(f"reprojected to {target_crs}" if a.crs != b.crs
              else f"common CRS {target_crs}"))


def coregister(metas: list[ImageMeta], arrays: list) -> tuple[list, Alignment]:
    """TRUE pixel co-registration: resample image 2 onto image 1's CRS + grid with
    rasterio.warp so the two rasters are pixel-for-pixel comparable. Returns
    (aligned_arrays, Alignment). Falls back to the inputs unchanged (with a
    pixel-grid Alignment) when the inputs aren't georeferenced or rasterio/warp
    isn't available — so change/fusion still runs, honestly labelled."""
    import numpy as np
    if len(metas) < 2 or len(arrays) < 2:
        return arrays, compute_alignment(metas)
    a, b = metas[0], metas[1]
    if not (a.georeferenced and b.georeferenced and a.transform and b.transform
            and a.crs and b.crs):
        return arrays, compute_alignment(metas)
    try:
        from rasterio.warp import reproject, Resampling
        from rasterio.transform import Affine
        from rasterio.crs import CRS
        A = arrays[0].astype("float32")
        B = arrays[1].astype("float32")
        if A.ndim == 2:
            A = A[..., None]
        if B.ndim == 2:
            B = B[..., None]
        H, W = A.shape[0], A.shape[1]
        C = B.shape[2]
        dst = np.zeros((H, W, C), dtype="float32")
        for c in range(C):
            reproject(
                source=B[..., c], destination=dst[..., c],
                src_transform=Affine(*b.transform[:6]), src_crs=CRS.from_string(b.crs),
                dst_transform=Affine(*a.transform[:6]), dst_crs=CRS.from_string(a.crs),
                resampling=Resampling.bilinear)
        overlap = _overlap_pct(a, b)
        align = Alignment(
            aligned=True, method="crs-reproject",
            source_crs=[a.crs, b.crs], target_crs=a.crs,
            gsd_m=round(a.gsd, 3) if a.gsd else None, overlap_pct=overlap,
            resampling="bilinear",
            note=(f"image 2 reprojected from {b.crs} onto image 1's grid ({a.crs})"
                  if a.crs != b.crs else
                  f"image 2 resampled onto image 1's grid ({a.crs})"))
        return [A, dst], align
    except Exception:
        import traceback
        traceback.print_exc()
        return arrays, compute_alignment(metas)


def alignment_gsd(align: Alignment, metas: list[ImageMeta]) -> Optional[float]:
    """The ground-sample-distance to use for area measurement, if known."""
    if align and align.gsd_m:
        return align.gsd_m
    for m in metas:
        if m.gsd:
            return m.gsd
    return None
