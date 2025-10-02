#!/bin/bash

echo "========================================"
echo "Starting Universal Video Downloader"
echo "Development Mode"
echo "========================================"
echo

echo "Starting backend server in background..."
npm run server &
BACKEND_PID=$!

sleep 3

echo "Starting frontend development server..."
cd client
npm start &
FRONTEND_PID=$!
cd ..

echo
echo "Both servers are starting..."
echo "Backend: http://localhost:5000"
echo "Frontend: http://localhost:3000"
echo
echo "The application will open automatically in your browser."
echo "Press Ctrl+C to stop both servers."
echo

# Function to cleanup background processes
cleanup() {
    echo
    echo "Stopping servers..."
    kill $BACKEND_PID 2>/dev/null
    kill $FRONTEND_PID 2>/dev/null
    exit 0
}

# Trap Ctrl+C and call cleanup
trap cleanup INT

# Wait for processes
wait
