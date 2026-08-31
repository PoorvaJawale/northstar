"""
Stable launcher for the SatQuery AI backend.

Avoids the Windows quirk where `python -m uvicorn ...`, when the command is
*pasted* into PowerShell, exits immediately ("Started… Shutting down") because
the pasted console input hits end-of-file and uvicorn treats it as a quit
signal. Running this script instead keeps the server up.

Usage (LIVE mode = real GeoChat, the default):
    D:\\SIH2026\\.venv311\\Scripts\\python.exe serve.py

MOCK mode (no GPU / no model), set the env var first:
    $env:SATQUERY_MOCK="1"; D:\\SIH2026\\.venv311\\Scripts\\python.exe serve.py

Override the model path or port with env vars SATQUERY_PORT / GEOCHAT_MODEL.
Stop the server with Ctrl+C.
"""
import os

# Sensible defaults for local LIVE runs; existing env vars win (setdefault).
os.environ.setdefault("SATQUERY_MOCK", "0")
os.environ.setdefault("GEOCHAT_MODEL", r"D:\SIH2026\models\geochat-7B")

if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("SATQUERY_PORT", "8000"))
    mock = os.environ.get("SATQUERY_MOCK", "0") == "1"
    print(f"[serve] mode={'MOCK' if mock else 'LIVE'}  model={os.environ['GEOCHAT_MODEL']}  http://127.0.0.1:{port}")
    uvicorn.run("backend.main:app", host="127.0.0.1", port=port, log_level="info")
