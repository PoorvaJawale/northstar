"""
Phase 0.5 — GeoTIFF / TIFF / PNG / JPEG reader.

Reads a real satellite image file and returns:
  - an ImageMeta (dimensions, band count, modality guess, geo-bounds)
  - a small base64 PNG preview for the UI
  - a numpy array for the models

Uses rasterio when available (true GeoTIFF + geotransform + many bands).
Falls back to Pillow for PNG/JPEG and plain TIFF so the app runs even
before rasterio/GDAL is installed.
"""
from __future__ import annotations
import base64
import io as _io
from pathlib import Path
from typing import Optional

import numpy as np
from PIL import Image

from ..schemas import ImageMeta, Modality

try:                                  # rasterio is optional
    import rasterio
    from rasterio.errors import RasterioIOError
    _HAS_RASTERIO = True
except Exception:                     # pragma: no cover
    _HAS_RASTERIO = False


def _guess_modality(bands: int, filename: str) -> Modality:
    """Heuristic modality guess. The user/registry can override this later.

    - Sentinel-1 / RISAT SAR products are typically 1-2 bands and often named
      with 's1'/'sar'/'vv'/'vh'.
    - Sentinel-2 / Cartosat optical is 3+ bands (RGB) or many (multispectral).
    NOTE: this is a *hint* only; the input inspector lets a query or filename
    convention correct it. It is NOT the task router.
    """
    name = filename.lower()
    if any(k in name for k in ("sar", "s1", "risat", "_vv", "_vh")):
        return "sar"
    if bands >= 5:
        return "multispectral"
    if bands >= 3:
        return "optical"
    if bands <= 2:
        return "sar"
    return "unknown"


def _to_preview_png_b64(arr: np.ndarray, max_side: int = 512) -> str:
    """Turn an (H,W) or (H,W,C) array into a small base64 PNG for the UI."""
    a = arr.astype(np.float32)
    if a.ndim == 2:
        a = a[..., None]
    # take up to 3 bands for display
    if a.shape[2] >= 3:
        disp = a[..., :3]
    else:
        disp = np.repeat(a[..., :1], 3, axis=2)
    # robust 2–98 percentile stretch (handles SAR dynamic range)
    lo, hi = np.percentile(disp, 2), np.percentile(disp, 98)
    if hi <= lo:
        hi = lo + 1.0
    disp = np.clip((disp - lo) / (hi - lo), 0, 1)
    img = Image.fromarray((disp * 255).astype(np.uint8))
    img.thumbnail((max_side, max_side))
    buf = _io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("ascii")


def read_image(path: str | Path) -> tuple[ImageMeta, np.ndarray]:
    """Read one image file. Returns (ImageMeta, array[H,W,C])."""
    path = Path(path)
    ext = path.suffix.lower()
    is_tif = ext in {".tif", ".tiff"}

    if _HAS_RASTERIO and is_tif:
        try:
            with rasterio.open(path) as ds:
                arr = ds.read()                     # (bands, H, W)
                arr = np.transpose(arr, (1, 2, 0))  # (H, W, bands)
                georef = ds.crs is not None
                bounds = list(ds.bounds) if georef else None
                fmt = "GeoTIFF" if georef else "TIFF"
                meta = ImageMeta(
                    filename=path.name, fmt=fmt,
                    width=ds.width, height=ds.height, bands=ds.count,
                    modality=_guess_modality(ds.count, path.name),
                    georeferenced=georef, bounds=bounds,
                    preview_png_b64=_to_preview_png_b64(arr),
                )
                return meta, arr
        except RasterioIOError as e:               # pragma: no cover
            raise ValueError(f"Could not read raster {path.name}: {e}")

    # ---- Pillow fallback (PNG/JPEG, or TIFF without rasterio) ----
    with Image.open(path) as im:
        im = im.convert("RGB") if im.mode not in ("RGB", "L") else im
        arr = np.array(im)
        if arr.ndim == 2:
            arr = arr[..., None]
        fmt = {".png": "PNG", ".jpg": "JPEG", ".jpeg": "JPEG"}.get(ext, "TIFF")
        meta = ImageMeta(
            filename=path.name, fmt=fmt,
            width=arr.shape[1], height=arr.shape[0], bands=arr.shape[2],
            modality=_guess_modality(arr.shape[2], path.name),
            georeferenced=False, bounds=None,
            preview_png_b64=_to_preview_png_b64(arr),
        )
        return meta, arr


def validate_format(meta: ImageMeta) -> Optional[str]:
    """PS rule: GeoTIFF/TIFF for geospatial; PNG/JPEG only for benchmark data."""
    if meta.fmt in {"GeoTIFF", "TIFF"}:
        return None
    if meta.fmt in {"PNG", "JPEG"}:
        return None  # accepted (benchmark inputs); flagged as non-geospatial upstream
    return f"Unsupported format: {meta.fmt}"
