#!/bin/bash

# Simple script to run Unicity Explorer with optional SSL support
# No nginx, no extra containers, just Node.js with SSL

set -e

# Configuration
CONTAINER_NAME="${CONTAINER_NAME:-unicity-explorer}"
IMAGE_NAME="${EXPLORER_IMAGE:-unicity-explorer-simple:latest}"

echo "Unicity Explorer Simple Runner"
echo "==============================="
echo ""

# Check if alpha-net network exists and use it
NETWORK_MODE="host"
if docker network ls | grep -q "alpha-net"; then
    echo "Found alpha-net network, will join it"
    NETWORK_MODE="alpha-net"
    # When using alpha-net, use container names instead of localhost
    DEFAULT_ALPHA_HOST="alpha-node"
    DEFAULT_FULCRUM_HOST="fulcrum-alpha"
else
    echo "No alpha-net network found, using host network"
    DEFAULT_ALPHA_HOST="127.0.0.1"
    DEFAULT_FULCRUM_HOST="localhost"
fi

# Set default values
ALPHA_HOST="${BTCEXP_BITCOIND_HOST:-$DEFAULT_ALPHA_HOST}"
ALPHA_PORT="${BTCEXP_BITCOIND_PORT:-8589}"
ALPHA_USER="${BTCEXP_BITCOIND_USER:-user}"
ALPHA_PASS="${BTCEXP_BITCOIND_PASS:-password}"

# Check for Fulcrum configuration
if [ -z "$BTCEXP_ELECTRUM_SERVERS" ]; then
    echo "🔧 Fulcrum/Electrum Configuration"
    echo "================================="
    echo ""
    echo "Select Fulcrum endpoint:"
    if [ "$NETWORK_MODE" = "alpha-net" ]; then
        echo "1. fulcrum-alpha:50001 (local Fulcrum in alpha-net)"
    else
        echo "1. localhost:50001 (local Fulcrum)"
    fi
    echo "2. fulcrum.unicity.network:50002 (public Fulcrum, SSL)"
    echo "3. Custom endpoint"
    echo "4. Skip (no address indexing)"
    echo ""
    read -p "Select [1-4] (default: 1): " choice
    
    case "${choice:-1}" in
        1) FULCRUM="tcp://${DEFAULT_FULCRUM_HOST}:50001" ;;
        2) FULCRUM="tls://fulcrum.unicity.network:50002" ;;
        3) read -p "Enter endpoint: " FULCRUM ;;
        4) FULCRUM="" ;;
        *) FULCRUM="tcp://${DEFAULT_FULCRUM_HOST}:50001" ;;
    esac
    
    if [ -n "$FULCRUM" ]; then
        export BTCEXP_ELECTRUM_SERVERS="$FULCRUM"
        echo "Using Fulcrum: $FULCRUM"
    fi
    echo ""
fi

# Check for SSL certificates
SSL_VOLUME=""
LETSENCRYPT_BASE="/etc/letsencrypt/live"

if [ -d "$LETSENCRYPT_BASE" ]; then
    echo "🔍 Searching for SSL certificates..."
    DOMAINS=$(sudo find "$LETSENCRYPT_BASE" -maxdepth 1 -type d -name "*.*" -exec basename {} \; 2>/dev/null | sort)
    
    if [ -n "$DOMAINS" ]; then
        DOMAIN_COUNT=$(echo "$DOMAINS" | wc -l)
        if [ $DOMAIN_COUNT -eq 1 ]; then
            SELECTED_DOMAIN="$DOMAINS"
        else
            echo "Found certificates:"
            echo "$DOMAINS" | nl -w2 -s'. '
            read -p "Select number (Enter for #1, 0 for no SSL): " sel
            
            if [ "${sel:-1}" = "0" ]; then
                echo "Skipping SSL"
                SELECTED_DOMAIN=""
            else
                [ -z "$sel" ] && sel=1
                SELECTED_DOMAIN=$(echo "$DOMAINS" | sed -n "${sel}p")
            fi
        fi
        
        if [ -n "$SELECTED_DOMAIN" ]; then
            # Mount both live and archive directories for Let's Encrypt certificates
            SSL_VOLUME="-v /etc/letsencrypt:/etc/letsencrypt:ro"
            export SSL_CERT_PATH="/etc/letsencrypt/live/$SELECTED_DOMAIN"
            echo "✅ Using SSL certificate for: $SELECTED_DOMAIN"
        fi
    fi
fi

# Stop existing container
docker stop $CONTAINER_NAME 2>/dev/null || true
docker rm $CONTAINER_NAME 2>/dev/null || true

# Prepare environment variables
ENV_VARS="-e BTCEXP_COIN=ALPHA"
ENV_VARS="$ENV_VARS -e BTCEXP_HOST=0.0.0.0"
ENV_VARS="$ENV_VARS -e BTCEXP_PORT=3002"
ENV_VARS="$ENV_VARS -e BTCEXP_BITCOIND_HOST=$ALPHA_HOST"
ENV_VARS="$ENV_VARS -e BTCEXP_BITCOIND_PORT=$ALPHA_PORT"
ENV_VARS="$ENV_VARS -e NODE_ENV=production"

[ -n "$ALPHA_USER" ] && ENV_VARS="$ENV_VARS -e BTCEXP_BITCOIND_USER=$ALPHA_USER"
[ -n "$ALPHA_PASS" ] && ENV_VARS="$ENV_VARS -e BTCEXP_BITCOIND_PASS=$ALPHA_PASS"
[ -n "$BTCEXP_ELECTRUM_SERVERS" ] && ENV_VARS="$ENV_VARS -e BTCEXP_ELECTRUM_SERVERS=$BTCEXP_ELECTRUM_SERVERS"
[ -n "$BTCEXP_ELECTRUM_SERVERS" ] && ENV_VARS="$ENV_VARS -e BTCEXP_ADDRESS_API=electrum"
[ -n "$BTCEXP_ELECTRUM_SERVERS" ] && ENV_VARS="$ENV_VARS -e BTCEXP_ELECTRUM_TXINDEX=true"
[ -n "$SSL_CERT_PATH" ] && ENV_VARS="$ENV_VARS -e SSL_CERT_PATH=$SSL_CERT_PATH"

# Port mapping based on SSL
if [ -n "$SSL_VOLUME" ]; then
    PORTS="-p 80:80 -p 443:443"
    ACCESS_MSG="Access: https://$SELECTED_DOMAIN (HTTP redirects to HTTPS)"
else
    PORTS="-p 3002:3002"
    ACCESS_MSG="Access: http://localhost:3002"
fi

# Run container
echo "🚀 Starting Unicity Explorer..."
if [ "$NETWORK_MODE" = "alpha-net" ]; then
    echo "Joining alpha-net network with alpha-node and fulcrum-alpha"
    docker run -d --name $CONTAINER_NAME \
        --network alpha-net \
        --restart unless-stopped \
        $PORTS \
        $ENV_VARS \
        $SSL_VOLUME \
        -v ${CONTAINER_NAME}-data:/workspace/data \
        $IMAGE_NAME
else
    docker run -d --name $CONTAINER_NAME \
        --network host \
        --restart unless-stopped \
        $ENV_VARS \
        $SSL_VOLUME \
        -v ${CONTAINER_NAME}-data:/workspace/data \
        $IMAGE_NAME
fi

echo ""
echo "✅ Unicity Explorer started!"
echo ""
echo "$ACCESS_MSG"
echo ""
echo "Configuration:"
echo "  Alpha node: $ALPHA_HOST:$ALPHA_PORT"
[ -n "$BTCEXP_ELECTRUM_SERVERS" ] && echo "  Fulcrum: $BTCEXP_ELECTRUM_SERVERS"
[ -n "$SELECTED_DOMAIN" ] && echo "  SSL Domain: $SELECTED_DOMAIN"
echo ""
echo "Commands:"
echo "  Logs: docker logs -f $CONTAINER_NAME"
echo "  Stop: docker stop $CONTAINER_NAME"
echo "  Start: docker start $CONTAINER_NAME"