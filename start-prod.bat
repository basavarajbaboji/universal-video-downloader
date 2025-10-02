@echo off
echo ========================================
echo Universal Video Downloader
echo Production Mode
echo ========================================
echo.

echo Building frontend for production...
cd client
call npm run build
if errorlevel 1 (
    echo ERROR: Failed to build frontend
    pause
    exit /b 1
)
cd ..

echo.
echo Starting production server...
echo Server will be available at: http://localhost:5000
echo.
npm start
