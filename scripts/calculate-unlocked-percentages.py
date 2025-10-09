#!/usr/bin/env python3
"""
Calculate the percentage of unlocked coins for top addresses
"""

import json
import subprocess
import os
from collections import defaultdict

# Get script directory for relative paths
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BASE_DIR = os.path.dirname(SCRIPT_DIR)

# Configuration
RICH_LIST_FILE = os.path.join(BASE_DIR, "cache", "rich-list.json")
COINBASE_CACHE_FILE = os.path.join(BASE_DIR, "data", "coinbase-origins-complete.json")
OUTPUT_FILE = os.path.join(BASE_DIR, "cache", "rich-list-with-unlocked.json")
LOCK_HEIGHT = 280000
ALPHA_SATOSHIS = 100000000

def rpc_call(method, params=[]):
    """Make an RPC call to the Alpha node"""
    cmd = ["alpha-cli", method] + [str(p) for p in params]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise Exception(f"RPC call failed: {result.stderr}")
    if not result.stdout.strip():
        return None

    # Some methods return raw strings
    if method == "getblockhash":
        return result.stdout.strip()

    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError:
        return result.stdout.strip()

def calculate_unlocked_percentage():
    """Calculate % unlocked for each address in the rich list"""

    # Load rich list
    print("Loading rich list...")
    if not os.path.exists(RICH_LIST_FILE):
        print(f"Error: Rich list file not found at {RICH_LIST_FILE}")
        return

    with open(RICH_LIST_FILE, 'r') as f:
        rich_list_data = json.load(f)

    # Load coinbase cache
    print("Loading coinbase cache...")
    if not os.path.exists(COINBASE_CACHE_FILE):
        print(f"Error: Coinbase cache not found at {COINBASE_CACHE_FILE}")
        return

    with open(COINBASE_CACHE_FILE, 'r') as f:
        coinbase_cache = json.load(f)

    print(f"Loaded {len(coinbase_cache)} cached coinbase origins")

    # Process top addresses (limit to top 100 for performance)
    addresses = rich_list_data.get("top_addresses", [])[:100]
    print(f"Processing top {len(addresses)} addresses...")

    for i, addr_data in enumerate(addresses):
        address = addr_data["address"]

        if i % 10 == 0:
            print(f"Processing address {i+1}/{len(addresses)}...")

        try:
            # Get UTXOs for this address using scantxoutset
            # Use JSON format for the descriptor array
            import json as json_module
            descriptors = json_module.dumps([f"addr({address})"])
            result = rpc_call("scantxoutset", ["start", descriptors])

            if not result or "unspents" not in result:
                print(f"Warning: No UTXOs found for {address}")
                addr_data["percentUnlocked"] = 100  # No UTXOs means no locked coins
                continue

            total_value = 0
            unlocked_value = 0

            # Check each UTXO
            for utxo in result["unspents"]:
                txid = utxo["txid"]
                amount = utxo["amount"] * ALPHA_SATOSHIS
                total_value += amount

                # Look up in coinbase cache
                if txid in coinbase_cache:
                    coinbase_info = coinbase_cache[txid]
                    coinbase_height = coinbase_info.get("coinbase_height", 0)

                    # If coinbase is after lock height, it's unlocked
                    if coinbase_height >= LOCK_HEIGHT:
                        unlocked_value += amount
                else:
                    # If not in cache, assume it's from a recent block (unlocked)
                    # This handles UTXOs from blocks after our cache was built
                    unlocked_value += amount

            # Calculate percentage
            if total_value > 0:
                percent_unlocked = (unlocked_value / total_value) * 100
            else:
                percent_unlocked = 100

            addr_data["percentUnlocked"] = round(percent_unlocked, 2)
            addr_data["totalValue"] = total_value / ALPHA_SATOSHIS
            addr_data["unlockedValue"] = unlocked_value / ALPHA_SATOSHIS
            addr_data["lockedValue"] = (total_value - unlocked_value) / ALPHA_SATOSHIS

            print(f"  {address[:20]}... - {percent_unlocked:.1f}% unlocked")

        except Exception as e:
            print(f"Error processing {address}: {e}")
            addr_data["percentUnlocked"] = None

    # Save updated rich list
    print(f"\nSaving updated rich list to {OUTPUT_FILE}")
    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
    with open(OUTPUT_FILE, 'w') as f:
        json.dump(rich_list_data, f, indent=2)

    # Also update the original file
    with open(RICH_LIST_FILE, 'w') as f:
        json.dump(rich_list_data, f, indent=2)

    print("Done! Rich list updated with unlocked percentages.")

    # Show summary
    unlocked_counts = defaultdict(int)
    for addr in addresses:
        if "percentUnlocked" in addr and addr["percentUnlocked"] is not None:
            if addr["percentUnlocked"] == 100:
                unlocked_counts["fully_unlocked"] += 1
            elif addr["percentUnlocked"] == 0:
                unlocked_counts["fully_locked"] += 1
            else:
                unlocked_counts["partially_unlocked"] += 1

    print("\nSummary:")
    print(f"  Fully unlocked: {unlocked_counts['fully_unlocked']} addresses")
    print(f"  Partially unlocked: {unlocked_counts['partially_unlocked']} addresses")
    print(f"  Fully locked: {unlocked_counts['fully_locked']} addresses")

if __name__ == "__main__":
    calculate_unlocked_percentage()