#!/usr/bin/env python3
"""
Build a complete cache of ALL transaction -> coinbase origin mappings
This allows instant lookup of vesting status without any RPC calls
"""

import json
import subprocess
import time
import os
import sys
from datetime import datetime

# Get script directory for relative paths
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BASE_DIR = os.path.dirname(SCRIPT_DIR)

CACHE_FILE = os.path.join(BASE_DIR, "data", "coinbase-origins-complete.json")
PROGRESS_FILE = os.path.join(BASE_DIR, "data", "coinbase-cache-progress.json")
LOCK_HEIGHT = 280000

def rpc_call(method, params=[]):
    """Make an RPC call to the Alpha node"""
    cmd = ["alpha-cli", method] + [str(p) for p in params]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise Exception(f"RPC call failed: {result.stderr}")
    if not result.stdout.strip():
        return None

    # Some methods return raw strings (like getblockhash)
    if method == "getblockhash":
        return result.stdout.strip()

    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError as e:
        # If it's not JSON, return as string
        return result.stdout.strip()

def build_complete_cache():
    """Build cache by scanning ALL blocks in the blockchain"""
    print("Building complete coinbase origin cache...")

    # Load progress if exists
    start_height = 0  # Genesis block is 0
    cache = {}

    if os.path.exists(PROGRESS_FILE):
        with open(PROGRESS_FILE, 'r') as f:
            progress = json.load(f)
            start_height = progress.get("last_processed_height", 0) + 1
            print(f"Resuming from block {start_height}")

    if os.path.exists(CACHE_FILE):
        with open(CACHE_FILE, 'r') as f:
            cache = json.load(f)
            print(f"Loaded {len(cache)} existing cache entries")

    # Get current block height
    blockchain_info = rpc_call("getblockchaininfo")
    current_height = blockchain_info["blocks"]

    print(f"Processing blocks {start_height} to {current_height}")
    start_time = time.time()

    # Track coinbase transactions
    coinbase_txs = {}  # txid -> {height, is_vested}

    for height in range(start_height, current_height + 1):
        if height % 1000 == 0:
            elapsed = time.time() - start_time
            rate = (height - start_height + 1) / elapsed if elapsed > 0 else 0
            remaining = (current_height - height) / rate if rate > 0 else 0
            print(f"Block {height}/{current_height} - {len(cache)} txs cached - "
                  f"{rate:.0f} blocks/sec - ETA: {remaining/60:.1f} min")
            sys.stdout.flush()

            # Save progress periodically
            save_progress(cache, height)

        # Get block
        blockhash = rpc_call("getblockhash", [height])
        block = rpc_call("getblock", [blockhash, 2])  # verbosity=2 gets full tx data

        # First transaction is always coinbase
        if block["tx"]:
            coinbase_tx = block["tx"][0]
            coinbase_txid = coinbase_tx["txid"]

            # Store coinbase info
            coinbase_info = {
                "coinbase_txid": coinbase_txid,
                "coinbase_height": height,
                "is_vested": height < LOCK_HEIGHT
            }

            # Cache the coinbase itself
            cache[coinbase_txid] = coinbase_info
            coinbase_txs[coinbase_txid] = coinbase_info

            # Process all other transactions in block
            for tx in block["tx"][1:]:
                txid = tx["txid"]

                # In Alpha, transactions have single input (except coinbase)
                if tx["vin"] and len(tx["vin"]) > 0:
                    parent_txid = tx["vin"][0].get("txid")

                    if parent_txid:
                        # Look up parent's coinbase origin
                        if parent_txid in cache:
                            cache[txid] = cache[parent_txid]
                        elif parent_txid in coinbase_txs:
                            cache[txid] = coinbase_txs[parent_txid]
                        else:
                            # This shouldn't happen if we process blocks in order
                            print(f"Warning: Parent {parent_txid} not found for {txid}")

    # Save final cache
    save_progress(cache, current_height)

    elapsed = time.time() - start_time
    print(f"\nComplete! Processed {current_height} blocks in {elapsed/60:.1f} minutes")
    print(f"Cached {len(cache)} transactions")
    print(f"Average rate: {current_height/elapsed:.0f} blocks/sec")

    # Cleanup progress file
    if os.path.exists(PROGRESS_FILE):
        os.remove(PROGRESS_FILE)

def save_progress(cache, height):
    """Save current cache and progress"""
    os.makedirs(os.path.dirname(CACHE_FILE), exist_ok=True)

    # Save cache
    with open(CACHE_FILE, 'w') as f:
        json.dump(cache, f)

    # Save progress
    with open(PROGRESS_FILE, 'w') as f:
        json.dump({"last_processed_height": height}, f)

if __name__ == "__main__":
    build_complete_cache()