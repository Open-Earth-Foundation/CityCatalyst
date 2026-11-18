@echo off
rem Start the standalone demo. Creates a local venv and installs dependencies.
rem Usage from this directory: run-demo.cmd
rem OPENAI_API_KEY is read from .env by the server; no key is printed here.
setlocal
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  python -m venv .venv
  if errorlevel 1 exit /b 1
)
".venv\Scripts\python.exe" -m pip install -r requirements.txt --disable-pip-version-check
if errorlevel 1 exit /b 1
if not exist ".env" copy ".env.example" ".env" >nul
echo.
echo Open http://127.0.0.1:8080 in your browser.
echo Set OPENAI_API_KEY in .env and restart to run real extractions.
echo Press Ctrl+C to stop the demo.
".venv\Scripts\python.exe" -m uvicorn extractor.api:create_app --factory --host 127.0.0.1 --port 8080
