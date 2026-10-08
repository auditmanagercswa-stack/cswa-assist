@echo off
setlocal
title Alpha Cars - local portal
cd /d "%~dp0"

echo.
echo  ==================================================
echo    ALPHA CARS  -  starting your local portal
echo  ==================================================
echo.

rem --- 1. Node.js -----------------------------------------------------
where node >nul 2>nul
if errorlevel 1 (
  echo  [..] Node.js is not installed. Trying to install it now...
  where winget >nul 2>nul
  if errorlevel 1 (
    echo  [X] Please install Node.js LTS from https://nodejs.org
    echo      then double-click start-windows.bat again.
    goto :fail
  )
  winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
  echo.
  echo  [OK] Node.js installed. CLOSE this window and double-click start-windows.bat again.
  goto :fail
)
echo  [OK] Node.js found.

rem --- 2. Packages (first run, or after an update) --------------------
if not exist "node_modules\embedded-postgres" (
  echo  [..] Installing packages. The first time takes a few minutes...
  call npm install
  if errorlevel 1 (
    echo  [X] Package installation failed. Scroll up to the first red "npm error" lines to see why.
    goto :fail
  )
)
echo  [OK] Packages installed.

rem --- 3. Database, demo data, portal ---------------------------------
node scripts\local-start.mjs %*
if errorlevel 1 goto :fail
goto :eof

:fail
echo.
echo  Send a screenshot of this window if you need help.
pause
exit /b 1
