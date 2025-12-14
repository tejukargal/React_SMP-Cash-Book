@echo off
echo.
echo ========================================================
echo   STOPPING SMP CASH BOOK APPLICATION
echo ========================================================
echo.

REM Kill only the specific SMP Cash Book processes by window title
echo Stopping SMP Cash Book processes...
taskkill /F /FI "WINDOWTITLE eq SMP Cash Book - Backend API (Nile Database)" /T >nul 2>&1
taskkill /F /FI "WINDOWTITLE eq SMP Cash Book - Frontend (React App)" /T >nul 2>&1

echo.
echo ========================================================
echo   APPLICATION STOPPED SUCCESSFULLY!
echo ========================================================
echo.
echo All server processes have been terminated.
echo.
echo Press any key to exit...
pause >nul
