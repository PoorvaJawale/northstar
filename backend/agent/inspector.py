"""
Phase 3.3 — Input inspector.

Looks at the uploaded image(s) and decides the INPUT TYPE:
  1 image                      -> single_image
  2 images, one optical+one SAR-> optical_sar_pair
  2 images, same modality      -> bitemporal_pair
It also validates formats and flags incompatibilities BEFORE any model runs,
so "detect change with one image" is refused cleanly instead of crashing.
"""
from __future__ import annotations
import numpy as np

from ..schemas import InputConfig, ImageMeta, InputType, Modality
from ..geo.io import validate_format


def infer_input_type(metas: list[ImageMeta]) -> InputType:
    n = len(metas)
    if n == 1:
        return "single_image"
    if n == 2:
        mods = {m.modality for m in metas}
        # optical/multispectral + sar => cross-modal pair
        has_sar = any(m.modality == "sar" for m in metas)
        has_opt = any(m.modality in ("optical", "multispectral") for m in metas)
        if has_sar and has_opt:
            return "optical_sar_pair"
        return "bitemporal_pair"
    return "unknown"


def inspect(metas: list[ImageMeta]) -> InputConfig:
    modalities: list[Modality] = [m.modality for m in metas]
    itype = infer_input_type(metas)

    # format validation
    for m in metas:
        issue = validate_format(m)
        if issue:
            return InputConfig(input_type=itype, n_images=len(metas),
                               modalities=modalities, images=metas,
                               compatible=False, issue=issue)

    # dimension compatibility for pairs. Georeferenced pairs may differ in size /
    # resolution — true co-registration reprojects them onto a common grid, so we
    # do NOT reject those. Only non-georeferenced pairs (matched by pixel-grid
    # resize) must be similar in size.
    if len(metas) == 2:
        a, b = metas
        both_geo = a.georeferenced and b.georeferenced
        if not both_geo and (
                abs(a.width - b.width) > max(a.width, b.width) * 0.25 or
                abs(a.height - b.height) > max(a.height, b.height) * 0.25):
            return InputConfig(input_type=itype, n_images=2, modalities=modalities,
                               images=metas, compatible=False,
                               issue="The two images differ too much in size to be a "
                                     "co-registered pair. Provide spatially aligned images "
                                     "(or georeferenced GeoTIFFs, which are auto-aligned).")

    if itype == "unknown":
        return InputConfig(input_type=itype, n_images=len(metas), modalities=modalities,
                           images=metas, compatible=False,
                           issue=f"Unsupported number of images: {len(metas)} "
                                 "(expected 1 single image, or 2 for a pair).")

    return InputConfig(input_type=itype, n_images=len(metas),
                       modalities=modalities, images=metas, compatible=True)
