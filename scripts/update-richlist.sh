#!/bin/bash

# Update rich list periodically
# Run this with cron or as a systemd service

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
LOG_FILE="$SCRIPT_DIR/../cache/richlist-update.log"

echo "$(date): Starting rich list update" >> "$LOG_FILE"

# Run the Python script to generate fresh rich list
python3 "$SCRIPT_DIR/generate-full-richlist.py" >> "$LOG_FILE" 2>&1

if [ $? -eq 0 ]; then
    echo "$(date): Rich list update completed successfully" >> "$LOG_FILE"
else
    echo "$(date): Rich list update failed" >> "$LOG_FILE"
fi

echo "---" >> "$LOG_FILE"