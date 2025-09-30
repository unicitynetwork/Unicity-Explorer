#!/bin/bash

# Truly standalone script to run Unicity Explorer with integrated nginx
# No files created, no docker-compose needed, single container solution

set -e

# Configuration
CONTAINER_NAME="${CONTAINER_NAME:-unicity-explorer}"
IMAGE_NAME="${EXPLORER_IMAGE:-unicity-explorer-standalone:latest}"
NETWORK_MODE="${EXPLORER_NETWORK:-host}"

echo "Unicity Explorer Standalone Runner"
echo "==================================="
echo ""

# Set default values for configuration
ALPHA_HOST="${BTCEXP_BITCOIND_HOST:-127.0.0.1}"
ALPHA_PORT="${BTCEXP_BITCOIND_PORT:-8589}"
ALPHA_USER="${BTCEXP_BITCOIND_USER:-}"
ALPHA_PASS="${BTCEXP_BITCOIND_PASS:-}"

# Check for existing Fulcrum configuration in environment
CURRENT_FULCRUM="${BTCEXP_ELECTRUM_SERVERS:-}"

# If no Fulcrum endpoint configured, prompt for selection
if [ -z "$CURRENT_FULCRUM" ]; then
    echo "🔧 Fulcrum/Electrum Server Configuration"
    echo "========================================="
    echo ""
    echo "Select Fulcrum endpoint:"
    echo "1. localhost:50001 (local Fulcrum, no SSL)"
    echo "2. fulcrum.unicity.network:50002 (public Fulcrum, SSL)"
    echo "3. Custom endpoint"
    echo "4. Skip (no Fulcrum/address indexing)"
    echo ""
    read -p "Select option [1-4] (default: 1): " fulcrum_choice
    
    case "${fulcrum_choice:-1}" in
        1)
            FULCRUM_SERVER="tcp://localhost:50001"
            echo "Using local Fulcrum at localhost:50001"
            ;;
        2)
            FULCRUM_SERVER="tls://fulcrum.unicity.network:50002"
            echo "Using public Fulcrum at fulcrum.unicity.network:50002 (SSL)"
            ;;
        3)
            read -p "Enter custom Fulcrum endpoint (e.g., tcp://192.168.1.100:50001): " CUSTOM_FULCRUM
            if [ -n "$CUSTOM_FULCRUM" ]; then
                FULCRUM_SERVER="$CUSTOM_FULCRUM"
                echo "Using custom Fulcrum at $FULCRUM_SERVER"
            else
                echo "No endpoint provided, skipping Fulcrum configuration"
                FULCRUM_SERVER=""
            fi
            ;;
        4)
            FULCRUM_SERVER=""
            echo "Skipping Fulcrum configuration (no address indexing)"
            ;;
        *)
            FULCRUM_SERVER="tcp://localhost:50001"
            echo "Using default: local Fulcrum at localhost:50001"
            ;;
    esac
    echo ""
else
    FULCRUM_SERVER="$CURRENT_FULCRUM"
    echo "Using Fulcrum endpoint from environment: $FULCRUM_SERVER"
    echo ""
fi

# Check for SSL certificates
SSL_VOLUME=""
SSL_DOMAIN=""
LETSENCRYPT_BASE="/etc/letsencrypt/live"

if [ -d "$LETSENCRYPT_BASE" ]; then
    echo "🔍 Searching for SSL certificates..."
    DOMAINS=$(sudo find "$LETSENCRYPT_BASE" -maxdepth 1 -type d -name "*.*" -exec basename {} \; 2>/dev/null | sort)
    
    if [ -n "$DOMAINS" ]; then
        DOMAIN_COUNT=$(echo "$DOMAINS" | wc -l)
        if [ $DOMAIN_COUNT -eq 1 ]; then
            SELECTED_DOMAIN="$DOMAINS"
            echo "✅ Found certificate for: $SELECTED_DOMAIN"
        else
            echo "Found multiple certificates:"
            echo "$DOMAINS" | nl -w2 -s'. '
            echo ""
            read -p "Select domain number (or press Enter for #1, 0 to skip SSL): " selection
            
            if [ "${selection:-1}" = "0" ]; then
                echo "Skipping SSL configuration"
            else
                [ -z "$selection" ] && selection=1
                SELECTED_DOMAIN=$(echo "$DOMAINS" | sed -n "${selection}p")
                
                if [ -z "$SELECTED_DOMAIN" ]; then
                    echo "❌ Invalid selection, continuing without SSL"
                fi
            fi
        fi
        
        if [ -n "$SELECTED_DOMAIN" ]; then
            SSL_VOLUME="-v $LETSENCRYPT_BASE/$SELECTED_DOMAIN:/etc/nginx/ssl:ro"
            SSL_DOMAIN="-e SSL_DOMAIN=$SELECTED_DOMAIN"
            echo "🔒 SSL will be enabled for: $SELECTED_DOMAIN"
        fi
    else
        echo "No SSL certificates found"
    fi
else
    echo "No Let's Encrypt directory found, running HTTP only"
fi
echo ""

# Stop any existing container
echo "Stopping existing container if running..."
docker stop $CONTAINER_NAME 2>/dev/null || true
docker rm $CONTAINER_NAME 2>/dev/null || true

# Prepare environment variables
ENV_VARS="-e BTCEXP_COIN=ALPHA \
          -e BTCEXP_HOST=0.0.0.0 \
          -e BTCEXP_PORT=3002 \
          -e BTCEXP_BITCOIND_HOST=$ALPHA_HOST \
          -e BTCEXP_BITCOIND_PORT=$ALPHA_PORT \
          -e NODE_ENV=production"

# Add optional environment variables
[ -n "$ALPHA_USER" ] && ENV_VARS="$ENV_VARS -e BTCEXP_BITCOIND_USER=$ALPHA_USER"
[ -n "$ALPHA_PASS" ] && ENV_VARS="$ENV_VARS -e BTCEXP_BITCOIND_PASS=$ALPHA_PASS"

if [ -n "$FULCRUM_SERVER" ]; then
    ENV_VARS="$ENV_VARS -e BTCEXP_ELECTRUM_SERVERS=$FULCRUM_SERVER"
    ENV_VARS="$ENV_VARS -e BTCEXP_ADDRESS_API=electrum"
    ENV_VARS="$ENV_VARS -e BTCEXP_ELECTRUM_TXINDEX=true"
fi

# Add SSL configuration if certificates are available
if [ -n "$SSL_DOMAIN" ]; then
    ENV_VARS="$ENV_VARS -e BTCEXP_SECURE_SITE=true -e BTCEXP_TRUST_PROXY=true"
fi

# Run the container
echo "🚀 Starting Unicity Explorer..."
if [ "$NETWORK_MODE" = "host" ]; then
    # Host network mode - use all host ports
    docker run -d --name $CONTAINER_NAME \
        --network host \
        --restart unless-stopped \
        $ENV_VARS \
        $SSL_VOLUME \
        $SSL_DOMAIN \
        -v ${CONTAINER_NAME}-data:/workspace/data \
        $IMAGE_NAME
    
    if [ -n "$SSL_VOLUME" ]; then
        ACCESS_URL="https://$SELECTED_DOMAIN"
        HTTP_URL="http://$SELECTED_DOMAIN"
    else
        ACCESS_URL="http://localhost"
        HTTP_URL=""
    fi
else
    # Bridge network mode - need to map ports
    PORT_MAPPING="-p 80:80"
    [ -n "$SSL_VOLUME" ] && PORT_MAPPING="$PORT_MAPPING -p 443:443"
    
    # Create network if it doesn't exist
    docker network create $NETWORK_MODE 2>/dev/null || true
    
    docker run -d --name $CONTAINER_NAME \
        --network "$NETWORK_MODE" \
        --restart unless-stopped \
        $PORT_MAPPING \
        $ENV_VARS \
        $SSL_VOLUME \
        $SSL_DOMAIN \
        -v ${CONTAINER_NAME}-data:/workspace/data \
        $IMAGE_NAME
    
    if [ -n "$SSL_VOLUME" ]; then
        ACCESS_URL="https://localhost"
        HTTP_URL="http://localhost"
    else
        ACCESS_URL="http://localhost"
        HTTP_URL=""
    fi
fi

# Display results
echo ""
echo "✅ Unicity Explorer started successfully!"
echo ""
echo "Configuration:"
echo "  - Alpha node: $ALPHA_HOST:$ALPHA_PORT"
[ -n "$FULCRUM_SERVER" ] && echo "  - Fulcrum: $FULCRUM_SERVER"
[ -n "$SELECTED_DOMAIN" ] && echo "  - SSL Domain: $SELECTED_DOMAIN"
echo ""
echo "Access URLs:"
echo "  - $ACCESS_URL"
[ -n "$HTTP_URL" ] && echo "  - $HTTP_URL (redirects to HTTPS)"
echo ""
echo "Container management:"
echo "  - View logs: docker logs -f $CONTAINER_NAME"
echo "  - Stop: docker stop $CONTAINER_NAME"
echo "  - Start: docker start $CONTAINER_NAME"
echo "  - Remove: docker rm -f $CONTAINER_NAME"
echo ""
echo "The service will automatically restart on failure or system reboot."