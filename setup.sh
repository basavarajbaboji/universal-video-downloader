#!/bin/bash

echo "========================================"
echo "Universal Video Downloader Setup"
echo "========================================"
echo

# Check Node.js installation
echo "Checking Node.js installation..."
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js is not installed or not in PATH"
    echo "Please install Node.js from https://nodejs.org/"
    exit 1
fi
echo "Node.js is installed: $(node --version)"

echo
# Check yt-dlp installation
echo "Checking yt-dlp installation..."
if ! command -v yt-dlp &> /dev/null; then
    echo "WARNING: yt-dlp is not installed or not in PATH"
    echo "Installing yt-dlp using pip..."
    if command -v pip3 &> /dev/null; then
        pip3 install yt-dlp
    elif command -v pip &> /dev/null; then
        pip install yt-dlp
    else
        echo "ERROR: pip is not installed"
        echo "Please install yt-dlp manually:"
        echo "  - pip install yt-dlp"
        echo "  - or brew install yt-dlp (macOS)"
        echo "  - or download from https://github.com/yt-dlp/yt-dlp/releases"
        exit 1
    fi
    
    if ! command -v yt-dlp &> /dev/null; then
        echo "ERROR: Failed to install yt-dlp"
        echo "Please install yt-dlp manually"
        exit 1
    fi
fi
echo "yt-dlp is installed: $(yt-dlp --version)"

echo
echo "Installing backend dependencies..."
npm install
if [ $? -ne 0 ]; then
    echo "ERROR: Failed to install backend dependencies"
    exit 1
fi

echo
echo "Installing frontend dependencies..."
cd client
npm install
if [ $? -ne 0 ]; then
    echo "ERROR: Failed to install frontend dependencies"
    exit 1
fi
cd ..

echo
echo "Creating downloads directory..."
mkdir -p downloads

echo
echo "========================================"
echo "Setup completed successfully!"
echo "========================================"
echo
echo "To start the application:"
echo "  1. Run './start-dev.sh' for development mode"
echo "  2. Or run './start-prod.sh' for production mode"
echo

# Make scripts executable
chmod +x start-dev.sh
chmod +x start-prod.sh

echo "Setup complete!"
