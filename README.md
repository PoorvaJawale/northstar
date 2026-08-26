# SatQuery AI — SIH 2026 · PS 26167 (ISRO)

An **agentic vision-language assistant for remote-sensing imagery**. Ask a
natural-language question about satellite image(s); an agent inspects the input,
classifies the task, picks the right specialist model from a registry, runs it,
and returns an evidence-grounded answer with an auditable execution trace.

> **Runs today with zero GPU.** The whole pipeline works in **MOCK mode** out of
> the box — real models are swapped in via one flag as they land. See
> [`INTERVENTION.md`](INTERVENTION.md) for exactly what your team must do.

---

## Quick start (MOCK mode — no GPU, no downloads)

```bash
python -m venv .venv
# Windows PowerShell:  .venv\Scripts\Activate.ps1
# macOS/Linux:         source .venv/bin/activate
pip install -r requirements.txt      # core deps only; heavy ML deps are commented out
uvicorn backend.main:app --reload
```

Open **http://localhost:8000** — upload 1 image (single-image tasks) or 2 (pair),
type a query, hit Run. Try the example chips. Run the tests:

```bash
pytest -q
```

---

## What maps to what (PS requirements → code)

| PS requirement | Where |
|---|---|
| Single-image VQA / caption / grounding | `backend/tools/geochat_tool.py` |
| Bi-temporal change-VQA / change map | `backend/tools/change_tool.py` |
| Optical–SAR cross-modal analysis | `backend/tools/optical_sar_tool.py` |
| RS adaptation (mandatory fine-tune) | `training/lora_finetune.py` |
| Agentic: classify the query | `backend/agent/intent.py` |
| Agentic: check inputs/compatibility | `backend/agent/inspector.py` |
| Agentic: select from a registry | `backend/agent/registry.py` + `tools/registry.yaml` |
| Agentic: execute + fuse + trace | `backend/agent/controller.py` |
| GeoTIFF/TIFF/PNG input | `backend/geo/io.py` |
| Web app + evidence + downloadable report | `frontend/` + `backend/report/` |

The **controller** (`controller.py`) runs the six PS-mandated stages in order:
`inspect → classify → select → execute → fuse → summarise`, appending a trace step
at each — that trace is the "auditable execution summary" ISRO evaluates.

## Switching to real models

Set environment variables and flip the switch (details in `INTERVENTION.md`):

```bash
# Windows PowerShell
$env:SATQUERY_MOCK = "0"          # use real models
$env:SATQUERY_USE_LLM = "1"       # use Ollama for real task routing
$env:LORA_ADAPTER = "models/lora-geochat"
uvicorn backend.main:app --reload
```

## Project layout

```
backend/   FastAPI app, agent (controller/intent/inspector/registry), tools, geo I/O, report
frontend/  static single-page UI (upload, answer, evidence, trace, registry viewer)
training/  BigEarthNet.txt subset + LoRA fine-tune + before/after eval
tests/     end-to-end agent tests (all 5 mandatory behaviours, MOCK mode)
```

## The "not hardcoded" guarantees
- **Routing** is done by an LLM classifier (`intent.py`), not keyword `if`s. (A dev
  fallback exists only so the app runs without Ollama — it is flagged `fallback` in
  the trace.)
- **Tools** are discovered from `registry.yaml` at runtime. Add a model = add a YAML
  block + one `Tool` subclass. Demo it live with the **reload registry** button.
- **Parameters** are filtered to each tool's declared `allowed_params` (PS: "configure
  only permitted task parameters").
