#!/usr/bin/env python3
"""
Generate complete rich list by scanning entire Alpha blockchain
"""

import json
import urllib.request
import base64
import time
import os
import sys
from collections import defaultdict

# Get script directory for relative paths
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BASE_DIR = os.path.dirname(SCRIPT_DIR)

# Configuration
RPC_USER = "u"
RPC_PASSWORD = "p"
RPC_HOST = "127.0.0.1"
RPC_PORT = 8589
OUTPUT_FILE = os.path.join(BASE_DIR, "cache", "rich-list.json")
CACHE_FILE = os.path.join(BASE_DIR, "cache", "scan-progress.json")
TOP_N = 500  # Top 500 addresses
ALPHA_SATOSHIS = 100000000
BATCH_SIZE = 100  # Process blocks in batches

def rpc_call(method, params=[]):
    """Make an RPC call to the Alpha node"""
    url = f"http://{RPC_HOST}:{RPC_PORT}"

    request_data = {
        "jsonrpc": "1.0",
        "id": "richlist",
        "method": method,
        "params": params
    }

    request_json = json.dumps(request_data).encode('utf-8')
    credentials = f"{RPC_USER}:{RPC_PASSWORD}"
    auth_string = base64.b64encode(credentials.encode()).decode('ascii')

    req = urllib.request.Request(url)
    req.add_header('Content-Type', 'application/json')
    req.add_header('Authorization', f'Basic {auth_string}')

    try:
        response = urllib.request.urlopen(req, request_json)
        response_data = json.loads(response.read().decode('utf-8'))

        if 'error' in response_data and response_data['error']:
            print(f"RPC Error: {response_data['error']}")
            return None

        return response_data.get('result')
    except Exception as e:
        print(f"Request failed: {e}")
        return None

def load_cache():
    """Load previous scan progress"""
    if os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, 'r') as f:
                cache = json.load(f)
                print(f"Loaded cache: {cache['scanned_blocks']} blocks already processed")
                return cache
        except Exception as e:
            print(f"Cache load failed: {e}")

    return {
        'scanned_blocks': 0,
        'utxo_map': {},
        'address_balances': {},
        'last_update': 0
    }

def save_cache(cache):
    """Save scan progress"""
    cache['last_update'] = int(time.time())
    os.makedirs(os.path.dirname(CACHE_FILE), exist_ok=True)

    with open(CACHE_FILE + '.tmp', 'w') as f:
        json.dump(cache, f)

    # Atomic rename
    os.replace(CACHE_FILE + '.tmp', CACHE_FILE)

def scan_blocks(start_height, end_height, cache):
    """Scan a range of blocks and update balances"""

    # Convert string keys back to appropriate types
    address_balances = defaultdict(int, {k: int(v) for k, v in cache['address_balances'].items()})
    utxo_map = cache['utxo_map']

    # Track transaction counts per address
    address_tx_counts = defaultdict(int, cache.get('address_tx_counts', {}))

    # Track last outgoing transaction timestamps
    address_last_sent = cache.get('address_last_sent', {})

    for height in range(start_height, end_height + 1):
        # Progress indicator
        if height % 1000 == 0:
            elapsed = time.time() - scan_start_time
            blocks_per_sec = (height - start_height + 1) / elapsed if elapsed > 0 else 0
            remaining = (end_height - height) / blocks_per_sec if blocks_per_sec > 0 else 0

            print(f"Block {height}/{end_height} ({height*100/end_height:.1f}%) - "
                  f"{blocks_per_sec:.0f} blocks/sec - "
                  f"ETA: {remaining/60:.1f} min")

            # Save progress every 1000 blocks
            cache['scanned_blocks'] = height
            cache['address_balances'] = dict(address_balances)
            cache['utxo_map'] = utxo_map
            save_cache(cache)

        # Get block
        blockhash = rpc_call("getblockhash", [height])
        if not blockhash:
            print(f"Failed to get block {height}")
            continue

        block = rpc_call("getblock", [blockhash, 2])
        if not block:
            continue

        # Get block timestamp
        block_time = block.get('time', 0)

        # Process transactions
        for tx in block.get('tx', []):
            txid = tx['txid']
            addresses_in_tx = set()  # Track unique addresses in this transaction

            # Process inputs (spend UTXOs)
            if 'vin' in tx and height > 0:  # Skip coinbase inputs
                for vin in tx['vin']:
                    if 'txid' in vin and 'vout' in vin:
                        utxo_key = f"{vin['txid']}:{vin['vout']}"

                        if utxo_key in utxo_map:
                            address, value = utxo_map[utxo_key]
                            address_balances[address] -= value
                            addresses_in_tx.add(address)

                            # Track last outgoing transaction time
                            if block_time > 0:
                                address_last_sent[address] = block_time

                            # Remove zero balances to save memory
                            if address_balances[address] == 0:
                                del address_balances[address]

                            del utxo_map[utxo_key]

            # Process outputs (create UTXOs)
            for vout in tx.get('vout', []):
                value = int(vout.get('value', 0) * ALPHA_SATOSHIS)

                if value > 0:
                    script_pubkey = vout.get('scriptPubKey', {})

                    # Get address
                    address = None
                    if 'address' in script_pubkey:
                        address = script_pubkey['address']
                    elif 'addresses' in script_pubkey and script_pubkey['addresses']:
                        address = script_pubkey['addresses'][0]

                    if address:
                        # Update balance
                        address_balances[address] += value
                        addresses_in_tx.add(address)

                        # Track UTXO
                        utxo_key = f"{txid}:{vout['n']}"
                        utxo_map[utxo_key] = (address, value)

            # Increment transaction count for all addresses involved
            for address in addresses_in_tx:
                address_tx_counts[address] += 1

    # Final save
    cache['scanned_blocks'] = end_height
    cache['address_balances'] = dict(address_balances)
    cache['utxo_map'] = utxo_map
    cache['address_tx_counts'] = dict(address_tx_counts)
    cache['address_last_sent'] = address_last_sent
    save_cache(cache)

    return address_balances, address_tx_counts, address_last_sent

def generate_richlist(address_balances, address_tx_counts, address_last_sent):
    """Generate and save the rich list"""

    # Community address to exclude
    COMMUNITY_ADDRESS = "alpha1qmmqcy66tyjfq5rgngxk4p2r34y9ny7cnnfq3wmfw8fyx03yahxkq0ck3kh"

    # Filter out zero/negative balances and community address
    positive_balances = {k: v for k, v in address_balances.items()
                        if v > 0 and k != COMMUNITY_ADDRESS}

    # Sort by balance
    sorted_addresses = sorted(
        positive_balances.items(),
        key=lambda x: x[1],
        reverse=True
    )[:TOP_N]

    # Calculate total supply
    total_supply = sum(positive_balances.values())

    # Create rich list
    rich_list = {
        "generated_at": int(time.time()),
        "block_height": rpc_call("getblockcount"),
        "total_addresses_with_balance": len(positive_balances),
        "total_supply": float(total_supply / ALPHA_SATOSHIS),
        "top_addresses": []
    }

    print(f"\nTop 10 Richest Addresses:")
    print("-" * 80)

    for rank, (address, balance) in enumerate(sorted_addresses, 1):
        balance_alpha = float(balance / ALPHA_SATOSHIS)
        percentage = (balance / total_supply * 100) if total_supply > 0 else 0

        rich_list["top_addresses"].append({
            "rank": rank,
            "address": address,
            "balance": balance_alpha,
            "percentage": round(percentage, 4),
            "txCount": address_tx_counts.get(address, 0),
            "lastSent": address_last_sent.get(address, 0)
        })

        if rank <= 10:
            print(f"#{rank:3d}: {address[:30]}... {balance_alpha:>15,.2f} ALPHA ({percentage:>6.2f}%)")

    # Save to file
    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
    with open(OUTPUT_FILE, 'w') as f:
        json.dump(rich_list, f, indent=2)

    print("-" * 80)
    print(f"\nRich list saved to: {OUTPUT_FILE}")
    print(f"Total addresses with balance: {len(positive_balances):,}")
    print(f"Total supply: {rich_list['total_supply']:,.8f} ALPHA")

    # Check if community address was excluded
    if COMMUNITY_ADDRESS in address_balances and address_balances[COMMUNITY_ADDRESS] > 0:
        community_balance = address_balances[COMMUNITY_ADDRESS]
        print(f"\nNote: Community address excluded from rich list")
        print(f"Community balance: {float(community_balance / ALPHA_SATOSHIS):,.2f} ALPHA")

def main():
    global scan_start_time

    print("=" * 80)
    print("Alpha Blockchain Rich List Generator - Full Chain Scan")
    print("=" * 80)

    # Test connection
    current_height = rpc_call("getblockcount")
    if not current_height:
        print("Failed to connect to Alpha node")
        return

    print(f"Connected to Alpha node at height {current_height}")

    # Load cache
    cache = load_cache()
    start_height = cache['scanned_blocks'] + 1 if cache['scanned_blocks'] > 0 else 0

    if start_height > current_height:
        print("Already up to date!")
        address_balances = {k: int(v) for k, v in cache['address_balances'].items()}
        address_tx_counts = cache.get('address_tx_counts', {})
        address_last_sent = cache.get('address_last_sent', {})
    else:
        print(f"\nScanning blocks {start_height} to {current_height}")
        print(f"Total blocks to scan: {current_height - start_height + 1}")

        # User confirmation for full scan
        if start_height == 0:
            print("\nStarting full blockchain scan...")
            # Auto-confirm in non-interactive mode
            if sys.stdin.isatty():
                response = input("Continue? (y/n): ")
                if response.lower() != 'y':
                    print("Scan cancelled.")
                    return

        # Start scanning
        scan_start_time = time.time()
        address_balances, address_tx_counts, address_last_sent = scan_blocks(start_height, current_height, cache)

        elapsed = time.time() - scan_start_time
        print(f"\nScan completed in {elapsed:.1f} seconds")
        print(f"Average speed: {(current_height - start_height + 1) / elapsed:.0f} blocks/sec")

    # Generate rich list
    print("\nGenerating rich list...")
    generate_richlist(address_balances, address_tx_counts, address_last_sent)

    print("\nDone!")

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\nScan interrupted. Progress has been saved.")
        print("Run the script again to resume from where you left off.")
        sys.exit(0)