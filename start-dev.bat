@echo off
echo ========================================
echo Starting Universal Video Downloader
echo Development Mode
echo ========================================
echo.

echo Starting backend server...
start "Backend Server" cmd /k "npm run server"

timeout /t 3 /nobreak >nul

echo Starting frontend development server...
start "Frontend Server" cmd /k "cd client && npm start"

echo.
echo Both servers are starting...
echo Backend: http://localhost:5000
echo Frontend: http://localhost:3000
echo.
echo The application will open automatically in your browser.
echo Close both terminal windows to stop the servers.
echo.
pause
