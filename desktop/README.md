# Vibora Desktop App

This directory contains the configuration and scripts for building Vibora as a standalone desktop application using [Neutralinojs](https://neutralino.js.org/).

## Architecture

The desktop app is a lightweight client that connects to a Vibora server running either locally or remotely (e.g., via Tailscale):

```
┌─────────────────────────────────────────────┐
│           Neutralino Window (~2MB)          │
│  ┌───────────────────────────────────────┐  │
│  │           System WebView              │  │
│  │                                       │  │
│  │    ┌─────────────────────────────┐    │  │
│  │    │   Vibora App (iframe)       │    │  │
│  │    │   Loaded from server        │    │  │
│  │    └─────────────────────────────┘    │  │
│  │              ↕ HTTP/WS                │  │
│  └───────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
              │
              │ Network (local or Tailscale)
              ↓
┌─────────────────────────────────────────────┐
│    Vibora Server (local or remote)          │
│    - Hono.js REST API                       │
│    - WebSocket for terminals                │
│    - SQLite database                        │
│    - PTY management                         │
└─────────────────────────────────────────────┘
```

## Connection Flow

When the desktop app starts:

1. **Start local server**: The launcher script starts the bundled Vibora server
2. **Check for remote config**: If `remoteHost` is set in settings, prompt user to choose
3. **Connect**: Connect to chosen server (local by default)

### Using a Remote Server

To use a remote Vibora server instead of the local one:

1. Configure the remote host in your `~/.vibora/settings.json`:
   ```json
   {
     "remoteHost": "my-server.tailnet.ts.net"
   }
   ```

2. Launch the desktop app - you'll be prompted to choose local or remote

Note: The local server still starts (for fallback), but you can connect to your remote instance.

### Settings

Desktop-specific settings are saved to `~/.vibora/settings.json`:

```json
{
  "_schemaVersion": 2,
  "server": { "port": 7777 },
  "remoteVibora": {
    "host": "my-server.tailnet.ts.net",
    "port": 7777
  },
  "lastConnectedHost": "my-server.tailnet.ts.net"
}
```

## Building

### Prerequisites

- Node.js (for npm/Neutralino CLI)
- On Linux: GTK WebKit2 (usually pre-installed), dtach (for terminal persistence)
- On macOS: Xcode Command Line Tools (for code signing), dtach (for terminal persistence)

### Runtime Dependencies

The desktop app bundles the Vibora server as a standalone executable (no Bun required). The only runtime dependency is:

- **dtach** - for terminal persistence (brew install dtach on macOS, apt install dtach on Linux)

### Quick Build

```bash
# Build for current platform
mise run desktop:build

# Run in development mode
mise run desktop:run
```

### Build Commands

| Command | Description |
|---------|-------------|
| `mise run desktop:setup` | Install Neutralino CLI and download binaries |
| `mise run desktop:build` | Build desktop app for current platform |
| `mise run desktop:run` | Run desktop app in development mode |
| `mise run desktop:clean` | Clean build artifacts |

### Packaging

```bash
# Package for current platform (AppImage on Linux, DMG on macOS)
mise run desktop:package

# Package specifically for Linux
mise run desktop:package-appimage        # x64
mise run desktop:package-appimage arm64  # ARM64

# Package specifically for macOS
mise run desktop:package-dmg             # Current arch
mise run desktop:package-dmg arm64       # ARM64
mise run desktop:package-dmg x64         # Intel
```

## Platform Support

| Platform | Architecture | Status |
|----------|-------------|--------|
| Linux | x64 | Supported |
| Linux | ARM64 | Supported |
| macOS | x64 (Intel) | Supported |
| macOS | ARM64 (Apple Silicon) | Supported |
| Windows | x64 | Supported |

## Directory Structure

```
desktop/
├── neutralino.config.json   # Neutralino configuration
├── resources/               # Frontend resources
│   ├── index.html          # Bootstrap/connection page
│   ├── js/
│   │   └── main.js         # Connection logic & settings management
│   └── icons/
│       └── icon.png        # App icon
├── scripts/
│   ├── package-appimage.sh # Linux AppImage packaging
│   └── package-dmg.sh      # macOS DMG packaging
├── bin/                    # Neutralino binaries (generated)
└── dist/                   # Build output (generated)
```

## Remote Server Setup

To use the desktop app with a remote Vibora server:

1. **Start Vibora on your remote machine**:
   ```bash
   vibora up
   # or
   mise run up
   ```

2. **Ensure the server is accessible**:
   - Via Tailscale: Use your machine's Tailscale hostname (e.g., `my-server.tailnet.ts.net`)
   - Via direct IP: Ensure port 7777 (or your configured port) is accessible

3. **Configure the remote host** in your local `~/.vibora/settings.json`:
   ```json
   {
     "remoteVibora": {
       "host": "my-server.tailnet.ts.net"
     }
   }
   ```

4. **Launch the desktop app** and choose "Connect to Remote" when prompted

## Development

### Connection Logic

The desktop app (`resources/js/main.js`) implements:

1. **Settings persistence**: Saves/loads connection settings from `~/.vibora/settings.json`
2. **Server choice**: If `remoteHost` is configured, prompts user to choose local or remote
3. **Health checks**: Waits for chosen server to be ready before connecting
4. **Error handling**: Shows user-friendly errors with retry options

### Lifecycle

1. Launcher script starts the bundled Vibora server
2. Neutralino starts and initializes
3. If `remoteHost` is configured, prompt user to choose server
4. Wait for chosen server to be ready (with retries)
5. Load Vibora in an iframe
6. Settings are persisted for next launch

## Known Limitations

1. **iframe restrictions**: Some browser features may be limited in the iframe context
2. **CORS**: Remote servers must be accessible from the desktop app's origin
3. **Code signing**: macOS requires code signing and notarization for distribution outside the App Store

## Troubleshooting

### Cannot connect to remote server

- Verify the server is running: `curl http://hostname:port/health`
- Check Tailscale connection: `tailscale status`
- Ensure no firewall is blocking the port

### WebView issues on Linux

Ensure GTK WebKit2 is installed:
```bash
# Debian/Ubuntu
sudo apt install libwebkit2gtk-4.0-dev

# Fedora
sudo dnf install webkit2gtk3-devel
```

### Settings not saving

Check that `~/.vibora/` directory exists and is writable:
```bash
mkdir -p ~/.vibora
chmod 755 ~/.vibora
```
