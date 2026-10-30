@echo off
title Build Rotaidem Flight Bag.exe
cd /d "%~dp0"
if not exist .venv-build (
  python -m venv .venv-build || py -m venv .venv-build
)
call .venv-build\Scripts\activate.bat
python -m pip install --upgrade pip >nul
python -m pip install pyinstaller SimConnect pillow
python tools\build_exe.py
echo.
if exist "dist\Rotaidem Flight Bag.exe" (echo Done: dist\Rotaidem Flight Bag.exe) else (echo Build failed.)
pause
