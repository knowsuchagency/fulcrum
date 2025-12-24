#!/bin/bash
# Package Vibora desktop app as DMG for macOS
# Usage: ./package-dmg.sh [arch]
# arch: x64 or arm64 (default: current architecture)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DESKTOP_DIR="$(dirname "$SCRIPT_DIR")"
PROJECT_ROOT="$(dirname "$DESKTOP_DIR")"

# Detect architecture if not specified
if [ -z "$1" ]; then
  if [ "$(uname -m)" = "arm64" ]; then
    ARCH="arm64"
  else
    ARCH="x64"
  fi
else
  ARCH="$1"
fi

VERSION=$(jq -r '.version' "$PROJECT_ROOT/package.json")
APP_NAME="Vibora"
BUNDLE_ID="io.vibora.desktop"

echo "Packaging Vibora ${VERSION} DMG for macOS ${ARCH}..."

# Create .app bundle structure
APP_BUNDLE="$DESKTOP_DIR/dist/Vibora.app"
rm -rf "$APP_BUNDLE"
mkdir -p "$APP_BUNDLE/Contents/MacOS"
mkdir -p "$APP_BUNDLE/Contents/Resources"

# Copy Neutralino binary
if [ "$ARCH" = "arm64" ]; then
  NL_BINARY="$DESKTOP_DIR/dist/vibora-desktop/vibora-desktop-mac_arm64"
else
  NL_BINARY="$DESKTOP_DIR/dist/vibora-desktop/vibora-desktop-mac_x64"
fi

if [ ! -f "$NL_BINARY" ]; then
  echo "Error: Neutralino binary not found at $NL_BINARY"
  echo "Run 'mise run desktop:build' first"
  exit 1
fi

cp "$NL_BINARY" "$APP_BUNDLE/Contents/MacOS/Vibora"
chmod +x "$APP_BUNDLE/Contents/MacOS/Vibora"

# Copy resources.neu bundle (must be next to binary, not in Resources)
cp "$DESKTOP_DIR/dist/vibora-desktop/resources.neu" "$APP_BUNDLE/Contents/MacOS/"

# Create Info.plist
cat > "$APP_BUNDLE/Contents/Info.plist" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>vibora-launcher</string>
    <key>CFBundleIconFile</key>
    <string>icon.icns</string>
    <key>CFBundleIdentifier</key>
    <string>${BUNDLE_ID}</string>
    <key>CFBundleName</key>
    <string>${APP_NAME}</string>
    <key>CFBundleDisplayName</key>
    <string>${APP_NAME}</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>${VERSION}</string>
    <key>CFBundleVersion</key>
    <string>${VERSION}</string>
    <key>LSMinimumSystemVersion</key>
    <string>10.15</string>
    <key>NSHighResolutionCapable</key>
    <true/>
    <key>NSRequiresAquaSystemAppearance</key>
    <false/>
    <key>LSApplicationCategoryType</key>
    <string>public.app-category.developer-tools</string>
</dict>
</plist>
EOF

# Copy pre-generated ICNS or convert PNG
ICON_ICNS_SRC="$DESKTOP_DIR/resources/icons/icon.icns"
ICON_PNG="$DESKTOP_DIR/resources/icons/icon.png"
ICON_ICNS="$APP_BUNDLE/Contents/Resources/icon.icns"

if [ -f "$ICON_ICNS_SRC" ]; then
  echo "Using pre-generated ICNS icon..."
  cp "$ICON_ICNS_SRC" "$ICON_ICNS"
elif [ -f "$ICON_PNG" ]; then
  if command -v iconutil &> /dev/null && command -v sips &> /dev/null; then
    echo "Converting icon to ICNS format..."
    ICONSET="$DESKTOP_DIR/dist/icon.iconset"
    mkdir -p "$ICONSET"

    # Generate various sizes
    sips -z 16 16     "$ICON_PNG" --out "$ICONSET/icon_16x16.png" 2>/dev/null || true
    sips -z 32 32     "$ICON_PNG" --out "$ICONSET/icon_16x16@2x.png" 2>/dev/null || true
    sips -z 32 32     "$ICON_PNG" --out "$ICONSET/icon_32x32.png" 2>/dev/null || true
    sips -z 64 64     "$ICON_PNG" --out "$ICONSET/icon_32x32@2x.png" 2>/dev/null || true
    sips -z 128 128   "$ICON_PNG" --out "$ICONSET/icon_128x128.png" 2>/dev/null || true
    sips -z 256 256   "$ICON_PNG" --out "$ICONSET/icon_128x128@2x.png" 2>/dev/null || true
    sips -z 256 256   "$ICON_PNG" --out "$ICONSET/icon_256x256.png" 2>/dev/null || true
    sips -z 512 512   "$ICON_PNG" --out "$ICONSET/icon_256x256@2x.png" 2>/dev/null || true
    sips -z 512 512   "$ICON_PNG" --out "$ICONSET/icon_512x512.png" 2>/dev/null || true
    sips -z 1024 1024 "$ICON_PNG" --out "$ICONSET/icon_512x512@2x.png" 2>/dev/null || true

    iconutil -c icns "$ICONSET" -o "$ICON_ICNS" 2>/dev/null || {
      echo "Warning: Could not create ICNS, using PNG fallback"
      cp "$ICON_PNG" "$APP_BUNDLE/Contents/Resources/icon.png"
    }

    rm -rf "$ICONSET"
  else
    echo "Warning: iconutil/sips not available, using PNG icon"
    cp "$ICON_PNG" "$APP_BUNDLE/Contents/Resources/icon.png"
  fi
fi

# Create launcher script that sets up environment
cat > "$APP_BUNDLE/Contents/MacOS/vibora-launcher" << 'LAUNCHER'
#!/bin/bash
DIR="$(cd "$(dirname "$0")" && pwd)"

# Launch from MacOS dir where resources.neu is located
cd "$DIR"
exec "$DIR/Vibora" "$@"
LAUNCHER
chmod +x "$APP_BUNDLE/Contents/MacOS/vibora-launcher"

# Create DMG
DMG_NAME="Vibora-${VERSION}-macos-${ARCH}.dmg"
DMG_PATH="$DESKTOP_DIR/dist/$DMG_NAME"

echo "Creating DMG..."

# Check if create-dmg is available
if command -v create-dmg &> /dev/null; then
  create-dmg \
    --volname "Vibora ${VERSION}" \
    --volicon "$ICON_ICNS" \
    --window-pos 200 120 \
    --window-size 600 400 \
    --icon-size 100 \
    --icon "Vibora.app" 150 185 \
    --hide-extension "Vibora.app" \
    --app-drop-link 450 185 \
    "$DMG_PATH" \
    "$APP_BUNDLE" || {
      # Fallback to hdiutil
      echo "create-dmg failed, using hdiutil..."
      hdiutil create -volname "Vibora ${VERSION}" -srcfolder "$APP_BUNDLE" -ov -format UDZO "$DMG_PATH"
    }
else
  # Use hdiutil directly
  echo "Using hdiutil (install create-dmg for better DMGs)..."
  hdiutil create -volname "Vibora ${VERSION}" -srcfolder "$APP_BUNDLE" -ov -format UDZO "$DMG_PATH"
fi

echo ""
echo "DMG created: $DMG_PATH"
echo "Size: $(du -h "$DMG_PATH" | cut -f1)"
echo ""
echo "Note: For distribution, you should code sign and notarize the app:"
echo "  codesign --deep --force --sign 'Developer ID Application: ...' '$APP_BUNDLE'"
echo "  xcrun notarytool submit '$DMG_PATH' --apple-id ... --team-id ... --password ..."
