#!/bin/bash
# Build script for Unicity Explorer Docker image

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "Building Unicity Explorer Docker image..."
echo "Project root: $PROJECT_ROOT"

# Build the Docker image
cd "$PROJECT_ROOT"
docker build -t unicity-explorer:latest -f docker/Dockerfile .

echo ""
echo "✅ Build complete!"
echo ""
echo "To run: docker/run-explorer.sh"