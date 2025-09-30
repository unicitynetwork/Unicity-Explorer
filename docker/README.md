# Unicity Explorer Docker Support

This directory contains Docker infrastructure for building and running the Unicity Explorer with automatic SSL/TLS support.

## Quick Start

```bash
# Build the Docker image
./build.sh

# Run the explorer
./run-explorer.sh
```

## Features

- **Automatic SSL Detection**: Automatically detects and uses Let's Encrypt certificates
- **Network Auto-Discovery**: Automatically joins `alpha-net` Docker network if available
- **Built-in SSL Support**: Node.js native SSL/TLS support without nginx
- **Default Credentials**: Pre-configured with standard alpha-node credentials (user/password)

## Scripts

### build.sh
Builds the Unicity Explorer Docker image locally.
```bash
./build.sh
```
Creates image: `unicity-explorer:latest`

### publish-image.sh
Builds and publishes the Docker image to GitHub Container Registry.
```bash
# Publish with default 'latest' tag
./publish-image.sh

# Publish with specific tag
./publish-image.sh v1.0.0

# Publish with multiple tags
./publish-image.sh v1.0.0 "latest,stable"
```
Publishes to: `ghcr.io/unicitynetwork/unicity-explorer`

### run-explorer.sh
Runs the explorer with automatic configuration detection:
- Detects and joins `alpha-net` network if available
- Prompts for Fulcrum/Electrum server selection
- Automatically detects SSL certificates
- Configures ports based on SSL availability

```bash
./run-explorer.sh
```

## Configuration

### Network Modes
- **alpha-net**: Automatically detected if available, uses container names for connectivity
- **host**: Fallback mode when alpha-net is not available

### Default Connections
- **Alpha Node**: 
  - Host: `alpha-node` (in alpha-net) or `localhost` (host network)
  - Port: `8589`
  - Credentials: `user:password`
- **Fulcrum/Electrum**:
  - Options presented during startup:
    - Local Fulcrum: `tcp://localhost:50001` or `tcp://fulcrum-alpha:50001`
    - Public Fulcrum: `tls://fulcrum.unicity.network:50002`
    - Custom endpoint
    - Skip (no address indexing)

### SSL/TLS Configuration
When SSL certificates are detected:
- HTTP on port 80 (redirects to HTTPS)
- HTTPS on port 443

Without SSL certificates:
- HTTP only on port 3002

### Environment Variables
You can override defaults with environment variables:
```bash
BTCEXP_BITCOIND_HOST=alpha-node \
BTCEXP_BITCOIND_PORT=8589 \
BTCEXP_BITCOIND_USER=user \
BTCEXP_BITCOIND_PASS=password \
BTCEXP_ELECTRUM_SERVERS=tcp://fulcrum-alpha:50001 \
./run-explorer.sh
```

## Docker Image

The Docker image includes:
- Node.js 18 Alpine base
- Built-in SSL/TLS support via `bin/www-ssl`
- Health check endpoint at `/api/status`
- Automatic environment configuration

## Container Management

```bash
# View logs
docker logs -f unicity-explorer

# Stop the container
docker stop unicity-explorer

# Start the container
docker start unicity-explorer

# Remove the container
docker rm unicity-explorer
```

## SSL Certificate Notes

The explorer automatically detects Let's Encrypt certificates in `/etc/letsencrypt/live/`. 
For local Fulcrum connections with self-signed certificates, the explorer automatically 
skips certificate verification to allow connectivity within Docker networks.

## Troubleshooting

### Connection Issues
- Ensure alpha-node is running and accessible
- Check if Fulcrum/Electrum server is running
- Verify network connectivity between containers

### SSL Issues
- Ensure Let's Encrypt certificates are properly installed
- Check certificate permissions (must be readable)
- Verify certificate paths are correctly mounted

### Port Conflicts
- Default ports: 80, 443 (with SSL) or 3002 (without SSL)
- Stop any services using these ports before running the explorer