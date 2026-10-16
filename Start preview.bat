@echo off
rem Start preview.bat - runs the dashboard on THIS computer with the fake database.
rem Double-click it. Close this window (or press Ctrl+C) to stop the preview.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed on this computer.
  echo Install the LTS version from https://nodejs.org then double-click this file again.
  pause
  exit /b
)
if not exist node_modules (
  echo Downloading the libraries the app needs - first time only, about a minute...
  call npm install
)
echo.
echo Starting the preview. Your browser will open by itself.
echo Sign in with any email and the password: preview     PIN: 1234
echo To stop the preview, close this window.
echo.
call npm run dev:preview-mode -- --open
pause
