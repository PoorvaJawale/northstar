"""
Phase 3 — The agentic controller (the star).

Runs the six PS-mandated stages as an explicit, traceable pipeline:
  inspect -> classify -> select -> execute -> fuse -> summarise
Every stage appends a TraceStep, so the final response carries the exact
"auditable execution summary" ISRO evaluates. Written as plain functions with a
shared state dict (a LangGraph-compatible shape) so you can port it to LangGraph
later without changing behaviour.

The pipeline is written once, as a *generator* (`stream`), that yields an event
before and after every stage. `run()` simply drains it and returns the final
response, so the blocking API and the SSE stream can never drift apart.
"""
from __future__ import annotations
import queue
import threading
import time
from typing import Any, Iterator

import numpy as np

from .registry import Registry
from . import intent as intent_mod
from .inspector import inspect
from .confidence import build_confidence
from ..geo.alignment import compute_alignment, alignment_gsd, coregister
from ..schemas import (QueryResponse, TraceStep, InputConfig, ImageMeta,
                       ToolResult, Evidence)

# Tasks whose primary output is a spatial mask (so the tool's confidence reads as
# evidence quality); everything else reads as model/answer certainty.
_MASK_TASKS = ("change_vqa", "change_map", "cross_modal", "disaster_risk", "flood_map",
               "landcover_area")

# Human-readable label shown live in the UI while a stage is running.
STAGE_LABELS: dict[str, str] = {
    "inspect": "Inspecting the uploaded imagery",
    "classify": "Classifying what you are asking for",
    "select": "Selecting a specialist model from the registry",
    "execute": "Running the model on your imagery",
    "fuse": "Fusing textual and spatial outputs",
    "summarise": "Writing the auditable summary",
}


def _ev(kind: str, **fields: Any) -> dict[str, Any]:
    return {"type": kind, **fields}


_PIPELINE_STEPS = {
    "change_vqa": ["Validate inputs", "Co-register (CRS / overlap)",
                   "Change Vector Analysis", "Otsu threshold", "Measure area", "Explain"],
    "change_map": ["Validate inputs", "Co-register (CRS / overlap)",
                   "Change Vector Analysis", "Otsu threshold", "Measure area", "Render map"],
    "cross_modal": ["Validate inputs", "Co-register optical + SAR",
                    "SAR backscatter thresholding", "Fuse with optical context", "Explain"],
    "disaster_risk": ["Validate inputs", "Analyse SAR / optical cues",
                      "Score disaster risk", "Explain"],
    "flood_map": ["Validate inputs", "Co-register (CRS / overlap)",
                  "Water-gain detection", "Measure flood extent", "Explain"],
    "single_vqa": ["Validate input", "GeoChat inference", "Score confidence", "Explain"],
    "single_caption": ["Validate input", "GeoChat captioning", "Explain"],
    "single_grounding": ["Validate input", "GeoChat grounding", "Draw region", "Explain"],
    "landcover_area": ["Validate input", "Segment land-cover class",
                       "Measure area (GSD)", "Render overlay", "Explain"],
}
_EST_SECONDS = {"single_vqa": 6, "single_caption": 6, "single_grounding": 7,
                "change_vqa": 1, "change_map": 1, "cross_modal": 1,
                "disaster_risk": 1, "flood_map": 1, "landcover_area": 1}


class Controller:
    def __init__(self, registry: Registry | None = None) -> None:
        self.registry = registry or Registry()

    # ---- plan preview (dry run: inspect + classify + select, no execute) --
    def plan(self, query: str, metas: list[ImageMeta]):
        """What the agent WOULD do — the pipeline, tool and inputs, without
        running the model. Powers the frontend's Analysis Plan Preview."""
        from ..schemas import PlanPreview
        cfg: InputConfig = inspect(metas)
        if not cfg.compatible:
            return PlanPreview(query=query, input_type=cfg.input_type,
                               n_images=cfg.n_images, compatible=False, note=cfg.issue)
        try:
            task, method, _note = intent_mod.classify(query, cfg.input_type)
        except ValueError as e:
            return PlanPreview(query=query, input_type=cfg.input_type,
                               n_images=cfg.n_images, compatible=False, note=str(e))
        eff_input = "single_image" if (task in ("single_vqa", "single_caption",
            "single_grounding") and cfg.n_images > 1) else cfg.input_type
        specs = self.registry.find(task, eff_input)
        tool = specs[0].name if specs else None
        inputs = [f"{m.modality} · {m.fmt}" + (f" · {m.crs}" if m.crs else "")
                  for m in cfg.images]
        return PlanPreview(
            query=query, input_type=cfg.input_type, n_images=cfg.n_images,
            task=task, method=method, tool=tool,
            pipeline=_PIPELINE_STEPS.get(task, ["Validate", "Run", "Explain"]),
            inputs=inputs, est_seconds=_EST_SECONDS.get(task),
            compatible=bool(specs),
            note=None if specs else f"no tool serves {task} for {eff_input}")

    # ---- blocking API (unchanged behaviour) ------------------------------
    def run(self, query: str, metas: list[ImageMeta],
            arrays: list[np.ndarray], user_params: dict | None = None) -> QueryResponse:
        response: QueryResponse | None = None
        for event in self.stream(query, metas, arrays, user_params):
            if event["type"] == "result":
                response = event["response"]
        assert response is not None, "pipeline ended without a result event"
        return response

    # ---- streaming API ---------------------------------------------------
    def stream(self, query: str, metas: list[ImageMeta],
               arrays: list[np.ndarray],
               user_params: dict | None = None) -> Iterator[dict[str, Any]]:
        """Yield one event per stage boundary, then a final `result` event.

        Event shapes (all JSON-serialisable except `result.response`):
          {"type": "stage",  "stage": ..., "status": "start", "label": ...}
          {"type": "stage",  "stage": ..., "status": "done",  "step": {...}}
          {"type": "log",    "stage": ..., "message": ..., "data": {...}}
          {"type": "result", "response": QueryResponse}
        """
        user_params = user_params or {}
        trace: list[TraceStep] = []
        clock = {"stage": time.perf_counter()}

        def done(step: TraceStep) -> dict[str, Any]:
            step.ms = int((time.perf_counter() - clock["stage"]) * 1000)
            trace.append(step)
            return _ev("stage", stage=step.stage, status="done",
                       step=step.model_dump())

        def start(stage: str, label: str | None = None) -> dict[str, Any]:
            clock["stage"] = time.perf_counter()
            return _ev("stage", stage=stage, status="start",
                       label=label or STAGE_LABELS.get(stage, stage))

        # 1) INSPECT ------------------------------------------------------
        yield start("inspect")
        cfg: InputConfig = inspect(metas)
        yield done(TraceStep(stage="inspect",
            detail=f"{cfg.n_images} image(s) -> input_type={cfg.input_type}",
            data={"modalities": cfg.modalities, "compatible": cfg.compatible,
                  "issue": cfg.issue}))
        if not cfg.compatible:
            yield _ev("result", response=QueryResponse(
                query=query, input_config=cfg, trace=trace, ok=False,
                error=cfg.issue, answer=f"Cannot proceed: {cfg.issue}"))
            return

        # 2) CLASSIFY -----------------------------------------------------
        yield start("classify")
        try:
            task, method, note = intent_mod.classify(query, cfg.input_type)
        except ValueError as e:
            yield _ev("result", response=QueryResponse(
                query=query, input_config=cfg, trace=trace, ok=False,
                error=str(e), answer=str(e)))
            return
        yield done(TraceStep(stage="classify",
            detail=f"task={task} (via {method})", data={"note": note}))

        # 3) SELECT -------------------------------------------------------
        yield start("select")
        # A single-image question asked on a 2-image scene is answered on ONE
        # image, instead of being forced into change/fusion just because two
        # images were uploaded. Only genuine change/fusion questions use both.
        SINGLE_TASKS = ("single_vqa", "single_caption", "single_grounding", "landcover_area")
        if task == "disaster_risk":
            eff_input, exec_arrays = "single_image", arrays
            route_note = "disaster risk accepts one scene and can use a second scene as supporting evidence"
        elif task in SINGLE_TASKS and cfg.n_images > 1:
            eff_input, exec_arrays = "single_image", arrays[:1]
            route_note = "single-image question on a multi-image scene -> analysing image 1"
        else:
            eff_input, exec_arrays = cfg.input_type, arrays
            route_note = None
        specs = self.registry.find(task, eff_input)
        if not specs:
            msg = f"No registered tool serves task={task} for input={eff_input}"
            yield done(TraceStep(stage="select", detail=msg))
            yield _ev("result", response=QueryResponse(
                query=query, task=task, input_config=cfg, trace=trace,
                ok=False, error=msg, answer=msg))
            return
        spec = specs[0]
        params = self.registry.filter_params(spec, user_params)   # permitted only
        sel_data = {"candidates": [s.name for s in specs], "permitted_params": params}
        if route_note:
            sel_data["routing"] = route_note
        yield done(TraceStep(stage="select",
            detail=f"selected tool={spec.name}", data=sel_data))

        # 3b) CO-REGISTER — true pixel reprojection for multi-image tasks so the
        # rasters are pixel-for-pixel comparable (falls back to pixel-grid + an
        # honest report when the inputs aren't georeferenced).
        if eff_input != "single_image" and len(exec_arrays) >= 2:
            exec_arrays, alignment = coregister(cfg.images, exec_arrays)
            trace.append(TraceStep(stage="select", kind="log",
                detail="co-register: " + (alignment.note or alignment.method),
                data={"method": alignment.method, "target_crs": alignment.target_crs,
                      "overlap_pct": alignment.overlap_pct, "gsd_m": alignment.gsd_m}))
        else:
            alignment = compute_alignment(cfg.images)

        # 4) EXECUTE ------------------------------------------------------
        yield start("execute", f"Running {spec.name} on your imagery")
        # The tool is the slow stage (model load + inference), so it runs on a
        # worker thread and pushes fine-grained progress ("loading weights",
        # "generating…") through a queue we drain live while it works.
        logs: list[TraceStep] = []
        for event in self._execute(spec, task, exec_arrays, query, params):
            if event["type"] == "log":
                logs.append(TraceStep(stage="execute", kind="log",
                                      detail=event["message"], data=event["data"]))
                yield event
            else:
                result: ToolResult = event["result"]
        yield done(TraceStep(stage="execute",
            detail=f"ran {spec.name}",
            data={"tool_confidence": result.confidence,
                  "evidence": [e.kind for e in result.evidence]}))
        # keep the tool's own progress in the audit trail, under its stage
        trace.extend(logs)

        # 5) FUSE + CONFIDENCE -------------------------------------------
        yield start("fuse")
        answer = result.text
        confidence = round(float(result.confidence), 3)

        # `alignment` was computed at the co-register step (true reprojection for
        # multi-image tasks, or a single-image / pixel-grid report otherwise).

        # explainable confidence: split the scalar into model / evidence / geo
        if result.confidence_breakdown is not None:
            breakdown = result.confidence_breakdown
        else:
            is_mask = task in _MASK_TASKS
            breakdown = build_confidence(
                model=None if is_mask else confidence,
                evidence_quality=confidence if is_mask else None,
                align=alignment)
        # physical extent, if the tool measured one — upgrade the pixel-fraction
        # the tool reported into real hectares when we know the ground resolution
        area = result.area
        gsd = alignment_gsd(alignment, cfg.images)
        if area is not None and gsd and not area.gsd_m and area.pct:
            from ..geo.alignment import measure_area
            total = int(round(area.pixels / (area.pct / 100.0)))
            area = measure_area(area.pixels, total, gsd)

        yield done(TraceStep(stage="fuse",
            detail="combined textual + spatial outputs; scored confidence",
            data={"confidence": breakdown.overall,
                  "confidence_dims": {"model": breakdown.model,
                                      "evidence_quality": breakdown.evidence_quality,
                                      "geospatial_validity": breakdown.geospatial_validity},
                  "alignment": {"method": alignment.method,
                                "target_crs": alignment.target_crs,
                                "gsd_m": alignment.gsd_m,
                                "overlap_pct": alignment.overlap_pct},
                  "area_ha": area.area_ha if area else None,
                  "n_evidence": len(result.evidence)}))

        # 6) SUMMARISE (the auditable trace is the response.trace itself) --
        yield _ev("result", response=QueryResponse(
            query=query, task=task, tools_used=[spec.name],
            answer=answer, confidence=confidence,
            confidence_breakdown=breakdown, area=area, alignment=alignment,
            evidence=result.evidence,
            trace=trace, input_config=cfg, ok=True,
        ))

    # ---- tool execution with live progress -------------------------------
    @staticmethod
    def _execute(spec, task, arrays, query, params) -> Iterator[dict[str, Any]]:
        """Run the tool on a worker thread, yielding its progress as it arrives,
        then one final {"type": "tool_result", "result": ToolResult}."""
        channel: "queue.Queue[dict | None]" = queue.Queue()
        outcome: dict[str, Any] = {}

        def work() -> None:
            try:
                outcome["result"] = spec.instance.run(task, arrays, query, params)
            except BaseException as exc:            # re-raised on this thread below
                outcome["error"] = exc
            finally:
                channel.put(None)

        spec.instance.set_progress(
            lambda message, data: channel.put({"message": message, "data": data}))
        worker = threading.Thread(target=work, name=f"tool-{spec.name}", daemon=True)
        worker.start()
        try:
            while True:
                item = channel.get()
                if item is None:
                    break
                yield _ev("log", stage="execute",
                          message=item["message"], data=item["data"])
        finally:
            worker.join()
            spec.instance.set_progress(None)

        if "error" in outcome:
            raise outcome["error"]
        yield _ev("tool_result", result=outcome["result"])
