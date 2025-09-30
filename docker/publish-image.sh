#!/bin/bash
# Script to build and publish Unicity Explorer Docker image to GitHub Container Registry

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Configuration
REGISTRY="ghcr.io"
NAMESPACE="unicitynetwork"
REPOSITORY="unicity-explorer"
DEFAULT_TAG="latest"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Parse arguments
TAG="${1:-$DEFAULT_TAG}"
ADDITIONAL_TAGS="${2:-}"

echo -e "${GREEN}Unicity Explorer Docker Image Publisher${NC}"
echo "=========================================="
echo ""

# Check if user is logged in to GitHub Container Registry
echo "Checking GitHub Container Registry authentication..."
if ! docker pull ${REGISTRY}/${NAMESPACE}/test:latest &> /dev/null; then
    echo -e "${YELLOW}Not logged in to GitHub Container Registry${NC}"
    echo ""
    echo "Please authenticate using:"
    echo "  echo \$GITHUB_TOKEN | docker login ghcr.io -u USERNAME --password-stdin"
    echo ""
    echo "To create a token:"
    echo "  1. Go to GitHub Settings → Developer settings → Personal access tokens"
    echo "  2. Create a token with 'write:packages' permission"
    echo ""
    read -p "Are you logged in now? (y/n) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${RED}Publishing cancelled${NC}"
        exit 1
    fi
fi

# Build the image locally first
echo -e "${GREEN}Building Docker image...${NC}"
cd "$PROJECT_ROOT"
docker build -t ${REPOSITORY}:${TAG} -f docker/Dockerfile .

if [ $? -ne 0 ]; then
    echo -e "${RED}Build failed!${NC}"
    exit 1
fi

echo -e "${GREEN}Build successful!${NC}"
echo ""

# Tag the image for the registry
FULL_IMAGE_NAME="${REGISTRY}/${NAMESPACE}/${REPOSITORY}"
echo -e "${GREEN}Tagging image for registry...${NC}"
docker tag ${REPOSITORY}:${TAG} ${FULL_IMAGE_NAME}:${TAG}

# Add additional tags if specified
if [ -n "$ADDITIONAL_TAGS" ]; then
    IFS=',' read -ra TAGS <<< "$ADDITIONAL_TAGS"
    for t in "${TAGS[@]}"; do
        echo "  Adding tag: $t"
        docker tag ${REPOSITORY}:${TAG} ${FULL_IMAGE_NAME}:${t}
    done
fi

# Push the image
echo ""
echo -e "${GREEN}Pushing image to registry...${NC}"
echo "  Registry: ${REGISTRY}"
echo "  Image: ${FULL_IMAGE_NAME}:${TAG}"

docker push ${FULL_IMAGE_NAME}:${TAG}

# Push additional tags
if [ -n "$ADDITIONAL_TAGS" ]; then
    IFS=',' read -ra TAGS <<< "$ADDITIONAL_TAGS"
    for t in "${TAGS[@]}"; do
        echo -e "${GREEN}Pushing tag: ${t}${NC}"
        docker push ${FULL_IMAGE_NAME}:${t}
    done
fi

echo ""
echo -e "${GREEN}✅ Successfully published!${NC}"
echo ""
echo "Image available at:"
echo "  ${FULL_IMAGE_NAME}:${TAG}"
if [ -n "$ADDITIONAL_TAGS" ]; then
    IFS=',' read -ra TAGS <<< "$ADDITIONAL_TAGS"
    for t in "${TAGS[@]}"; do
        echo "  ${FULL_IMAGE_NAME}:${t}"
    done
fi
echo ""
echo "To pull the image:"
echo "  docker pull ${FULL_IMAGE_NAME}:${TAG}"
echo ""
echo "To run directly:"
echo "  docker run -d --name unicity-explorer \\"
echo "    -p 80:80 -p 443:443 \\"
echo "    -e BTCEXP_BITCOIND_HOST=alpha-node \\"
echo "    -e BTCEXP_BITCOIND_PORT=8589 \\"
echo "    -e BTCEXP_BITCOIND_USER=user \\"
echo "    -e BTCEXP_BITCOIND_PASS=password \\"
echo "    ${FULL_IMAGE_NAME}:${TAG}"