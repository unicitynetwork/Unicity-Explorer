#!/bin/bash
# Build script for simple Unicity Explorer Docker image (no nginx)

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "Building Simple Unicity Explorer Docker image..."
echo "Project root: $PROJECT_ROOT"

# Build the Docker image
cd "$PROJECT_ROOT"
docker build -t unicity-explorer-simple:latest -f docker/Dockerfile.simple .

echo ""
echo "✅ Build complete!"
echo ""
echo "To run: docker/run-explorer-simple.sh"