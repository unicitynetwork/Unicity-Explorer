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

echo "Build complete!"
echo ""
echo "To run the explorer with SSL:"
echo "  cd docker"
echo "  ./run-explorer-auto-ssl.sh"
echo ""
echo "To run the explorer standalone:"
echo "  docker run -d --name unicity-explorer \\"
echo "    -p 3002:3002 \\"
echo "    -v explorer-data:/workspace/data \\"
echo "    -v ./config/.env:/workspace/.env \\"
echo "    unicity-explorer:latest"