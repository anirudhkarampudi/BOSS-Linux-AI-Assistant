#!/bin/bash

echo " Installing Ask AI..."

if ! command -v node &> /dev/null
then
    echo "Node.js is not installed. Attempting automatic installation..."
    if command -v apt-get &> /dev/null; then
        sudo apt-get update
        sudo apt-get install -y nodejs npm
    elif command -v dnf &> /dev/null; then
        sudo dnf install -y nodejs npm
    elif command -v pacman &> /dev/null; then
        sudo pacman -S --noconfirm nodejs npm
    elif command -v brew &> /dev/null; then
        brew install node
    else
        echo "Error: Could not automatically install Node.js. Please install it manually."
        exit 1
    fi
fi

# Install dependencies
echo " Installing dependencies..."
npm install

# Get absolute path to cli.js
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLI_PATH="$APP_DIR/cli.js"

# Add alias to bashrc
if grep -q "alias ask=" ~/.bashrc; then
    echo "  Alias 'ask' already exists in ~/.bashrc. Updating it..."
    sed -i "s|alias ask=.*|alias ask='node \"$CLI_PATH\"'|" ~/.bashrc
else
    echo "alias ask='node \"$CLI_PATH\"'" >> ~/.bashrc
fi

echo " Installation Complete!"
echo ""
echo " Please run the following command to reload your terminal:"
echo "source ~/.bashrc"
echo ""
echo "Then, you can use the AI from anywhere by typing:"
echo "ask \"what is my ram usage\""
