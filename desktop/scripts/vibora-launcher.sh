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
PORT="${PORT:-7777}"

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

# Determine if we should start the server
# Only start if settings indicate local mode with certainty
should_start_server() {
  SETTINGS_FILE="$VIBORA_DIR/settings.json"

  if [ ! -f "$SETTINGS_FILE" ]; then
    # First launch - don't start server, let UI handle onboarding
    log "No settings file found (first launch)"
    return 1
  fi

  # Check if jq is available
  if ! command -v jq &> /dev/null; then
    # Can't read JSON, assume local mode
    log "jq not available, defaulting to local mode"
    return 0
  fi

  # Check if user has remote configured
  REMOTE_HOST=$(jq -r '.remoteVibora.host // .remoteHost // ""' "$SETTINGS_FILE" 2>/dev/null)
  LAST_CONNECTED=$(jq -r '.lastConnectedHost // ""' "$SETTINGS_FILE" 2>/dev/null)

  log "Remote host: '$REMOTE_HOST', Last connected: '$LAST_CONNECTED'"

  if [ -z "$REMOTE_HOST" ] || [ "$REMOTE_HOST" = "null" ]; then
    # No remote configured - definitely local mode
    log "No remote configured, starting server"
    return 0
  elif [ "$LAST_CONNECTED" = "localhost" ]; then
    # User last used local - likely local mode
    log "Last connected to localhost, starting server"
    return 0
  else
    # Remote configured and last connected to remote, don't start server
    log "Remote mode detected, skipping server start"
    return 1
  fi
}

# Main
log "=== Vibora Desktop starting ==="
log "APP_DIR: $APP_DIR"
log "BUNDLE_DIR: $BUNDLE_DIR"
log "VIBORA_DIR: $VIBORA_DIR"

check_dtach
install_plugin

# Conditionally start server
if should_start_server; then
  stop_existing_server
  start_server
else
  log "Server start skipped - will be handled by UI if needed"
fi

# Launch Neutralino
log "Launching UI..."
exec "$APP_DIR/Vibora" "$@"
