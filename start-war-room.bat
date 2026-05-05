@echo off
setlocal

cd /d "%~dp0"

set "PORT=4174"
set "URL=http://localhost:%PORT%/"
set "READY=0"

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

echo Waiting for the server to become ready...
for /l %%i in (1,1,20) do (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Invoke-WebRequest -Uri '%URL%' -UseBasicParsing -TimeoutSec 2 | Out-Null; exit 0 } catch { exit 1 }"
  if not errorlevel 1 (
    set "READY=1"
    goto open_app
  )
  timeout /t 1 /nobreak >nul
)

echo.
echo News War Room did not respond at %URL%.
echo Please check the "News War Room Server" window for the error message.
echo If it says the port is already in use, close the old Node.js window or restart the computer.
pause
exit /b 1

:open_app
start "" "%URL%"

echo Done. You can close this window.
exit /b 0
