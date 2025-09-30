#!/bin/bash

# Script to run Unicity Explorer with SSL support
# Automatically copies Let's Encrypt certificates to local ssl directory

set -e

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Configuration
LETSENCRYPT_DOMAIN="friendly-miners.dyndns.org"
LETSENCRYPT_DIR="/etc/letsencrypt/live/$LETSENCRYPT_DOMAIN"
SSL_DIR="$SCRIPT_DIR/ssl"
CONFIG_DIR="$SCRIPT_DIR/config"
CONTAINER_NAME="unicity-explorer"
IMAGE_NAME="${EXPLORER_IMAGE:-unicity-explorer:latest}"
NETWORK_MODE="host"  # Use host network to access local services

echo "Unicity Explorer SSL Runner"
echo "============================"
echo ""
echo "Running from: $SCRIPT_DIR"

# Check if we should use a specific network
if [ -n "$EXPLORER_NETWORK" ]; then
    NETWORK_MODE="$EXPLORER_NETWORK"
    echo "Using network: $NETWORK_MODE"
fi

# Create config directory if it doesn't exist
mkdir -p "$CONFIG_DIR"

# Change to script directory for relative paths in docker-compose
cd "$SCRIPT_DIR"

# Set default values for configuration
ALPHA_HOST="${BTCEXP_BITCOIND_HOST:-127.0.0.1}"
ALPHA_PORT="${BTCEXP_BITCOIND_PORT:-8589}"
ALPHA_USER="${BTCEXP_BITCOIND_USER:-}"
ALPHA_PASS="${BTCEXP_BITCOIND_PASS:-}"

# Check if we have an external .env file
if [ -f "$CONFIG_DIR/.env" ]; then
    echo "Using existing configuration from $CONFIG_DIR/.env"
    # Source the .env file to get FULCRUM settings
    export $(grep -v '^#' "$CONFIG_DIR/.env" | xargs)
    CURRENT_FULCRUM="${BTCEXP_ELECTRUM_SERVERS:-}"
    if [ -n "$CURRENT_FULCRUM" ]; then
        echo "Current Fulcrum endpoint: $CURRENT_FULCRUM"
    fi
else
    echo "No external .env file found, will use environment variables"
    CURRENT_FULCRUM="${BTCEXP_ELECTRUM_SERVERS:-}"
fi

# If no Fulcrum endpoint configured or if user wants to change it
if [ -z "$CURRENT_FULCRUM" ] || [ -z "$BTCEXP_ELECTRUM_SERVERS" ]; then
    echo ""
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
    
    # Set the Fulcrum server environment variable
    if [ -n "$FULCRUM_SERVER" ]; then
        export BTCEXP_ELECTRUM_SERVERS="$FULCRUM_SERVER"
        export BTCEXP_ADDRESS_API="electrum"
        export BTCEXP_ELECTRUM_TXINDEX="true"
    else
        unset BTCEXP_ELECTRUM_SERVERS
        unset BTCEXP_ADDRESS_API
        unset BTCEXP_ELECTRUM_TXINDEX
    fi
    
    echo ""
fi

# Check if Let's Encrypt directory exists
if [ ! -d "$LETSENCRYPT_DIR" ]; then
    echo "❌ Error: Let's Encrypt directory not found: $LETSENCRYPT_DIR"
    echo "Please check the domain name or run certbot first."
    exit 1
fi

# Create SSL directory
mkdir -p "$SSL_DIR"

# Copy certificates (following symlinks with -L)
echo "📋 Copying SSL certificates..."
sudo cp -L "$LETSENCRYPT_DIR/fullchain.pem" "$SSL_DIR/" || {
    echo "❌ Failed to copy fullchain.pem"
    exit 1
}
sudo cp -L "$LETSENCRYPT_DIR/privkey.pem" "$SSL_DIR/" || {
    echo "❌ Failed to copy privkey.pem"
    exit 1
}

# Fix ownership and permissions
sudo chown $USER:$USER "$SSL_DIR"/*
chmod 644 "$SSL_DIR/fullchain.pem"
chmod 600 "$SSL_DIR/privkey.pem"

echo "✅ SSL certificates copied successfully"

# SSL configuration is handled via environment variables, no need to update .env

# Stop any existing container
docker stop $CONTAINER_NAME 2>/dev/null || true
docker rm $CONTAINER_NAME 2>/dev/null || true
docker stop ${CONTAINER_NAME}-nginx 2>/dev/null || true
docker rm ${CONTAINER_NAME}-nginx 2>/dev/null || true

# Create nginx config for SSL proxy
echo "Creating nginx configuration..."
mkdir -p nginx
cat > nginx/default.conf << EOF
server {
    listen 80;
    server_name $LETSENCRYPT_DOMAIN;
    return 301 https://\$server_name\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name $LETSENCRYPT_DOMAIN;

    ssl_certificate /etc/nginx/ssl/fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/privkey.pem;
    
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    
    client_max_body_size 100M;
    proxy_connect_timeout 600;
    proxy_send_timeout 600;
    proxy_read_timeout 600;
    send_timeout 600;

    location / {
        proxy_pass http://explorer:3002;
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
EOF

# Prepare environment variables for docker-compose
ENV_COMPOSE=""
ENV_COMPOSE="$ENV_COMPOSE\n      - BTCEXP_COIN=ALPHA"
ENV_COMPOSE="$ENV_COMPOSE\n      - BTCEXP_HOST=0.0.0.0"
ENV_COMPOSE="$ENV_COMPOSE\n      - BTCEXP_PORT=3002"
ENV_COMPOSE="$ENV_COMPOSE\n      - BTCEXP_BITCOIND_HOST=$ALPHA_HOST"
ENV_COMPOSE="$ENV_COMPOSE\n      - BTCEXP_BITCOIND_PORT=$ALPHA_PORT"
ENV_COMPOSE="$ENV_COMPOSE\n      - NODE_ENV=production"
[ -n "$ALPHA_USER" ] && ENV_COMPOSE="$ENV_COMPOSE\n      - BTCEXP_BITCOIND_USER=$ALPHA_USER"
[ -n "$ALPHA_PASS" ] && ENV_COMPOSE="$ENV_COMPOSE\n      - BTCEXP_BITCOIND_PASS=$ALPHA_PASS"
[ -n "$BTCEXP_ELECTRUM_SERVERS" ] && ENV_COMPOSE="$ENV_COMPOSE\n      - BTCEXP_ELECTRUM_SERVERS=$BTCEXP_ELECTRUM_SERVERS"
[ -n "$BTCEXP_ADDRESS_API" ] && ENV_COMPOSE="$ENV_COMPOSE\n      - BTCEXP_ADDRESS_API=$BTCEXP_ADDRESS_API"
[ -n "$BTCEXP_ELECTRUM_TXINDEX" ] && ENV_COMPOSE="$ENV_COMPOSE\n      - BTCEXP_ELECTRUM_TXINDEX=$BTCEXP_ELECTRUM_TXINDEX"
ENV_COMPOSE="$ENV_COMPOSE\n      - BTCEXP_SECURE_SITE=true"
ENV_COMPOSE="$ENV_COMPOSE\n      - BTCEXP_TRUST_PROXY=true"

# Create docker-compose file based on network mode
if [ "$NETWORK_MODE" = "host" ]; then
cat > docker-compose.yml << EOF
version: '3.8'

services:
  explorer:
    image: $IMAGE_NAME
    container_name: $CONTAINER_NAME
    network_mode: host
    restart: unless-stopped
    volumes:
      - unicity-explorer-data:/workspace/data
    environment:$(echo -e "$ENV_COMPOSE")

  nginx:
    image: nginx:alpine
    container_name: ${CONTAINER_NAME}-nginx
    network_mode: host
    restart: unless-stopped
    volumes:
      - ./nginx/default.conf:/etc/nginx/conf.d/default.conf:ro
      - ./ssl:/etc/nginx/ssl:ro
    depends_on:
      - explorer

volumes:
  unicity-explorer-data:
EOF
else
cat > docker-compose.yml << EOF
version: '3.8'

services:
  explorer:
    image: $IMAGE_NAME
    container_name: $CONTAINER_NAME
    restart: unless-stopped
    volumes:
      - unicity-explorer-data:/workspace/data
    environment:$(echo -e "$ENV_COMPOSE")
    networks:
      - explorer-net

  nginx:
    image: nginx:alpine
    container_name: ${CONTAINER_NAME}-nginx
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/default.conf:/etc/nginx/conf.d/default.conf:ro
      - ./ssl:/etc/nginx/ssl:ro
    depends_on:
      - explorer
    networks:
      - explorer-net

networks:
  explorer-net:
    driver: bridge

volumes:
  unicity-explorer-data:
EOF
fi

# Run with docker compose
echo "🚀 Starting Unicity Explorer with SSL support..."
docker compose up -d

echo ""
echo "✅ Unicity Explorer started with SSL support"
echo ""
echo "Available endpoints:"
echo "  - HTTPS: https://$LETSENCRYPT_DOMAIN"
echo "  - HTTP: http://$LETSENCRYPT_DOMAIN (redirects to HTTPS)"
echo ""
echo "To view logs:"
echo "  Explorer: docker logs -f $CONTAINER_NAME"
echo "  Nginx: docker logs -f ${CONTAINER_NAME}-nginx"
echo ""
echo "To stop: docker compose down"
echo "To restart: docker compose restart"