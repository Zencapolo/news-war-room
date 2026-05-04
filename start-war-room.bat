@echo off
setlocal

cd /d "%~dp0"

set "PORT=4174"
set "URL=http://localhost:%PORT%/"

echo Checking News War Room...
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Invoke-WebRequest -Uri '%URL%' -UseBasicParsing -TimeoutSec 2 | Out-Null; exit 0 } catch { exit 1 }"

if "%ERRORLEVEL%"=="0" (
  echo News War Room is already running.
  start "" "%URL%"
  exit /b 0
)

where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo Node.js / npm was not found. Please install Node.js 18 or newer first.
  pause
  exit /b 1
)

echo Starting News War Room at %URL%
start "News War Room Server" cmd /k "set PORT=%PORT% && npm.cmd start"

timeout /t 3 /nobreak >nul
start "" "%URL%"

echo Done. You can close this window.
exit /b 0
