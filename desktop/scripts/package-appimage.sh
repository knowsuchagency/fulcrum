#!/bin/bash
# Package Vibora desktop app as AppImage for Linux
# Usage: ./package-appimage.sh [arch]
# arch: x64 (default) or arm64

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DESKTOP_DIR="$(dirname "$SCRIPT_DIR")"
PROJECT_ROOT="$(dirname "$DESKTOP_DIR")"

ARCH="${1:-x64}"
VERSION=$(jq -r '.version' "$PROJECT_ROOT/package.json")
APP_NAME="Vibora"

echo "Packaging Vibora ${VERSION} AppImage for ${ARCH}..."

# Check for server bundle
BUNDLE_DIR="$DESKTOP_DIR/bundle"
if [ ! -d "$BUNDLE_DIR/server" ]; then
  echo "Error: Server bundle not found at $BUNDLE_DIR"
  echo "Run 'mise run desktop:bundle' first"
  exit 1
fi

# Create AppDir structure
APP_DIR="$DESKTOP_DIR/dist/Vibora-${VERSION}-${ARCH}.AppDir"
rm -rf "$APP_DIR"
mkdir -p "$APP_DIR/usr/bin"
mkdir -p "$APP_DIR/usr/share/vibora/bundle"
mkdir -p "$APP_DIR/usr/share/applications"
mkdir -p "$APP_DIR/usr/share/icons/hicolor/256x256/apps"

# Copy Neutralino binary
if [ "$ARCH" = "arm64" ]; then
  NL_BINARY="$DESKTOP_DIR/dist/vibora-desktop/vibora-desktop-linux_arm64"
else
  NL_BINARY="$DESKTOP_DIR/dist/vibora-desktop/vibora-desktop-linux_x64"
fi

if [ ! -f "$NL_BINARY" ]; then
  echo "Error: Neutralino binary not found at $NL_BINARY"
  echo "Run 'mise run desktop:build' first"
  exit 1
fi

cp "$NL_BINARY" "$APP_DIR/usr/bin/vibora-desktop"
chmod +x "$APP_DIR/usr/bin/vibora-desktop"

# Copy resources.neu (must be next to binary)
cp "$DESKTOP_DIR/dist/vibora-desktop/resources.neu" "$APP_DIR/usr/bin/"

# Copy server bundle
echo "Copying server bundle..."
cp -r "$BUNDLE_DIR" "$APP_DIR/usr/share/vibora/bundle"

# Copy launcher script
echo "Installing launcher script..."
cp "$SCRIPT_DIR/vibora-launcher-linux.sh" "$APP_DIR/usr/bin/vibora-launcher"
chmod +x "$APP_DIR/usr/bin/vibora-launcher"

# Create AppRun script (calls launcher instead of direct binary)
cat > "$APP_DIR/AppRun" << 'APPRUN'
#!/bin/bash
SELF=$(readlink -f "$0")
HERE=${SELF%/*}
export PATH="${HERE}/usr/bin:${PATH}"
cd "${HERE}/usr/bin"
exec "${HERE}/usr/bin/vibora-launcher" "$@"
APPRUN
chmod +x "$APP_DIR/AppRun"

# Create desktop entry
cat > "$APP_DIR/usr/share/applications/vibora.desktop" << EOF
[Desktop Entry]
Type=Application
Name=Vibora
Comment=The Vibe Engineer's Cockpit
Exec=vibora-launcher
Icon=vibora
Categories=Development;IDE;
Terminal=false
StartupWMClass=vibora
EOF

cp "$APP_DIR/usr/share/applications/vibora.desktop" "$APP_DIR/"

# Copy icon
if [ -f "$DESKTOP_DIR/resources/icons/icon.png" ]; then
  cp "$DESKTOP_DIR/resources/icons/icon.png" "$APP_DIR/usr/share/icons/hicolor/256x256/apps/vibora.png"
  cp "$DESKTOP_DIR/resources/icons/icon.png" "$APP_DIR/vibora.png"
fi

# Download appimagetool if not present
APPIMAGETOOL="$DESKTOP_DIR/scripts/appimagetool"
if [ ! -f "$APPIMAGETOOL" ]; then
  echo "Downloading appimagetool..."
  if [ "$ARCH" = "arm64" ]; then
    curl -Lo "$APPIMAGETOOL" "https://github.com/AppImage/AppImageKit/releases/download/continuous/appimagetool-aarch64.AppImage"
  else
    curl -Lo "$APPIMAGETOOL" "https://github.com/AppImage/AppImageKit/releases/download/continuous/appimagetool-x86_64.AppImage"
  fi
  chmod +x "$APPIMAGETOOL"
fi

# Create AppImage
OUTPUT="$DESKTOP_DIR/dist/Vibora-${VERSION}-linux-${ARCH}.AppImage"
echo "Creating AppImage..."

if [ "$ARCH" = "arm64" ]; then
  ARCH_FLAG="aarch64"
else
  ARCH_FLAG="x86_64"
fi

ARCH="$ARCH_FLAG" "$APPIMAGETOOL" --appimage-extract-and-run -n "$APP_DIR" "$OUTPUT" || {
  # Fallback: use FUSE-less extraction
  ARCH="$ARCH_FLAG" "$APPIMAGETOOL" -n "$APP_DIR" "$OUTPUT"
}

echo ""
echo "AppImage created: $OUTPUT"
echo "Size: $(du -h "$OUTPUT" | cut -f1)"
echo ""
echo "The app will start its own Vibora server and install the Claude plugin."
