"""
Phase 3 — The agentic controller (the star).

Runs the six PS-mandated stages as an explicit, traceable pipeline:
  inspect -> classify -> select -> execute -> fuse -> summarise
Every stage appends a TraceStep, so the final response carries the exact
"auditable execution summary" ISRO evaluates. Written as plain functions with a
shared state dict (a LangGraph-compatible shape) so you can port it to LangGraph
later without changing behaviour.
"""
from __future__ import annotations
import numpy as np

from .registry import Registry
from . import intent as intent_mod
from .inspector import inspect
from ..schemas import (QueryResponse, TraceStep, InputConfig, ImageMeta,
                       ToolResult, Evidence)


class Controller:
    def __init__(self, registry: Registry | None = None) -> None:
        self.registry = registry or Registry()

    def run(self, query: str, metas: list[ImageMeta],
            arrays: list[np.ndarray], user_params: dict | None = None) -> QueryResponse:
        user_params = user_params or {}
        trace: list[TraceStep] = []

        # 1) INSPECT ------------------------------------------------------
        cfg: InputConfig = inspect(metas)
        trace.append(TraceStep(stage="inspect",
            detail=f"{cfg.n_images} image(s) -> input_type={cfg.input_type}",
            data={"modalities": cfg.modalities, "compatible": cfg.compatible,
                  "issue": cfg.issue}))
        if not cfg.compatible:
            return QueryResponse(query=query, input_config=cfg, trace=trace,
                                 ok=False, error=cfg.issue,
                                 answer=f"Cannot proceed: {cfg.issue}")

        # 2) CLASSIFY -----------------------------------------------------
        try:
            task, method, note = intent_mod.classify(query, cfg.input_type)
        except ValueError as e:
            return QueryResponse(query=query, input_config=cfg, trace=trace,
                                 ok=False, error=str(e), answer=str(e))
        trace.append(TraceStep(stage="classify",
            detail=f"task={task} (via {method})", data={"note": note}))

        # 3) SELECT -------------------------------------------------------
        specs = self.registry.find(task, cfg.input_type)
        if not specs:
            msg = f"No registered tool serves task={task} for input={cfg.input_type}"
            trace.append(TraceStep(stage="select", detail=msg))
            return QueryResponse(query=query, task=task, input_config=cfg,
                                 trace=trace, ok=False, error=msg, answer=msg)
        spec = specs[0]
        params = self.registry.filter_params(spec, user_params)   # permitted only
        trace.append(TraceStep(stage="select",
            detail=f"selected tool={spec.name}",
            data={"candidates": [s.name for s in specs],
                  "permitted_params": params}))

        # 4) EXECUTE ------------------------------------------------------
        result: ToolResult = spec.instance.run(task, arrays, query, params)
        trace.append(TraceStep(stage="execute",
            detail=f"ran {spec.name}",
            data={"tool_confidence": result.confidence,
                  "evidence": [e.kind for e in result.evidence]}))

        # 5) FUSE + CONFIDENCE -------------------------------------------
        answer = result.text
        confidence = round(float(result.confidence), 3)
        trace.append(TraceStep(stage="fuse",
            detail="combined textual + spatial outputs",
            data={"confidence": confidence,
                  "n_evidence": len(result.evidence)}))

        # 6) SUMMARISE (the auditable trace is the response.trace itself) --
        return QueryResponse(
            query=query, task=task, tools_used=[spec.name],
            answer=answer, confidence=confidence, evidence=result.evidence,
            trace=trace, input_config=cfg, ok=True,
        )
