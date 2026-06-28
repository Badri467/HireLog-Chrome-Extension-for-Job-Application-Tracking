@echo off
REM ═══════════════════════════════════════════════
REM  HireLog Extension Setup Script
REM  Copies the icon to all required sizes
REM  and verifies the extension is ready to load.
REM ═══════════════════════════════════════════════

echo.
echo  ╔══════════════════════════════════════╗
echo  ║     HireLog Extension Setup          ║
echo  ╚══════════════════════════════════════╝
echo.

REM Create lib directory if not exists
if not exist "lib" mkdir lib

REM ── Copy icons ──────────────────────────────────
echo [1/3] Setting up icons...
if exist "..\icons\hirelog_icon.png" (
  copy /Y "..\icons\hirelog_icon.png" "icons\icon128.png" >nul
  copy /Y "..\icons\hirelog_icon.png" "icons\icon48.png"  >nul
  copy /Y "..\icons\hirelog_icon.png" "icons\icon32.png"  >nul
  copy /Y "..\icons\hirelog_icon.png" "icons\icon16.png"  >nul
  echo      Icons ready!
) else (
  echo      NOTE: Place your icon at icons\icon128.png (also copy to icon48, icon32, icon16)
)

REM ── Verify structure ────────────────────────────
echo [2/3] Verifying file structure...

set MISSING=0

if not exist "manifest.json"                   ( echo  MISSING: manifest.json             & set MISSING=1 )
if not exist "background\service-worker.js"    ( echo  MISSING: background\service-worker.js & set MISSING=1 )
if not exist "content\content-script.js"       ( echo  MISSING: content\content-script.js & set MISSING=1 )
if not exist "popup\popup.html"                ( echo  MISSING: popup\popup.html           & set MISSING=1 )
if not exist "popup\popup.js"                  ( echo  MISSING: popup\popup.js             & set MISSING=1 )
if not exist "popup\popup.css"                 ( echo  MISSING: popup\popup.css            & set MISSING=1 )
if not exist "dashboard\dashboard.html"        ( echo  MISSING: dashboard\dashboard.html   & set MISSING=1 )
if not exist "dashboard\dashboard.js"          ( echo  MISSING: dashboard\dashboard.js     & set MISSING=1 )
if not exist "dashboard\dashboard.css"         ( echo  MISSING: dashboard\dashboard.css    & set MISSING=1 )
if not exist "utils\db.js"                     ( echo  MISSING: utils\db.js                & set MISSING=1 )
if not exist "utils\helpers.js"                ( echo  MISSING: utils\helpers.js           & set MISSING=1 )
if not exist "utils\file-sync.js"              ( echo  MISSING: utils\file-sync.js         & set MISSING=1 )

if %MISSING%==0 ( echo      All files present! ) else ( echo      Fix missing files above before loading. )

REM ── Done ────────────────────────────────────────
echo [3/3] Done!
echo.
echo  ════════════════════════════════════════
echo  Next steps:
echo  1. Open Chrome and go to: chrome://extensions
echo  2. Enable "Developer mode" (top right toggle)
echo  3. Click "Load unpacked" and select this folder:
echo     %~dp0
echo  4. Visit any job portal and click the HireLog icon!
echo  ════════════════════════════════════════
echo.
pause
