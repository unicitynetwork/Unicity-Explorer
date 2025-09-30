# Unicity Explorer Docker Scripts

This directory contains Docker build and deployment scripts for the Unicity Explorer.

## Prerequisites

- Docker installed and running
- Docker Compose installed
- For SSL: Let's Encrypt certificates installed on the host

## Scripts

### build.sh
Builds the Unicity Explorer Docker image locally.
```bash
./build.sh
```

### publish-image.sh
Builds and publishes the Docker image to a registry (default: GitHub Container Registry).
```bash
./publish-image.sh [tag]
```

### run-explorer-auto-ssl.sh
Automatically detects available SSL certificates and runs the explorer with HTTPS support.
- Searches for Let's Encrypt certificates in `/etc/letsencrypt/live/`
- Allows selection if multiple certificates are found
- Falls back to HTTP-only mode if no certificates are available
```bash
./run-explorer-auto-ssl.sh
```

### run-explorer-ssl.sh
Runs the explorer with SSL using a specific domain certificate (configured in the script).
Default domain: `friendly-miners.dyndns.org`
```bash
./run-explorer-ssl.sh
```

## Configuration

The Docker scripts automatically create configuration files with sensible defaults:

### Default Connections
- **Alpha Node**: `localhost:8589` (when using host network)
- **Fulcrum Server**: `tcp://localhost:50001` (local Fulcrum without SSL)

### Configuration Templates

Three configuration templates are provided:

1. **`.env.template`** - Default configuration for standalone deployment
   - Connects to local Alpha node at localhost:8589
   - Uses local Fulcrum server at localhost:50001 (default)
   - Alternative options available: public Fulcrum or custom endpoint

2. **`.env.alpha-net`** - Configuration for running with Fulcrum/Alpha Docker containers
   - Connects to `alpha-node` container
   - Connects to `fulcrum-alpha` container

### Manual Configuration

1. Create a `config` directory (created automatically by scripts):
```bash
mkdir config
```

2. Copy and edit the appropriate template:
```bash
# For standalone deployment
cp config/.env.template config/.env

# For alpha-net deployment
cp config/.env.alpha-net config/.env

# Edit config/.env with your settings
```

### Required Configuration
- `BTCEXP_COIN=ALPHA` - Set to ALPHA for Unicity network
- `BTCEXP_BITCOIND_PORT=8589` - RPC port for Unicity node
- `BTCEXP_BITCOIND_HOST` - Host where Unicity node is running
- `BTCEXP_BITCOIND_USER` - RPC username (if configured)
- `BTCEXP_BITCOIND_PASS` - RPC password (if configured)

### Fulcrum/Electrum Configuration

The run scripts provide interactive Fulcrum endpoint selection:

1. **Automatic Selection** - When first running the scripts, you'll be prompted to choose:
   - Option 1: `tcp://localhost:50001` (local Fulcrum, no SSL) - **Default**
   - Option 2: `tls://fulcrum.unicity.network:50002` (public Fulcrum, SSL)
   - Option 3: Custom endpoint (enter any tcp:// or tls:// URL)
   - Option 4: Skip (no address indexing)

2. **Manual Configuration** - Edit `.env` file:
   - `BTCEXP_ADDRESS_API=electrum` - Enable address indexing
   - `BTCEXP_ELECTRUM_SERVERS` - Fulcrum server URL
     - Local: `tcp://localhost:50001` (default)
     - Public: `tls://fulcrum.unicity.network:50002` (with SSL)
     - Docker: `tcp://fulcrum-alpha:50001` (in alpha-net)
     - Custom: `tcp://192.168.1.100:50001` (any IP:port)

3. **Environment Variable** - Override via environment:
   ```bash
   export BTCEXP_ELECTRUM_SERVERS=tcp://192.168.1.100:50001
   ./run-explorer-auto-ssl.sh
   ```

## Running with Docker Compose

### Standalone with Host Network (HTTP only)
Uses host network to connect to local Alpha node and Fulcrum:
```bash
docker compose -f docker compose.standalone.yml up -d
```

### With Fulcrum/Alpha Docker Stack
If running Fulcrum and Alpha node in Docker using alpha-net network:
```bash
# Ensure alpha-net network exists (created by Fulcrum's docker compose)
docker compose -f docker compose.alpha-net.yml up -d
```

### With SSL (using run scripts)
The SSL run scripts automatically create a docker compose.yml with nginx proxy for HTTPS.

### Network Modes
You can control the network mode using the `EXPLORER_NETWORK` environment variable:
```bash
# Use host network (default)
./run-explorer-auto-ssl.sh

# Use alpha-net network
EXPLORER_NETWORK=alpha-net ./run-explorer-auto-ssl.sh

# Use custom network
EXPLORER_NETWORK=my-network ./run-explorer-auto-ssl.sh
```

## Directory Structure
```
docker/
├── build.sh                      # Build script
├── publish-image.sh              # Publish to registry
├── run-explorer-auto-ssl.sh      # Auto-detect SSL certificates
├── run-explorer-ssl.sh           # Use specific SSL certificate
├── Dockerfile                    # Multi-stage Docker build
├── docker compose.standalone.yml # Simple HTTP-only compose
├── config/                       # Configuration files (created)
│   └── .env                      # Environment configuration
├── ssl/                          # SSL certificates (created)
│   ├── fullchain.pem
│   └── privkey.pem
└── nginx/                        # Nginx config (created)
    └── default.conf
```

## SSL Certificate Management

The SSL scripts automatically:
1. Find Let's Encrypt certificates on the host
2. Copy them to a local `ssl/` directory
3. Configure nginx as an HTTPS proxy
4. Set up automatic HTTP to HTTPS redirect

## Accessing the Explorer

- **HTTP**: http://localhost:3002 (standalone)
- **HTTPS**: https://your-domain.com (with SSL scripts)

## Monitoring

View logs:
```bash
# Explorer logs
docker logs -f unicity-explorer

# Nginx logs (when using SSL)
docker logs -f unicity-explorer-nginx
```

Check status:
```bash
docker ps
```

## Stopping the Services

```bash
# If using docker compose
docker compose down

# Or stop individual containers
docker stop unicity-explorer
docker stop unicity-explorer-nginx
```

## Troubleshooting

1. **Port already in use**: Check if another service is using port 3002 or 443
2. **SSL certificate not found**: Ensure Let's Encrypt certificates exist in `/etc/letsencrypt/live/`
3. **Connection refused**: Check if the Unicity node is running and accessible
4. **Permission denied**: Run SSL scripts with appropriate permissions (may need sudo for certificate access)