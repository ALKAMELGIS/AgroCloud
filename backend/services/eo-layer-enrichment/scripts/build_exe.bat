@echo off
REM Optional: build standalone exe with PyInstaller (after pip install -r requirements.txt)
pyinstaller --onefile --name eo-enrich --hidden-import eo_enrichment eo_enrichment\cli.py
