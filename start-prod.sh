#!/bin/bash

echo "========================================"
echo "Universal Video Downloader"
echo "Production Mode"
echo "========================================"
echo

echo "Building frontend for production..."
cd client
npm run build
if [ $? -ne 0 ]; then
    echo "ERROR: Failed to build frontend"
    exit 1
fi
cd ..

echo
echo "Starting production server..."
echo "Server will be available at: http://localhost:5000"
echo

npm start
