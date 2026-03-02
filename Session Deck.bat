@echo off
setlocal
cd /d "%~dp0"

if "%PORT%"=="" set PORT=47831

for /f "tokens=5" %%a in ('netstat -ano ^| findstr /R /C:":%PORT% .*LISTENING"') do (
  taskkill /PID %%a /F >nul 2>&1
)

start "SessionDeck" cmd /c "node server.mjs"
start "" "http://127.0.0.1:%PORT%"

echo SessionDeck started at http://127.0.0.1:%PORT%
