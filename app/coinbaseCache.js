"use strict";

const debug = require("debug");
const debugLog = debug("btcexp:coinbase-cache");
const config = require('./config.js');

const CACHE_PREFIX = 'coinbase:';
const LAST_HEIGHT_KEY = 'coinbase:last_height';
const LOCK_HEIGHT = 300000;

// Initialize Redis client connection
async function initRedisClient() {
	if (!config.redisUrl) {
		debugLog("Redis not configured, coinbase cache disabled");
		return null;
	}

	const { createClient } = require("redis");
	const client = createClient({url: config.redisUrl});

	if (!client.isOpen) {
		await client.connect();
	}

	return client;
}

// Load cache from JSON file into Redis (migration helper)
async function migrateJsonToRedis() {
	const fs = require('fs');
	const path = require('path');
	const CACHE_FILE = path.join(__dirname, '../data/coinbase-origins-complete.json');

	console.log('Checking for cache file:', CACHE_FILE);
	if (!fs.existsSync(CACHE_FILE)) {
		console.log('Cache file not found');
		return 0;
	}
	console.log('Cache file exists, size:', fs.statSync(CACHE_FILE).size, 'bytes');

	const redisClient = await initRedisClient();
	if (!redisClient) {
		console.log('Redis client initialization failed');
		return 0;
	}
	console.log('Redis client initialized');

	try {
		const jsonCache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
		let count = 0;
		const batchSize = 1000;
		const entries = Object.entries(jsonCache);

		for (let i = 0; i < entries.length; i += batchSize) {
			const batch = entries.slice(i, i + batchSize);

			// Use multi for batch operations
			const multi = redisClient.multi();

			for (const [txid, data] of batch) {
				multi.set(
					CACHE_PREFIX + txid,
					JSON.stringify(data)
				);
			}

			await multi.exec();
			count += batch.length;

			if (count % 10000 === 0) {
				console.log(`Migrated ${count} entries to Redis...`);
			}
		}

		debugLog(`Migration complete: ${count} entries moved to Redis`);
		return count;
	} catch (err) {
		console.error("Error migrating cache to Redis:", err);
		return 0;
	}
}

async function loadCache() {
	// For Redis, no need to load - we query on demand
	const redisClient = await initRedisClient();
	if (!redisClient) return;

	try {
		const lastHeight = await redisClient.get(LAST_HEIGHT_KEY);
		if (lastHeight) {
			debugLog(`Cache last processed height: ${lastHeight}`);
		}
	} catch (err) {
		debugLog("Error checking cache status:", err);
	}
}

async function saveCache() {
	// With Redis, saves are immediate, this is a no-op
	// Keeping function for compatibility
}

async function updateCacheWithBlock(blockHeight, block, rpcApi) {
	const redisClient = await initRedisClient();
	if (!redisClient) return;

	try {
		// Check if already processed
		const lastHeight = await redisClient.get(LAST_HEIGHT_KEY);
		if (lastHeight && parseInt(lastHeight) >= blockHeight) {
			return;
		}

		debugLog(`Updating cache with block ${blockHeight}`);

		// First transaction is always coinbase
		if (block.tx && block.tx.length > 0) {
			const coinbaseTxid = block.tx[0];

			// Store coinbase info
			const coinbaseInfo = {
				coinbase_txid: coinbaseTxid,
				coinbase_height: blockHeight,
				is_vested: blockHeight < LOCK_HEIGHT
			};

			await redisClient.set(
				CACHE_PREFIX + coinbaseTxid,
				JSON.stringify(coinbaseInfo)
			);

			// Process all other transactions in the block
			for (let i = 1; i < block.tx.length; i++) {
				const txid = block.tx[i];

				try {
					const tx = await rpcApi.getRawTransaction(txid, block.hash);

					if (tx && tx.vin && tx.vin.length > 0 && tx.vin[0].txid) {
						const parentTxid = tx.vin[0].txid;

						// Get parent's coinbase origin from Redis
						const parentData = await redisClient.get(CACHE_PREFIX + parentTxid);

						if (parentData) {
							// Inherit coinbase origin from parent
							await redisClient.set(
								CACHE_PREFIX + txid,
								parentData  // Already JSON string
							);
						} else {
							debugLog(`Warning: Parent ${parentTxid} not in cache for ${txid}`);
						}
					}
				} catch (err) {
					debugLog(`Error processing tx ${txid}: ${err.message}`);
				}
			}
		}

		// Update last processed height
		await redisClient.set(LAST_HEIGHT_KEY, blockHeight.toString());

		debugLog(`Cache updated to block ${blockHeight}`);
	} catch (err) {
		console.error(`Error updating cache with block ${blockHeight}:`, err);
	}
}

async function getCoinbaseOrigin(txid) {
	const redisClient = await initRedisClient();
	if (!redisClient) return null;

	try {
		const data = await redisClient.get(CACHE_PREFIX + txid);
		if (data) {
			return JSON.parse(data);
		}
		return null;
	} catch (err) {
		debugLog(`Error getting coinbase origin for ${txid}:`, err);
		return null;
	}
}

async function getCacheStats() {
	const redisClient = await initRedisClient();
	if (!redisClient) {
		return { entries: 0, lastHeight: 0, loaded: false };
	}

	try {
		// Count keys with our prefix (this might be slow with many keys)
		const keys = await redisClient.keys(CACHE_PREFIX + '*');
		const lastHeight = await redisClient.get(LAST_HEIGHT_KEY);

		return {
			entries: keys.length - 1,  // Subtract 1 for the last_height key
			lastHeight: parseInt(lastHeight) || 0,
			loaded: true
		};
	} catch (err) {
		debugLog("Error getting cache stats:", err);
		return { entries: 0, lastHeight: 0, loaded: false };
	}
}

module.exports = {
	initRedisClient,
	migrateJsonToRedis,
	loadCache,
	saveCache,
	updateCacheWithBlock,
	getCoinbaseOrigin,
	getCacheStats,
	LOCK_HEIGHT
};