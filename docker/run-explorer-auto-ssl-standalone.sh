#!/bin/bash

# Standalone script to run Unicity Explorer with automatic SSL detection
# This script can be copied to any machine with the explorer Docker image
# No additional files required

set -e

# Configuration
CONTAINER_NAME="unicity-explorer"
NGINX_CONTAINER_NAME="unicity-explorer-nginx"
IMAGE_NAME="${EXPLORER_IMAGE:-unicity-explorer:latest}"
NGINX_IMAGE="nginx:alpine"
NETWORK_MODE="${EXPLORER_NETWORK:-host}"

echo "Unicity Explorer Auto-SSL Runner (Standalone)"
echo "=============================================="
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
    
    if [ -n "$FULCRUM_SERVER" ]; then
        export BTCEXP_ELECTRUM_SERVERS="$FULCRUM_SERVER"
        export BTCEXP_ADDRESS_API="electrum"
        export BTCEXP_ELECTRUM_TXINDEX="true"
    fi
    echo ""
fi

# Check for SSL certificates
USE_SSL=false
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
                else
                    USE_SSL=true
                fi
            fi
        fi
        
        if [ -n "$SELECTED_DOMAIN" ] && [ "$USE_SSL" != false ]; then
            USE_SSL=true
            LETSENCRYPT_DIR="$LETSENCRYPT_BASE/$SELECTED_DOMAIN"
        fi
    fi
fi

# Stop any existing containers
echo "Stopping existing containers..."
docker stop $CONTAINER_NAME 2>/dev/null || true
docker rm $CONTAINER_NAME 2>/dev/null || true
docker stop $NGINX_CONTAINER_NAME 2>/dev/null || true
docker rm $NGINX_CONTAINER_NAME 2>/dev/null || true

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
[ -n "$BTCEXP_ELECTRUM_SERVERS" ] && ENV_VARS="$ENV_VARS -e BTCEXP_ELECTRUM_SERVERS=$BTCEXP_ELECTRUM_SERVERS"
[ -n "$BTCEXP_ADDRESS_API" ] && ENV_VARS="$ENV_VARS -e BTCEXP_ADDRESS_API=$BTCEXP_ADDRESS_API"
[ -n "$BTCEXP_ELECTRUM_TXINDEX" ] && ENV_VARS="$ENV_VARS -e BTCEXP_ELECTRUM_TXINDEX=$BTCEXP_ELECTRUM_TXINDEX"

if [ "$USE_SSL" = true ]; then
    ENV_VARS="$ENV_VARS -e BTCEXP_SECURE_SITE=true -e BTCEXP_TRUST_PROXY=true"
fi

# Run the explorer container
echo "🚀 Starting Unicity Explorer..."
if [ "$NETWORK_MODE" = "host" ]; then
    docker run -d --name $CONTAINER_NAME \
        --network host \
        --restart unless-stopped \
        $ENV_VARS \
        -v unicity-explorer-data:/workspace/data \
        $IMAGE_NAME
else
    # Create network if it doesn't exist
    docker network create $NETWORK_MODE 2>/dev/null || true
    
    docker run -d --name $CONTAINER_NAME \
        --network "$NETWORK_MODE" \
        --restart unless-stopped \
        -p 3002:3002 \
        $ENV_VARS \
        -v unicity-explorer-data:/workspace/data \
        $IMAGE_NAME
fi

if [ "$USE_SSL" = true ] && [ -n "$SELECTED_DOMAIN" ]; then
    echo "🔒 Setting up SSL with nginx..."
    
    # Create nginx configuration inline
    NGINX_CONFIG="
server {
    listen 80;
    server_name $SELECTED_DOMAIN;
    return 301 https://\$server_name\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name $SELECTED_DOMAIN;

    ssl_certificate /etc/letsencrypt/live/$SELECTED_DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$SELECTED_DOMAIN/privkey.pem;
    
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    
    client_max_body_size 100M;
    proxy_connect_timeout 600;
    proxy_send_timeout 600;
    proxy_read_timeout 600;
    send_timeout 600;

    location / {
        proxy_pass http://localhost:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
}
"
    
    # Run nginx with inline configuration
    if [ "$NETWORK_MODE" = "host" ]; then
        docker run -d --name $NGINX_CONTAINER_NAME \
            --network host \
            --restart unless-stopped \
            -v /etc/letsencrypt:/etc/letsencrypt:ro \
            $NGINX_IMAGE \
            sh -c "echo '$NGINX_CONFIG' > /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"
    else
        docker run -d --name $NGINX_CONTAINER_NAME \
            --network "$NETWORK_MODE" \
            --restart unless-stopped \
            -p 80:80 -p 443:443 \
            -v /etc/letsencrypt:/etc/letsencrypt:ro \
            $NGINX_IMAGE \
            sh -c "echo '$NGINX_CONFIG' > /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"
    fi
    
    echo ""
    echo "✅ Unicity Explorer started with SSL support"
    echo "🔒 Using certificate for: $SELECTED_DOMAIN"
    echo ""
    echo "Available endpoints:"
    echo "  - HTTPS: https://$SELECTED_DOMAIN"
    echo "  - HTTP: http://$SELECTED_DOMAIN (redirects to HTTPS)"
else
    echo ""
    echo "✅ Unicity Explorer started (HTTP only)"
    echo ""
    echo "Available endpoint:"
    echo "  - HTTP: http://localhost:3002"
fi

echo ""
echo "Configuration:"
echo "  - Alpha node: $ALPHA_HOST:$ALPHA_PORT"
[ -n "$BTCEXP_ELECTRUM_SERVERS" ] && echo "  - Fulcrum: $BTCEXP_ELECTRUM_SERVERS"
echo ""
echo "To view logs:"
echo "  Explorer: docker logs -f $CONTAINER_NAME"
[ "$USE_SSL" = true ] && echo "  Nginx: docker logs -f $NGINX_CONTAINER_NAME"
echo ""
echo "To stop:"
echo "  docker stop $CONTAINER_NAME"
[ "$USE_SSL" = true ] && echo "  docker stop $NGINX_CONTAINER_NAME"