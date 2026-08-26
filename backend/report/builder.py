"""
Phase 4.2 — Evidence report.

Renders the query, answer, confidence, evidence images and the full execution
trace into a self-contained HTML file (downloadable). HTML always works with no
native deps; PDF is optional (see INTERVENTION.md — WeasyPrint).
"""
from __future__ import annotations
import uuid
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

from .. import config
from ..schemas import QueryResponse

_env = Environment(
    loader=FileSystemLoader(str(Path(__file__).parent)),
    autoescape=select_autoescape(["html"]),
)


def build_html_report(resp: QueryResponse) -> str:
    """Write an HTML report to REPORT_DIR and return its report_id."""
    rid = uuid.uuid4().hex[:12]
    html = _env.get_template("template.html").render(r=resp)
    out = Path(config.REPORT_DIR) / f"{rid}.html"
    out.write_text(html, encoding="utf-8")
    return rid
