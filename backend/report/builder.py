"""
Phase 4.2 — Evidence report.

Renders the query, answer, confidence, input metadata, visual evidence and the
full timed execution trace into two self-contained files under REPORT_DIR:

    <report_id>.html   always written (no native deps)
    <report_id>.pdf    written when reportlab is installed (pure-Python wheel)

House style: no em dashes anywhere, in our own copy or in model output, so the
sanitiser below rewrites them before anything reaches a page.
"""
from __future__ import annotations
import base64
import io
import json
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any

from jinja2 import Environment, FileSystemLoader, select_autoescape

from .. import config
from ..schemas import QueryResponse, ImageMeta, TraceStep

_env = Environment(
    loader=FileSystemLoader(str(Path(__file__).parent)),
    autoescape=select_autoescape(["html"]),
)


# ---------------------------------------------------------------- helpers --
def clean(text: Any) -> str:
    """House style: no em dashes. Model output can contain them, so every
    string that reaches a report goes through here first."""
    s = "" if text is None else str(text)
    for dash in ("—", "―"):          # em dash, horizontal bar
        s = s.replace(f" {dash} ", ", ").replace(dash, ", ")
    s = s.replace(" – ", ", ").replace("–", "-")   # en dash
    return s


def _pretty(value: Any) -> str:
    """One-line, readable rendering of a payload value. Lists and dicts of
    scalars read as prose rather than raw JSON, and floats lose the binary
    noise (241.45000000000002 becomes 241.45)."""
    if isinstance(value, bool) or value is None:
        return {True: "yes", False: "no", None: "not set"}[value]
    if isinstance(value, float):
        return f"{value:.3f}".rstrip("0").rstrip(".") or "0"
    if isinstance(value, list):
        if not value:
            return "none"
        if all(not isinstance(v, (dict, list)) for v in value):
            return ", ".join(_pretty(v) for v in value)
        return clean(json.dumps(value, ensure_ascii=False))
    if isinstance(value, dict):
        if not value:
            return "none"
        if all(not isinstance(v, (dict, list)) for v in value.values()):
            return ", ".join(f"{k}: {_pretty(v)}" for k, v in value.items())
        return clean(json.dumps(value, ensure_ascii=False))
    return clean(value)


def _duration(ms: int | None) -> str:
    if ms is None:
        return ""
    if ms < 1000:
        return f"{ms} ms"
    if ms < 60_000:
        return f"{ms / 1000:.1f} s"
    return f"{ms // 60000} min {(ms % 60000) / 1000:.0f} s"


def _scene_rows(meta: ImageMeta) -> list[tuple[str, str]]:
    rows = [
        ("File", clean(meta.filename)),
        ("Format", clean(meta.fmt)),
        ("Size", f"{meta.width} x {meta.height} px"),
        ("Bands", str(meta.bands)),
        ("Modality", clean(meta.modality)),
        ("Georeferenced", "yes" if meta.georeferenced else "no"),
    ]
    if meta.bounds:
        rows.append(("Bounds", ", ".join(f"{b:.5f}" for b in meta.bounds)))
    return rows


def _summary_rows(resp: QueryResponse, total_ms: int) -> list[tuple[str, str]]:
    cfg = resp.input_config
    stages = [s for s in resp.trace if s.kind == "stage"]
    return [
        ("Status", "completed" if resp.ok else f"failed: {clean(resp.error)}"),
        ("Task", clean(resp.task or "not classified")),
        ("Tools used", clean(", ".join(resp.tools_used) or "none")),
        ("Confidence", f"{resp.confidence * 100:.1f}%"),
        ("Input type", clean(cfg.input_type if cfg else "unknown")),
        ("Modalities", clean(", ".join(cfg.modalities) if cfg else "unknown")),
        ("Scenes", str(cfg.n_images if cfg else 0)),
        ("Evidence artifacts", str(len(resp.evidence))),
        ("Pipeline stages", str(len(stages))),
        ("Total runtime", _duration(total_ms)),
        ("Execution mode", "mock" if config.MOCK_MODE else "live models"),
        ("Intent router", "LLM" if config.USE_LLM_INTENT else "fallback classifier"),
    ]


def _trace_view(resp: QueryResponse) -> list[dict[str, Any]]:
    """Flatten the trace into render-ready rows: each stage carries its own
    duration, payload and the tool logs recorded underneath it."""
    rows: list[dict[str, Any]] = []
    for step in resp.trace:
        if step.kind == "log":
            host = next((r for r in reversed(rows) if r["stage"] == step.stage), None)
            if host is None:
                continue          # a log with no stage of its own to sit under
            host["logs"].append({
                "detail": clean(step.detail),
                "payload": [(k, _pretty(v)) for k, v in (step.data or {}).items()]})
            continue
        rows.append({
            "index": len(rows) + 1,
            "stage": clean(step.stage),
            "detail": clean(step.detail),
            "ms": step.ms,
            "duration": _duration(step.ms),
            "payload": [(k, _pretty(v)) for k, v in (step.data or {}).items()],
            "logs": [],
        })
    return rows


# ------------------------------------------------------------------ HTML --
def _render_html(resp: QueryResponse, rid: str, generated: str,
                 stages: list[dict[str, Any]], total_ms: int) -> str:
    return _env.get_template("template.html").render(
        r=resp,
        report_id=rid,
        generated=generated,
        query=clean(resp.query),
        answer=clean(resp.answer or "No answer was produced."),
        confidence_pct=round(resp.confidence * 100, 1),
        summary=_summary_rows(resp, total_ms),
        scenes=[_scene_rows(m) for m in (resp.input_config.images if resp.input_config else [])],
        evidence=[{"label": clean(e.label or e.kind), "kind": clean(e.kind),
                   "image_b64": e.image_b64,
                   "payload": [(k, _pretty(v)) for k, v in (e.data or {}).items()]}
                  for e in resp.evidence],
        stages=stages,
        total_ms=total_ms,
        max_ms=max([s["ms"] or 0 for s in stages] or [1]) or 1,
    )


# ------------------------------------------------------------------- PDF --
def _render_pdf(resp: QueryResponse, rid: str, generated: str,
                stages: list[dict[str, Any]], total_ms: int, out: Path) -> bool:
    """Build the PDF with reportlab. Returns False if reportlab is missing, in
    which case the HTML report is still available."""
    try:
        from reportlab.lib import colors
        from reportlab.lib.enums import TA_LEFT
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import ParagraphStyle
        from reportlab.lib.units import mm
        from reportlab.lib.utils import ImageReader
        from reportlab.platypus import (BaseDocTemplate, Frame, PageTemplate,
                                        Paragraph, Spacer, Table, TableStyle,
                                        Image as RLImage, KeepTogether)
    except ImportError:
        return False

    INK = colors.HexColor("#10151f")
    MUTED = colors.HexColor("#5b6472")
    RULE = colors.HexColor("#dbe0e8")
    WASH = colors.HexColor("#f4f6f9")
    ACCENT = colors.HexColor("#1c5fd6")
    TEAL = colors.HexColor("#0d8f8a")

    body = ParagraphStyle("body", fontName="Helvetica", fontSize=9.5, leading=14,
                          textColor=INK, alignment=TA_LEFT)
    mono = ParagraphStyle("mono", parent=body, fontName="Courier", fontSize=8,
                          leading=11, textColor=colors.HexColor("#2b3444"),
                          wordWrap="CJK")
    label = ParagraphStyle("label", parent=body, fontName="Helvetica-Bold",
                           fontSize=7.5, leading=10, textColor=MUTED)
    h1 = ParagraphStyle("h1", parent=body, fontName="Helvetica-Bold", fontSize=20,
                        leading=24, textColor=INK, spaceAfter=2)
    h2 = ParagraphStyle("h2", parent=body, fontName="Helvetica-Bold", fontSize=10,
                        leading=13, textColor=ACCENT, spaceBefore=14, spaceAfter=6)
    answer_style = ParagraphStyle("answer", parent=body, fontName="Helvetica",
                                  fontSize=12, leading=18)
    stage_style = ParagraphStyle("stage", parent=body, fontName="Helvetica-Bold",
                                 fontSize=10, leading=13)

    content_w = A4[0] - 36 * mm

    def esc(text: str) -> str:
        return (str(text).replace("&", "&amp;").replace("<", "&lt;")
                .replace(">", "&gt;"))

    def kv_table(rows: list[tuple[str, str]], key_w: float = 34 * mm,
                 value_style=None) -> Table:
        data = [[Paragraph(esc(k), label), Paragraph(esc(v), value_style or body)]
                for k, v in rows]
        t = Table(data, colWidths=[key_w, content_w - key_w], hAlign="LEFT")
        t.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ("LINEBELOW", (0, 0), (-1, -2), 0.4, RULE),
        ]))
        return t

    def section(title: str) -> Paragraph:
        return Paragraph(esc(title.upper()), h2)

    def panel(flowables: list, bg=WASH) -> Table:
        t = Table([[flowables]], colWidths=[content_w], hAlign="LEFT")
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), bg),
            ("BOX", (0, 0), (-1, -1), 0.5, RULE),
            ("LEFTPADDING", (0, 0), (-1, -1), 10),
            ("RIGHTPADDING", (0, 0), (-1, -1), 10),
            ("TOPPADDING", (0, 0), (-1, -1), 9),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
        ]))
        return t

    story: list = []

    # Title block
    story.append(Paragraph("SatQuery AI Evidence Report", h1))
    story.append(Paragraph(
        esc(f"PS 26167 | ISRO | agentic remote sensing assistant"),
        ParagraphStyle("sub", parent=body, fontName="Courier", fontSize=8.5,
                       textColor=MUTED, spaceAfter=2)))
    story.append(Paragraph(
        esc(f"Report {rid} | generated {generated}"),
        ParagraphStyle("sub2", parent=body, fontName="Courier", fontSize=8.5,
                       textColor=MUTED, spaceAfter=10)))

    # Query and answer
    story.append(section("Query"))
    story.append(panel([Paragraph(esc(clean(resp.query)), answer_style)]))
    story.append(section("Answer"))
    conf = Paragraph(
        f'<font color="#0d8f8a"><b>Confidence {resp.confidence * 100:.1f}%</b></font>'
        f'<font color="#5b6472">   |   task {esc(clean(resp.task or "not classified"))}'
        f'   |   tool {esc(clean(", ".join(resp.tools_used) or "none"))}</font>',
        ParagraphStyle("conf", parent=body, fontSize=8.5, spaceBefore=8))
    story.append(panel([Paragraph(esc(clean(resp.answer or "No answer was produced.")),
                                  answer_style), conf]))

    # Run summary
    story.append(section("Run summary"))
    story.append(kv_table(_summary_rows(resp, total_ms)))

    # Input scenes
    scenes = resp.input_config.images if resp.input_config else []
    if scenes:
        scene_head: list = [section(f"Input scenes ({len(scenes)})")]
        for i, meta in enumerate(scenes, 1):
            story.append(KeepTogether(scene_head + [
                Paragraph(f"Scene {i}", stage_style),
                Spacer(1, 3),
                kv_table(_scene_rows(meta)),
                Spacer(1, 8),
            ]))
            scene_head = []            # heading travels with the first scene

    # Visual evidence
    if resp.evidence:
        pending_head: list = [section(f"Visual evidence ({len(resp.evidence)})")]
        for ev in resp.evidence:
            block: list = pending_head + [
                Paragraph(esc(clean(ev.label or ev.kind)), stage_style),
                Spacer(1, 4)]
            pending_head = []          # heading travels with its first block
            if ev.image_b64:
                try:
                    raw = io.BytesIO(base64.b64decode(ev.image_b64))
                    iw, ih = ImageReader(raw).getSize()
                    w = min(content_w, 120 * mm)
                    block.append(RLImage(raw, width=w, height=w * ih / iw))
                    block.append(Spacer(1, 5))
                except Exception:
                    block.append(Paragraph("Evidence image could not be embedded.", body))
            if ev.data:
                block.append(kv_table([(k, _pretty(v)) for k, v in ev.data.items()],
                                      value_style=mono))
            block.append(Spacer(1, 10))
            story.append(KeepTogether(block))

    # Execution trace
    trace_head: list = [
        section("Auditable execution trace"),
        Paragraph("Every stage the agent ran, in order, with its wall clock "
                  "duration, the payload it recorded and the progress the "
                  "selected tool reported while it worked.",
                  ParagraphStyle("note", parent=body, textColor=MUTED,
                                 fontSize=8.5, spaceAfter=8)),
    ]
    for row in stages:
        block: list = trace_head
        trace_head = []                # heading travels with the first stage
        head = Table([[
            Paragraph(f'<font color="#5b6472">{row["index"]:02d}</font>  '
                      f'{esc(row["stage"].upper())}', stage_style),
            Paragraph(f'<font color="#5b6472">{esc(row["duration"])}</font>',
                      ParagraphStyle("dur", parent=body, alignment=2, fontSize=8.5)),
        ]], colWidths=[content_w - 30 * mm, 30 * mm], hAlign="LEFT")
        head.setStyle(TableStyle([
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
            ("VALIGN", (0, 0), (-1, -1), "BOTTOM"),
            ("LINEBELOW", (0, 0), (-1, -1), 0.8, ACCENT),
        ]))
        block += [head, Spacer(1, 4), Paragraph(esc(row["detail"]), body)]
        if row["payload"]:
            block += [Spacer(1, 4), kv_table(row["payload"], key_w=30 * mm,
                                             value_style=mono)]
        for log in row["logs"]:
            entry = [Paragraph(f'<font color="#0d8f8a">&#9679;</font> '
                               f'{esc(log["detail"])}',
                               ParagraphStyle("log", parent=body, fontSize=9))]
            if log["payload"]:
                entry.append(kv_table(log["payload"], key_w=26 * mm, value_style=mono))
            inner = Table([[entry]], colWidths=[content_w - 6 * mm], hAlign="RIGHT")
            inner.setStyle(TableStyle([
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
                ("LINEBEFORE", (0, 0), (0, -1), 1.2, RULE),
            ]))
            block.append(inner)
        block.append(Spacer(1, 12))
        story.append(KeepTogether(block))

    def decorate(canvas, doc) -> None:
        canvas.saveState()
        canvas.setFont("Courier", 7.5)
        canvas.setFillColor(MUTED)
        canvas.drawString(18 * mm, A4[1] - 12 * mm, "SATQUERY AI EVIDENCE REPORT")
        canvas.drawRightString(A4[0] - 18 * mm, A4[1] - 12 * mm, rid)
        canvas.setStrokeColor(RULE)
        canvas.setLineWidth(0.5)
        canvas.line(18 * mm, A4[1] - 14.5 * mm, A4[0] - 18 * mm, A4[1] - 14.5 * mm)
        canvas.line(18 * mm, 15 * mm, A4[0] - 18 * mm, 15 * mm)
        canvas.drawString(18 * mm, 11 * mm, generated)
        canvas.drawRightString(A4[0] - 18 * mm, 11 * mm, f"Page {doc.page}")
        canvas.restoreState()

    doc = BaseDocTemplate(str(out), pagesize=A4,
                          leftMargin=18 * mm, rightMargin=18 * mm,
                          topMargin=20 * mm, bottomMargin=20 * mm,
                          title=f"SatQuery AI Evidence Report {rid}",
                          author="SatQuery AI", subject=clean(resp.query))
    frame = Frame(doc.leftMargin, doc.bottomMargin, content_w,
                  A4[1] - doc.topMargin - doc.bottomMargin, id="body")
    doc.addPageTemplates([PageTemplate(id="main", frames=[frame], onPage=decorate)])
    doc.build(story)
    return True


# ------------------------------------------------------------------- API --
def build_report(resp: QueryResponse) -> str:
    """Write the HTML report (always) and the PDF (when reportlab is present)
    to REPORT_DIR, and return the shared report_id."""
    rid = uuid.uuid4().hex[:12]
    generated = datetime.now().strftime("%d %b %Y, %H:%M:%S")
    stages = _trace_view(resp)
    total_ms = sum(s["ms"] or 0 for s in stages)

    out_dir = Path(config.REPORT_DIR)
    (out_dir / f"{rid}.html").write_text(
        _render_html(resp, rid, generated, stages, total_ms), encoding="utf-8")
    try:
        _render_pdf(resp, rid, generated, stages, total_ms, out_dir / f"{rid}.pdf")
    except Exception:
        pass          # a PDF failure must never cost the user their HTML report
    return rid


# Back-compatible alias: the HTML report is still the default artifact.
build_html_report = build_report
