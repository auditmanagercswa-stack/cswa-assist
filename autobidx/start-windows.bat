@echo off
setlocal
title Alpha Cars - local portal
cd /d "%~dp0"

echo.
echo  ==================================================
echo    ALPHA CARS  -  starting your local portal
echo  ==================================================
echo.

rem --- 1. Check the required programs -------------------------------
where node >nul 2>nul
if errorlevel 1 (
  echo  [X] Node.js is not installed.
  echo      Install the LTS version from https://nodejs.org and run this file again.
  goto :fail
)
where docker >nul 2>nul
if errorlevel 1 (
  echo  [X] Docker Desktop is not installed.
  echo      Install it from https://www.docker.com/products/docker-desktop/ and run this file again.
  goto :fail
)
docker info >nul 2>nul
if errorlevel 1 (
  echo  [X] Docker Desktop is installed but not running.
  echo      Open Docker Desktop, wait until it says "Engine running", then run this file again.
  goto :fail
)
echo  [OK] Node.js and Docker found.

rem --- 2. Start the database -----------------------------------------
echo  [..] Starting the database...
docker compose up -d
if errorlevel 1 (
  echo  [X] The database could not start. If another program uses port 5432, close it and try again.
  goto :fail
)
set /a tries=0
:waitdb
docker compose exec -T postgres pg_isready -U postgres >nul 2>nul
if not errorlevel 1 goto :dbready
set /a tries+=1
if %tries% geq 60 (
  echo  [X] The database did not become ready in time. Run this file again.
  goto :fail
)
timeout /t 2 /nobreak >nul
goto :waitdb
:dbready
echo  [OK] Database is running.

rem --- 3. Settings file ----------------------------------------------
if not exist ".env" (
  copy ".env.example" ".env" >nul
  echo  [OK] Created settings file .env
)

rem --- 4. Install packages (first run only) --------------------------
if not exist "node_modules" (
  echo  [..] Installing packages. The first time takes a few minutes...
  call npm install
  if errorlevel 1 (
    echo  [X] Package installation failed. Check your internet connection and run this file again.
    goto :fail
  )
)
echo  [OK] Packages installed.

rem --- 5. Database tables --------------------------------------------
call npx prisma migrate deploy
if errorlevel 1 (
  echo  [X] Could not set up the database tables.
  goto :fail
)

rem --- 6. Demo data (first run, or when you run: start-windows.bat reset) ---
if /i "%~1"=="reset" del ".seeded" >nul 2>nul
if not exist ".seeded" (
  echo  [..] Loading demo dealers, cars and auctions. About 2 minutes...
  call npm run db:seed
  if errorlevel 1 (
    echo  [X] Loading demo data failed.
    goto :fail
  )
  echo seeded> ".seeded"
)
echo  [OK] Demo data ready.

rem --- 7. Start the portal and open the browser ----------------------
echo.
echo  ==================================================
echo    Portal starting at  http://localhost:3000
echo    Your browser opens in about 20 seconds.
echo    KEEP THIS WINDOW OPEN. Closing it stops the portal.
echo.
echo    Demo sign-ins
echo      Super Admin : admin@alphacars.in  / Admin@123
echo      Seller      : seller@alphacars.in / Demo@1234
echo      Buyer       : buyer@alphacars.in  / Demo@1234
echo  ==================================================
echo.
start "" cmd /c "timeout /t 20 /nobreak >nul & start http://localhost:3000"
call npm run dev
goto :eof

:fail
echo.
echo  Send a screenshot of this window if you need help.
pause
exit /b 1
