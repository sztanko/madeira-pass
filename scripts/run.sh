#!/bin/bash
# Convenience script to run the route processing script

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Check if virtualenv exists
if [ ! -d "$SCRIPT_DIR/venv" ]; then
    echo "Virtual environment not found. Creating..."
    python3 -m venv "$SCRIPT_DIR/venv"
    echo "Installing dependencies..."
    "$SCRIPT_DIR/venv/bin/pip" install -q -r "$SCRIPT_DIR/requirements.txt"
fi

# Run the script
echo "Running route processing script..."
"$SCRIPT_DIR/venv/bin/python" "$SCRIPT_DIR/process_routes.py"
