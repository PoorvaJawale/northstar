"""
Phase 1.1 — The Tool interface.

Every specialist model (GeoChat, change model, optical-SAR fusion) implements
this one class. The agent only ever talks to tools through this shape, which is
what lets you add a new model by (a) writing one subclass and (b) adding a block
to registry.yaml — with ZERO changes to the controller. That is the PS's
"select from a predefined registry / extensible without redesign" requirement.
"""
from __future__ import annotations
from abc import ABC, abstractmethod
from typing import Any, Callable, Optional

import numpy as np

from ..schemas import ToolResult, Task

#: (message, data) -> None. The controller installs one of these while a tool
#: runs so the UI can show what the model is doing, live.
ProgressFn = Callable[[str, dict], None]


class Tool(ABC):
    """Base class for every specialist tool."""

    #: unique name, must match the `name:` in registry.yaml
    name: str = "base"
    #: tasks this tool can answer
    tasks: list[Task] = []

    #: set by the controller for the duration of one run (see `emit`)
    _progress: Optional[ProgressFn] = None

    def set_progress(self, fn: Optional[ProgressFn]) -> None:
        self._progress = fn

    def emit(self, message: str, **data: Any) -> None:
        """Report what this tool is doing right now. No-op when nobody listens,
        so tools stay usable outside the agent (scripts, tests, notebooks)."""
        if self._progress is not None:
            self._progress(message, data)

    @abstractmethod
    def run(
        self,
        task: Task,
        images: list[np.ndarray],
        query: str,
        params: dict[str, Any] | None = None,
    ) -> ToolResult:
        """Execute the task on the given image(s) and return a uniform result."""
        raise NotImplementedError

    def can_handle(self, task: Task) -> bool:
        return task in self.tasks
