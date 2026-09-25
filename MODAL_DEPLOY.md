# Deploy the SatQuery backend on Modal (real GPU, no laptop)

This puts GeoChat-7B on a Modal GPU that scales to zero when idle — the deployed
link works without your laptop, and costs ~nothing between demos (covered by
Modal's monthly free credits). First request after idle is a ~30–90s cold start.

## Prerequisites
- A Modal account: https://modal.com (sign up, free credits included).
- Python + pip locally (your `.venv311` is fine).

## One-time setup

**1. Install Modal and sign in**
```powershell
.\.venv311\Scripts\python.exe -m pip install modal
.\.venv311\Scripts\python.exe -m modal token new
```
(`token new` opens the browser to authenticate.)

**2. Download GeoChat-7B into a Modal Volume (~14 GB, once)**
```powershell
.\.venv311\Scripts\python.exe -m modal run modal_app.py::download_weights
```

**3. Upload your LoRA adapter to the same Volume**
```powershell
.\.venv311\Scripts\python.exe -m modal volume put satquery-models models/geochat-rsvqa-lora /geochat-rsvqa-lora
```

**4. Deploy**
```powershell
.\.venv311\Scripts\python.exe -m modal deploy modal_app.py
```
Modal prints a public URL like `https://<you>--satquery-backend-serve.modal.run`.
**That URL is your backend.**

## Point the frontend at it
In Vercel → your project → Settings → Environment Variables, set:
```
VITE_API_BASE = https://<you>--satquery-backend-serve.modal.run
```
Then redeploy the frontend (Deployments → ⋯ → Redeploy). Done — the Vercel link
now talks to Modal's GPU, no laptop required.

## Verify
```
https://<you>--satquery-backend-serve.modal.run/api/health
```
Expect `{"status":"ok","mock_mode":false,...}` (first hit may take ~1 min to wake).

## Notes
- **Cost:** scales to zero when idle; you pay only for GPU seconds while serving.
  A demo/judging session is a few cents to a couple of dollars.
- **Routing:** Modal has no Ollama, so intent uses the rule-based classifier +
  the deterministic guards (grounding / measurement / change). Slightly less
  flexible than the LLM router you run locally, but fully functional.
- **CORS:** open (`*`) by default; set `SATQUERY_CORS` in `modal_app.py`'s
  `.env({...})` to your Vercel domain to lock it down, then `modal deploy` again.
- **Update the backend later:** re-run `modal deploy modal_app.py` after code changes.
- **ngrok is no longer needed** once this is live — it fully replaces the
  laptop + tunnel setup.
