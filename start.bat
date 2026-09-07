@echo off
title Zentyr Fetch
echo ===================================================
echo           Starting Zentyr Fetch (Production)
echo ===================================================
echo.
cd /d "%~dp0backend"
set NODE_ENV=production
timeout /t 1 /nobreak >nul
start "" http://localhost:3001
bun run src/index.ts
pause
