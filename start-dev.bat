@echo off
title Zentyr Fetch (Dev Mode)
echo ===================================================
echo           Starting Zentyr Fetch (Dev Mode)
echo ===================================================
echo.
cd /d "%~dp0"
start "Zentyr Backend" cmd /k "cd backend && bun run dev"
start "Zentyr Frontend" cmd /k "cd frontend && bun run dev"
timeout /t 2 /nobreak >nul
start "" http://localhost:5173
