@echo off
rem Start dashboard.bat - runs the dashboard on THIS computer against the REAL database.
rem Double-click it. Close this window to stop.
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
echo Starting the dashboard - REAL database. Your browser will open by itself.
echo To stop, close this window.
echo.
call npm run dev -- --open
pause
