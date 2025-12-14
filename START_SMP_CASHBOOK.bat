@echo off
color 0A
echo.
echo ========================================================
echo   SMP CASH BOOK - Sanjay Memorial Polytechnic, Sagar
echo ========================================================
echo.
echo Starting application...
echo.

REM Start Backend Server
echo [1/2] Starting Backend Server (Nile Database Connection)...
cd /d "%~dp0smp-cashbook-backend"
start "SMP Cash Book - Backend API (Nile Database)" cmd /k "color 0C && npm start"
timeout /t 4 /nobreak >nul

REM Start Frontend Development Server
echo [2/2] Starting Frontend Application...
cd /d "%~dp0smp-cashbook"
start "SMP Cash Book - Frontend (React App)" cmd /k "color 0B && npm run dev"
timeout /t 6 /nobreak >nul

echo.
echo ========================================================
echo   APPLICATION STARTED SUCCESSFULLY!
echo ========================================================
echo.
echo Backend API:  http://localhost:3001
echo Frontend App: Check the Vite terminal for the URL
echo              (Usually: http://localhost:5173)
echo.
echo Two windows have been opened:
echo   1. RED Window   - Backend Server (API + Nile Database)
echo   2. CYAN Window  - Frontend Application (React App)
echo.
echo IMPORTANT: Keep both windows open while using the app!
echo.
echo To stop the application:
echo   - Run STOP_SMP_CASHBOOK.bat
echo   - Or press Ctrl+C in each window
echo.
echo Opening browser in 8 seconds...
timeout /t 8 /nobreak >nul

REM Open browser to default Vite port
start http://localhost:5173

echo.
echo ========================================================
echo Browser opened!
echo.
echo If the page doesn't load:
echo 1. Look at the CYAN window (Frontend)
echo 2. Find the line: "Local: http://localhost:XXXX"
echo 3. Open that URL in your browser
echo.
echo Database Status: Check RED window for "Connected to Nile"
echo ========================================================
echo.
echo Press any key to close this window...
echo (The app will keep running in the background)
pause >nul
