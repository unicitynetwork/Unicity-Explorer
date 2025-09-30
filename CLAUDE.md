# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Unicity L1 Explorer - A blockchain explorer for the Unicity consensus layer, forked from btc-rpc-explorer. This is a Node.js/Express application that provides a web interface for exploring blockchain data with special support for RandomX proof-of-work information.

## Essential Commands

### Development
- `npm start` - Start the application server (runs on port 3002 by default)
- `npm test` - Run the test suite (bin/test.js)
- `npm run lint` - Run ESLint on app and routes directories

### CSS/Styling
- `npm run css` - Build all minified CSS files and update integrity hashes
- `npm run css-debug` - Build expanded CSS files for debugging (light, dark, dark-v1 themes)
- `npm run integrity` - Update frontend resource integrity hashes

### Running the Application
1. Copy `.env-sample` to `.env` and configure:
   - Set `BTCEXP_COIN=ALPHA`
   - Configure RPC connection (BTCEXP_BITCOIND_PORT, typically 8589)
   - Optional: Configure Electrum servers for address indexing
2. Run `npm install` to install dependencies
3. Run `npm start` to start the server

## Architecture

### Core Structure
- **app.js** - Main application entry point, Express server setup
- **routes/** - HTTP route handlers
  - `baseRouter.js` - Main application routes (blocks, transactions, addresses)
  - `apiRouter.js` - REST API endpoints
  - `adminRouter.js` - Admin dashboard and monitoring
  - `snippetRouter.js` - HTML snippets for embedding
- **app/** - Core application logic
  - `api/` - API implementations (RPC, Electrum, address APIs)
  - `coins/btc.js` - Coin-specific configuration (ALPHA coin settings)
  - `utils.js` - Utility functions for blockchain calculations
  - `config.js` - Configuration management
- **views/** - Pug templates for UI
- **public/** - Static assets (CSS, JS, images)

### Key Features
- RandomX PoW support with epoch tracking
- Difficulty calculation with/without RandomX
- Time-to-mine estimates
- RPC-based blockchain interaction
- Optional Electrum server integration for address indexing
- Multiple theme support (light, dark, dark-v1)
- Redis caching support for RPC calls

### API Layers
1. **RPC API** (`app/api/rpcApi.js`) - Direct Bitcoin Core RPC communication
2. **Core API** (`app/api/coreApi.js`) - Higher-level blockchain operations
3. **Address APIs** - Multiple providers (Electrum, blockchain.com, etc.)

### Configuration
- Environment variables via `.env` file or system environment
- Debug logging controlled via DEBUG env var (e.g., `DEBUG=btcexp:*`)
- Config loaded from multiple paths (home dir, /etc, current dir)

### Caching Strategy
- In-memory LRU cache by default
- Optional Redis caching via BTCEXP_REDIS_URL
- Cache can be disabled with BTCEXP_NO_INMEMORY_RPC_CACHE=true

### Session & Security
- Express sessions with optional Redis store
- CSRF protection
- Basic auth support
- SSO integration capability

## Important Notes

- The application uses the Bitcoin Core RPC interface for blockchain data
- Port 8589 is the default RPC port for Unicity/Alpha network
- Electrum server integration provides address balance and transaction history
- The explorer supports RandomX-specific blockchain features not found in standard Bitcoin explorers