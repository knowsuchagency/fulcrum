#!/bin/bash
# Vibora Desktop Launcher
# Starts server, installs plugin, launches UI

set -e

# macOS GUI apps don't inherit user's shell PATH
# Add common paths where homebrew and other tools are installed
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

# Get the directory where the app is installed
APP_DIR="$(cd "$(dirname "$0")" && pwd)"
BUNDLE_DIR="$APP_DIR/../Resources/bundle"
VIBORA_DIR="${VIBORA_DIR:-$HOME/.vibora}"
LOG_FILE="$VIBORA_DIR/desktop.log"
PID_FILE="$VIBORA_DIR/desktop-server.pid"
PORT="${PORT:-3333}"

# Ensure vibora directory exists
mkdir -p "$VIBORA_DIR"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
  echo "$1" >&2
}

error_dialog() {
  osascript -e "display dialog \"$1\" buttons {\"OK\"} default button \"OK\" with title \"Vibora\" with icon stop" 2>/dev/null || echo "$1" >&2
}

info_dialog() {
  osascript -e "display dialog \"$1\" buttons {\"OK\"} default button \"OK\" with title \"Vibora\"" 2>/dev/null || echo "$1" >&2
}

# Check for dtach
check_dtach() {
  if ! command -v dtach &> /dev/null; then
    log "dtach not found"
    error_dialog "dtach is required for terminal persistence but not installed.

Install it with:
  brew install dtach"
    exit 1
  fi
  log "dtach found: $(which dtach)"
}

# Install Claude plugin if not present
install_plugin() {
  PLUGIN_SRC="$BUNDLE_DIR/plugin"
  PLUGIN_DEST="$HOME/.claude/plugins/vibora"

  if [ -d "$PLUGIN_SRC" ]; then
    # Check if plugin needs update (compare versions)
    if [ -f "$PLUGIN_DEST/.claude-plugin/plugin.json" ] && [ -f "$PLUGIN_SRC/.claude-plugin/plugin.json" ]; then
      SRC_VERSION=$(jq -r '.version' "$PLUGIN_SRC/.claude-plugin/plugin.json" 2>/dev/null || echo "0")
      DEST_VERSION=$(jq -r '.version' "$PLUGIN_DEST/.claude-plugin/plugin.json" 2>/dev/null || echo "0")
      if [ "$SRC_VERSION" = "$DEST_VERSION" ]; then
        log "Claude plugin already installed (v$DEST_VERSION)"
        return
      fi
      log "Updating Claude plugin: v$DEST_VERSION -> v$SRC_VERSION"
    else
      log "Installing Claude plugin..."
    fi

    mkdir -p "$HOME/.claude/plugins"
    rm -rf "$PLUGIN_DEST"
    cp -r "$PLUGIN_SRC" "$PLUGIN_DEST"
    log "Claude plugin installed to $PLUGIN_DEST"
  else
    log "Plugin source not found at $PLUGIN_SRC"
  fi
}

# Stop any existing server
stop_existing_server() {
  if [ -f "$PID_FILE" ]; then
    OLD_PID=$(cat "$PID_FILE")
    if kill -0 "$OLD_PID" 2>/dev/null; then
      log "Stopping existing server (PID: $OLD_PID)"
      kill "$OLD_PID" 2>/dev/null || true
      sleep 1
      # Force kill if still running
      if kill -0 "$OLD_PID" 2>/dev/null; then
        kill -9 "$OLD_PID" 2>/dev/null || true
      fi
    fi
    rm -f "$PID_FILE"
  fi
}

# Start the server
start_server() {
  SERVER_BIN="$BUNDLE_DIR/server/vibora-server"

  if [ ! -f "$SERVER_BIN" ]; then
    log "Server executable not found at $SERVER_BIN"
    error_dialog "Server executable not found. The app may be corrupted."
    exit 1
  fi

  # Determine PTY library
  ARCH=$(uname -m)
  if [ "$ARCH" = "arm64" ]; then
    PTY_LIB="$BUNDLE_DIR/lib/librust_pty_arm64.dylib"
  else
    PTY_LIB="$BUNDLE_DIR/lib/librust_pty.dylib"
  fi

  log "Starting server on port $PORT..."

  # Start server in background (standalone executable - no bun required)
  NODE_ENV=production \
  PORT="$PORT" \
  VIBORA_DIR="$VIBORA_DIR" \
  VIBORA_PACKAGE_ROOT="$BUNDLE_DIR" \
  BUN_PTY_LIB="$PTY_LIB" \
  "$SERVER_BIN" >> "$LOG_FILE" 2>&1 &

  SERVER_PID=$!
  echo "$SERVER_PID" > "$PID_FILE"
  log "Server started with PID: $SERVER_PID"

  # Wait for server to be ready
  for i in {1..30}; do
    if curl -s "http://localhost:$PORT/health" > /dev/null 2>&1; then
      log "Server is ready"
      return 0
    fi
    sleep 0.5
  done

  log "Server failed to start"
  error_dialog "Failed to start Vibora server. Check $LOG_FILE for details."
  exit 1
}

# Cleanup on exit
cleanup() {
  log "Shutting down..."
  if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    if kill -0 "$PID" 2>/dev/null; then
      kill "$PID" 2>/dev/null || true
    fi
    rm -f "$PID_FILE"
  fi
}

trap cleanup EXIT

# Main
log "=== Vibora Desktop starting ==="
log "APP_DIR: $APP_DIR"
log "BUNDLE_DIR: $BUNDLE_DIR"
log "VIBORA_DIR: $VIBORA_DIR"

check_dtach
install_plugin
stop_existing_server
start_server

# Launch Neutralino
log "Launching UI..."
exec "$APP_DIR/Vibora" "$@"
