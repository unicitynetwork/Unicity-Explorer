#!/bin/bash

# Script to create symlinks for easy access to docker scripts

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="${HOME}/.local/bin"

echo "Installing Unicity Explorer Docker scripts..."
echo ""

# Create ~/.local/bin if it doesn't exist
mkdir -p "$INSTALL_DIR"

# Create symlinks
ln -sf "$SCRIPT_DIR/run-explorer-auto-ssl.sh" "$INSTALL_DIR/unicity-explorer-auto-ssl"
ln -sf "$SCRIPT_DIR/run-explorer-ssl.sh" "$INSTALL_DIR/unicity-explorer-ssl"
ln -sf "$SCRIPT_DIR/build.sh" "$INSTALL_DIR/unicity-explorer-build"

echo "✅ Scripts installed to $INSTALL_DIR"
echo ""
echo "Available commands:"
echo "  - unicity-explorer-auto-ssl  : Run with automatic SSL detection"
echo "  - unicity-explorer-ssl       : Run with specific SSL certificate"
echo "  - unicity-explorer-build     : Build the Docker image"
echo ""

# Check if ~/.local/bin is in PATH
if [[ ":$PATH:" != *":$INSTALL_DIR:"* ]]; then
    echo "⚠️  $INSTALL_DIR is not in your PATH"
    echo ""
    echo "Add this line to your ~/.bashrc or ~/.zshrc:"
    echo "  export PATH=\"\$HOME/.local/bin:\$PATH\""
    echo ""
    echo "Then reload your shell or run:"
    echo "  source ~/.bashrc"
fi