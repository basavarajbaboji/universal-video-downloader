@echo off
echo ========================================
echo Universal Video Downloader Setup
echo ========================================
echo.

echo Checking Node.js installation...
node --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)
echo Node.js is installed: 
node --version

echo.
echo Checking yt-dlp installation...
yt-dlp --version >nul 2>&1
if errorlevel 1 (
    echo WARNING: yt-dlp is not installed or not in PATH
    echo Installing yt-dlp using pip...
    pip install yt-dlp
    if errorlevel 1 (
        echo ERROR: Failed to install yt-dlp
        echo Please install yt-dlp manually:
        echo   - pip install yt-dlp
        echo   - or download from https://github.com/yt-dlp/yt-dlp/releases
        pause
        exit /b 1
    )
)
echo yt-dlp is installed:
yt-dlp --version

echo.
echo Installing backend dependencies...
npm install
if errorlevel 1 (
    echo ERROR: Failed to install backend dependencies
    pause
    exit /b 1
)

echo.
echo Installing frontend dependencies...
cd client
npm install
if errorlevel 1 (
    echo ERROR: Failed to install frontend dependencies
    pause
    exit /b 1
)
cd ..

echo.
echo Creating downloads directory...
mkdir downloads 2>nul

echo.
echo ========================================
echo Setup completed successfully!
echo ========================================
echo.
echo To start the application:
echo   1. Run "start-dev.bat" for development mode
echo   2. Or run "start-prod.bat" for production mode
echo.
pause
