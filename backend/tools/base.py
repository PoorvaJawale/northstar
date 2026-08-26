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
from typing import Any

import numpy as np

from ..schemas import ToolResult, Task


class Tool(ABC):
    """Base class for every specialist tool."""

    #: unique name, must match the `name:` in registry.yaml
    name: str = "base"
    #: tasks this tool can answer
    tasks: list[Task] = []

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
