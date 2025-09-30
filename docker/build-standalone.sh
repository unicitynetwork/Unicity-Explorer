#!/bin/bash
# Build script for standalone Unicity Explorer Docker image with nginx included

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "Building Standalone Unicity Explorer Docker image (with nginx)..."
echo "Project root: $PROJECT_ROOT"

# Build the Docker image
cd "$PROJECT_ROOT"
docker build -t unicity-explorer-standalone:latest -f docker/Dockerfile.standalone .

echo "Build complete!"
echo ""
echo "To run the explorer:"
echo "  docker run -d --name unicity-explorer \\"
echo "    --network host \\"
echo "    -v unicity-explorer-data:/workspace/data \\"
echo "    -e BTCEXP_BITCOIND_HOST=127.0.0.1 \\"
echo "    -e BTCEXP_ELECTRUM_SERVERS=tcp://localhost:50001 \\"
echo "    unicity-explorer-standalone:latest"
echo ""
echo "With SSL:"
echo "  docker run -d --name unicity-explorer \\"
echo "    --network host \\"
echo "    -v unicity-explorer-data:/workspace/data \\"
echo "    -v /etc/letsencrypt/live/yourdomain:/etc/nginx/ssl:ro \\"
echo "    -e SSL_DOMAIN=yourdomain.com \\"
echo "    unicity-explorer-standalone:latest"