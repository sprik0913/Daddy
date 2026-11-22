@echo off
REM Double-click to start Sprik Books. Keep this window open while you use it.
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js is not installed. Get the LTS version from https://nodejs.org and run this again. & pause & exit /b 1)
if not exist node_modules call npm install --omit=dev
start "" http://localhost:8080
node --disable-warning=ExperimentalWarning server.js
pause
