@echo off
title SatQuery AI - launcher
echo ============================================================
echo   Starting SatQuery AI  (backend + latest three-state UI)
echo ============================================================
echo.

REM --- 1) Backend: real GeoChat on http://127.0.0.1:8000 ---
start "SatQuery Backend :8000" cmd /k "cd /d D:\SIH2026 && D:\SIH2026\.venv311\Scripts\python.exe serve.py"

REM give the backend a moment to bind the port
timeout /t 3 >nul

REM --- 2) Frontend: newest UI (Vite) on http://localhost:5173 ---
start "SatQuery Frontend :5173" cmd /k "cd /d D:\SIH2026\frontend && npm run dev"

REM wait for Vite, then open the browser
timeout /t 6 >nul
start "" http://localhost:5173

echo.
echo Backend  : http://127.0.0.1:8000   (window: "SatQuery Backend :8000")
echo Frontend : http://localhost:5173   (window: "SatQuery Frontend :5173")
echo.
echo Close those two windows to stop the servers.
echo (First query loads GeoChat ~1 min. Header should read LIVE MODELS.)
echo.
pause
