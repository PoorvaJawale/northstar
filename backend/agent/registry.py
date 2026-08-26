"""
Phase 3.1 — Model registry loader.

Reads registry.yaml at runtime, imports each Tool subclass, and answers
"which tool(s) can serve this task + input type?" Adding a model is a YAML
edit + a Tool subclass — the controller never changes.
"""
from __future__ import annotations
import importlib
from dataclasses import dataclass, field
from typing import Any

import yaml

from .. import config
from ..tools.base import Tool
from ..schemas import Task, InputType


@dataclass
class ToolSpec:
    name: str
    tasks: list[str]
    input_type: str
    modalities: list[str]
    allowed_params: dict[str, Any] = field(default_factory=dict)
    outputs: list[str] = field(default_factory=list)
    instance: Tool | None = None


class Registry:
    def __init__(self, path=None) -> None:
        self.path = path or config.REGISTRY_PATH
        self.specs: dict[str, ToolSpec] = {}
        self.load()

    def load(self) -> None:
        raw = yaml.safe_load(open(self.path, "r", encoding="utf-8"))
        specs: dict[str, ToolSpec] = {}
        for t in raw.get("tools", []):
            mod = importlib.import_module(t["module"])
            cls = getattr(mod, t["class"])
            inst = cls()
            specs[t["name"]] = ToolSpec(
                name=t["name"], tasks=t["tasks"], input_type=t["input_type"],
                modalities=t.get("modalities", []),
                allowed_params=t.get("allowed_params", {}),
                outputs=t.get("outputs", []), instance=inst,
            )
        self.specs = specs

    # ---- discovery used by the tool selector -----------------------------
    def find(self, task: Task, input_type: InputType) -> list[ToolSpec]:
        """Return tools that can serve this task AND accept this input type."""
        return [s for s in self.specs.values()
                if task in s.tasks and s.input_type == input_type]

    def tasks_for_input(self, input_type: InputType) -> list[str]:
        out: list[str] = []
        for s in self.specs.values():
            if s.input_type == input_type:
                out.extend(s.tasks)
        return sorted(set(out))

    def filter_params(self, spec: ToolSpec, params: dict[str, Any]) -> dict[str, Any]:
        """PS: 'configure only permitted task parameters'. Drop anything not
        declared in allowed_params, and clamp to declared min/max."""
        clean: dict[str, Any] = {}
        for k, rule in spec.allowed_params.items():
            val = params.get(k, rule.get("default"))
            if val is None:
                continue
            if "min" in rule:
                val = max(rule["min"], val)
            if "max" in rule:
                val = min(rule["max"], val)
            clean[k] = val
        return clean

    def describe_for_llm(self) -> str:
        """A compact description of every tool, fed to the intent LLM so it can
        route to real capabilities rather than guessing."""
        lines = []
        for s in self.specs.values():
            lines.append(f"- tools={s.name}; tasks={s.tasks}; input_type={s.input_type}")
        return "\n".join(lines)
