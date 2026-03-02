@echo off
setlocal

if "%PORT%"=="" set PORT=47831
set FOUND=

for /f "tokens=5" %%a in ('netstat -ano ^| findstr /R /C:":%PORT% .*LISTENING"') do (
  taskkill /PID %%a /F >nul 2>&1
  echo Stopped SessionDeck (PID: %%a)
  set FOUND=1
)

if not defined FOUND echo No process is listening on 127.0.0.1:%PORT%
