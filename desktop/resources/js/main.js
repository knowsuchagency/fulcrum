/**
 * Vibora Desktop - Neutralinojs Frontend
 *
 * This script handles:
 * 1. Initializing Neutralino
 * 2. Starting/connecting to the local bundled server (default)
 * 3. Optionally connecting to a remote server if remoteHost is configured
 * 4. Graceful shutdown on window close
 */

// Configuration
const DEFAULT_PORT = 7777;
const CURRENT_SCHEMA_VERSION = 3;
const HEALTH_CHECK_TIMEOUT = 3000; // 3 seconds per check
const MAX_HEALTH_RETRIES = 10;
const DEV_PORT = 5173;
const UPDATE_CHECK_URL = 'https://github.com/knowsuchagency/vibora/releases/latest/download/manifest.json';
const UPDATE_CHECK_INTERVAL = 24 * 60 * 60 * 1000; // Check daily (24 hours)

// State
let serverUrl = null;
let serverPid = null;
let isShuttingDown = false;
let desktopSettings = null;
let currentZoom = 1.2;
let currentRoute = { pathname: '/', search: '' }; // Track current SPA route from iframe
let isDevMode = false;
let logFilePath = null;
let loadingStartTime = null;
const MIN_LOADING_DURATION = 3000; // Show loading screen for at least 3 seconds

// =============================================================================
// Centralized JSONL Logger (writes to ~/.vibora/desktop.log)
// =============================================================================

/**
 * Initialize the log file path
 */
async function initLogger() {
  const home = NL_OS === 'Windows'
    ? await Neutralino.os.getEnv('USERPROFILE')
    : await Neutralino.os.getEnv('HOME');
  logFilePath = `${home}/.vibora/desktop.log`;
}

/**
 * Desktop logger - writes JSONL to desktop.log
 */
const log = {
  _write: async function(level, msg, ctx) {
    const entry = {
      ts: new Date().toISOString(),
      lvl: level,
      src: 'Desktop/UI',
      msg,
      ...(ctx && Object.keys(ctx).length > 0 ? { ctx } : {}),
    };

    // Always log to console
    const consoleMethod = level === 'debug' ? 'log' : level;
    console[consoleMethod](`[Desktop/UI]`, msg, ctx ?? '');

    // Write to log file if path is initialized
    if (logFilePath) {
      try {
        await Neutralino.filesystem.appendFile(logFilePath, JSON.stringify(entry) + '\n');
      } catch (err) {
        // Silently fail if we can't write to log file
        console.error('Failed to write to log file:', err);
      }
    }
  },

  debug: function(msg, ctx) { this._write('debug', msg, ctx); },
  info: function(msg, ctx) { this._write('info', msg, ctx); },
  warn: function(msg, ctx) { this._write('warn', msg, ctx); },
  error: function(msg, ctx) { this._write('error', msg, ctx); },
};

/**
 * Get the path to settings file
 */
async function getSettingsPath() {
  // Get home directory from environment
  const home = NL_OS === 'Windows'
    ? await Neutralino.os.getEnv('USERPROFILE')
    : await Neutralino.os.getEnv('HOME');
  return `${home}/.vibora/settings.json`;
}

/**
 * Get a nested value from settings (supports both new and legacy formats)
 */
function getSettingValue(key) {
  if (!desktopSettings) return undefined;

  // Try nested path first (e.g., 'server.port')
  const parts = key.split('.');
  if (parts.length === 2) {
    const [group, prop] = parts;
    if (desktopSettings[group] && desktopSettings[group][prop] !== undefined) {
      return desktopSettings[group][prop];
    }
  }

  // Fall back to flat key (legacy)
  return desktopSettings[key];
}

/**
 * Migrate settings from flat to nested format
 */
function migrateSettings(settings) {
  const version = settings._schemaVersion || 1;
  if (version >= CURRENT_SCHEMA_VERSION) {
    return settings; // Already migrated
  }

  console.log('[Vibora] Migrating settings from version', version, 'to', CURRENT_SCHEMA_VERSION);

  const migrated = {
    _schemaVersion: CURRENT_SCHEMA_VERSION,
    server: { port: DEFAULT_PORT },
    editor: { app: 'vscode', host: '', sshPort: 22 },
  };

  // Copy existing nested groups if present
  for (const key of ['server', 'paths', 'editor', 'integrations', 'appearance', 'notifications', 'zai', 'desktop']) {
    if (settings[key] && typeof settings[key] === 'object') {
      migrated[key] = { ...migrated[key], ...settings[key] };
    }
  }

  // Schema 1 → 2: Migrate flat keys to nested structure
  if (version < 2) {
    const migrationMap = {
      port: ['server', 'port'],
      defaultGitReposDir: ['paths', 'defaultGitReposDir'],
      sshPort: ['editor', 'sshPort'],
      linearApiKey: ['integrations', 'linearApiKey'],
      githubPat: ['integrations', 'githubPat'],
      language: ['appearance', 'language'],
    };

    for (const [flatKey, [group, prop]] of Object.entries(migrationMap)) {
      if (settings[flatKey] !== undefined && settings[flatKey] !== null) {
        // Don't migrate old default port (3333) - let user get new default
        if (flatKey === 'port' && settings[flatKey] === 3333) {
          continue;
        }
        if (!migrated[group]) migrated[group] = {};
        if (migrated[group][prop] === undefined || migrated[group][prop] === null || migrated[group][prop] === '') {
          migrated[group][prop] = settings[flatKey];
        }
      }
    }

  }

  // Preserve non-migrated keys (like lastUpdateCheck, lastConnectedHost)
  for (const key of ['lastUpdateCheck', 'lastConnectedHost']) {
    if (settings[key] !== undefined) {
      migrated[key] = settings[key];
    }
  }

  console.log('[Vibora] Settings migrated:', migrated);
  return migrated;
}

/**
 * Load settings from file
 */
async function loadSettings() {
  try {
    const settingsPath = await getSettingsPath();
    const content = await Neutralino.filesystem.readFile(settingsPath);
    let settings = JSON.parse(content);
    log.debug('Loaded settings', settings);

    // Migrate if needed
    if (!settings._schemaVersion || settings._schemaVersion < CURRENT_SCHEMA_VERSION) {
      settings = migrateSettings(settings);
      // Save migrated settings
      await Neutralino.filesystem.writeFile(settingsPath, JSON.stringify(settings, null, 2));
      log.info('Saved migrated settings');
    }

    desktopSettings = settings;

    // Restore zoom level if previously saved
    if (settings.desktop?.zoomLevel) {
      currentZoom = settings.desktop.zoomLevel;
      // Update the zoom display
      const zoomLevelEl = document.getElementById('zoom-level');
      if (zoomLevelEl) {
        zoomLevelEl.textContent = Math.round(currentZoom * 100) + '%';
      }
      log.debug('Restored zoom level', { zoomLevel: currentZoom });
    }

    return desktopSettings;
  } catch (err) {
    // File doesn't exist or is invalid, use defaults
    log.info('No existing settings, using defaults');
    desktopSettings = {};
    return desktopSettings;
  }
}

/**
 * Save settings to file (always in nested format)
 */
async function saveSettings(settings) {
  try {
    const settingsPath = await getSettingsPath();

    // Ensure .vibora directory exists
    const viboraDir = settingsPath.substring(0, settingsPath.lastIndexOf('/'));
    try {
      await Neutralino.filesystem.createDirectory(viboraDir);
    } catch {
      // Directory might already exist
    }

    // Ensure schema version is set
    settings._schemaVersion = CURRENT_SCHEMA_VERSION;

    await Neutralino.filesystem.writeFile(settingsPath, JSON.stringify(settings, null, 2));
    desktopSettings = settings;
    log.debug('Settings saved', settings);
  } catch (err) {
    log.error('Failed to save settings', { error: String(err) });
  }
}

/**
 * Update the status display
 */
function setStatus(text, detail = '') {
  const statusEl = document.getElementById('status-text');
  const detailEl = document.getElementById('status-detail');
  if (statusEl) statusEl.textContent = text;
  if (detailEl) detailEl.textContent = detail;
}

/**
 * Show error state
 */
function showError(title, message) {
  const app = document.getElementById('app');
  app.innerHTML = `
    <img src="/icons/icon.png" alt="Vibora" class="logo" style="animation: none; opacity: 0.5;">
    <div class="error">
      <div class="error-title">${title}</div>
      <div>${message}</div>
    </div>
    <button class="retry-btn" onclick="location.reload()">Retry</button>
  `;
}

/**
 * Check if a server is healthy
 * Uses native HTTP request via curl to bypass WebView CORS restrictions
 */
async function checkServerHealth(baseUrl) {
  try {
    // Use curl for health check to bypass WebView CORS restrictions
    // -s: silent, -o /dev/null: discard output, -w "%{http_code}": print status code
    // --max-time: timeout in seconds
    const timeoutSec = Math.ceil(HEALTH_CHECK_TIMEOUT / 1000);
    const result = await Neutralino.os.execCommand(
      `curl -s -o /dev/null -w "%{http_code}" --max-time ${timeoutSec} "${baseUrl}/health"`
    );
    const statusCode = parseInt(result.stdOut.trim(), 10);
    return statusCode >= 200 && statusCode < 300;
  } catch (err) {
    log.debug('Health check failed', { baseUrl, error: String(err) });
    return false;
  }
}

/**
 * Wait for server to be ready with retries
 */
async function waitForServerReady(baseUrl) {
  log.info('Waiting for server to be ready', { baseUrl, maxRetries: MAX_HEALTH_RETRIES });
  for (let i = 0; i < MAX_HEALTH_RETRIES; i++) {
    setStatus('Connecting to server...', `Attempt ${i + 1}/${MAX_HEALTH_RETRIES}`);
    log.debug('Health check attempt', { attempt: i + 1, maxRetries: MAX_HEALTH_RETRIES, baseUrl });
    if (await checkServerHealth(baseUrl)) {
      log.info('Server is ready', { baseUrl, attempts: i + 1 });
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  log.warn('Server did not become ready after retries', { baseUrl, attempts: MAX_HEALTH_RETRIES });
  return false;
}

/**
 * Set zoom level - reloads iframe with zoom query parameter
 * The Vibora frontend applies this as root font-size for native scaling
 */
function setZoom(level, skipSave = false) {
  currentZoom = Math.max(0.5, Math.min(2.0, level)); // Clamp between 50% and 200%

  // Update zoom level display
  const zoomLevel = document.getElementById('zoom-level');
  if (zoomLevel) {
    zoomLevel.textContent = Math.round(currentZoom * 100) + '%';
  }
  console.log('[Vibora] Zoom:', Math.round(currentZoom * 100) + '%');

  // Persist zoom level to settings
  if (!skipSave && desktopSettings) {
    saveSettings({
      ...desktopSettings,
      desktop: { ...desktopSettings.desktop, zoomLevel: currentZoom }
    });
  }

  // Reload iframe with new zoom parameter, preserving current SPA route
  // Route is tracked via postMessage from the Vibora frontend
  const frame = document.getElementById('vibora-frame');
  if (frame && serverUrl) {
    const url = new URL(serverUrl);
    url.pathname = currentRoute.pathname;
    if (currentZoom !== 1.0) {
      url.searchParams.set('zoom', currentZoom.toString());
    }
    // Preserve any other search params from the route (but not zoom - we set that)
    const routeParams = new URLSearchParams(currentRoute.search);
    routeParams.delete('zoom'); // Don't double-add zoom
    for (const [key, value] of routeParams) {
      url.searchParams.set(key, value);
    }
    frame.src = url.toString();
  }
}

// Global zoom functions for button onclick handlers
window.zoomIn = () => setZoom(currentZoom + 0.1);
window.zoomOut = () => setZoom(currentZoom - 0.1);
window.zoomReset = () => setZoom(1.2);

/**
 * Navigate to a path in the Vibora app
 * Updates the iframe URL, preserving zoom level
 */
function navigateTo(path) {
  const frame = document.getElementById('vibora-frame');
  if (frame && serverUrl) {
    const url = new URL(serverUrl);
    // Parse path and query
    const [pathname, search] = path.split('?');
    url.pathname = pathname;
    // Preserve zoom
    if (currentZoom !== 1.0) {
      url.searchParams.set('zoom', currentZoom.toString());
    }
    // Add any query params from the path
    if (search) {
      const params = new URLSearchParams(search);
      for (const [key, value] of params) {
        url.searchParams.set(key, value);
      }
    }
    frame.src = url.toString();
    // Update route tracking
    currentRoute = { pathname, search: search ? `?${search}` : '' };
    log.debug('Navigated to', { path, url: url.toString() });
  }
}

/**
 * Send a message to the Vibora app via postMessage
 * Used for triggering UI actions like opening modals
 */
function postMessageToApp(type, data = {}) {
  const frame = document.getElementById('vibora-frame');
  if (frame?.contentWindow) {
    frame.contentWindow.postMessage({ type, ...data }, '*');
    log.debug('Posted message to app', { type, data });
  }
}

/**
 * Load the Vibora app in an iframe
 */
async function loadViboraApp(url) {
  setStatus('Loading Vibora...', url);
  serverUrl = url;

  log.info('Loading app', { url });

  const frame = document.getElementById('vibora-frame');
  const zoomParam = currentZoom !== 1.0 ? `?zoom=${currentZoom}` : '';
  frame.src = url + zoomParam;

  // Set a timeout to detect if iframe fails to load
  const loadTimeout = setTimeout(() => {
    log.error('Iframe load timeout', { url });
    showError('Connection Failed', `Could not load Vibora from ${url}.`);
  }, 10000); // 10 second timeout

  frame.onload = async () => {
    clearTimeout(loadTimeout);

    // Ensure minimum loading screen duration
    const elapsed = Date.now() - loadingStartTime;
    const remaining = MIN_LOADING_DURATION - elapsed;
    if (remaining > 0) {
      log.debug('Waiting for minimum loading duration', { remaining });
      await new Promise(resolve => setTimeout(resolve, remaining));
    }

    document.body.classList.add('loaded');
    log.info('App loaded successfully', { url });
  };

  frame.onerror = (err) => {
    clearTimeout(loadTimeout);
    log.error('Failed to load app (onerror)', { url, error: String(err) });
    showError('Load Failed', 'Could not load Vibora interface.');
  };
}

/**
 * Get local server port from settings (nested format)
 */
function getLocalPort() {
  if (isDevMode) return DEV_PORT;
  return desktopSettings?.server?.port || DEFAULT_PORT;
}

/**
 * Get path to the bundle directory (contains server, lib, etc.)
 */
async function getBundlePath() {
  if (NL_OS === 'Darwin') {
    // macOS: .../Vibora.app/Contents/MacOS -> .../Vibora.app/Contents/Resources/bundle
    return `${NL_PATH}/../Resources/bundle`;
  } else {
    // Linux: .../usr/bin -> .../usr/share/vibora/bundle
    return `${NL_PATH}/../share/vibora/bundle`;
  }
}

/**
 * Get the Vibora data directory
 */
async function getViboraDir() {
  const home = NL_OS === 'Windows'
    ? await Neutralino.os.getEnv('USERPROFILE')
    : await Neutralino.os.getEnv('HOME');
  return `${home}/.vibora`;
}

/**
 * Start the local server if not already running
 * Called when launcher didn't start it (first launch or remote mode switch)
 */
async function startLocalServer() {
  const port = getLocalPort();
  const localUrl = `http://localhost:${port}`;

  // Check if server is already running
  if (await checkServerHealth(localUrl)) {
    log.info('Server already running (startLocalServer)');
    return true;
  }

  setStatus('Starting local server...', `Port ${port}`);
  log.info('Starting local server', { port });

  try {
    const bundleDir = await getBundlePath();
    const viboraDir = await getViboraDir();

    // Determine PTY library based on OS and architecture
    const arch = typeof NL_ARCH !== 'undefined' ? NL_ARCH : 'x64';
    let ptyLib;
    if (NL_OS === 'Darwin') {
      ptyLib = arch === 'arm64'
        ? `${bundleDir}/lib/librust_pty_arm64.dylib`
        : `${bundleDir}/lib/librust_pty.dylib`;
    } else {
      // Linux
      ptyLib = arch === 'arm64' || arch === 'aarch64'
        ? `${bundleDir}/lib/librust_pty_arm64.so`
        : `${bundleDir}/lib/librust_pty.so`;
    }

    const serverBin = `${bundleDir}/server/vibora-server`;

    // Build command with environment variables
    const cmd = `NODE_ENV=production PORT=${port} VIBORA_DIR="${viboraDir}" ` +
      `VIBORA_PACKAGE_ROOT="${bundleDir}" BUN_PTY_LIB="${ptyLib}" ` +
      `"${serverBin}"`;

    log.debug('Server command', { cmd });

    // Start server process in background
    const result = await Neutralino.os.spawnProcess(cmd);
    serverPid = result?.pid ?? null;
    log.info('Server process spawned', { pid: serverPid });

    // Wait for server to be ready
    if (await waitForServerReady(localUrl)) {
      log.info('Server is ready');
      return true;
    }

    log.error('Server failed to become ready');
    return false;
  } catch (err) {
    log.error('Failed to start server', { error: String(err) });
    return false;
  }
}

/**
 * Connect to local server
 * Will start the server if it's not already running (e.g., first launch or switching from remote)
 */
async function connectToLocal() {
  const localPort = getLocalPort();
  const localUrl = `http://localhost:${localPort}`;

  setStatus('Connecting to local server...', `localhost:${localPort}${isDevMode ? ' (dev)' : ''}`);
  log.info('Connecting to local server', { port: localPort, isDevMode });

  // Check if server is already running (launcher may have started it)
  if (await checkServerHealth(localUrl)) {
    log.info('Server already running');
    await saveSettings({
      ...desktopSettings,
      lastConnectedHost: 'localhost'
    });
    loadViboraApp(localUrl);
    return true;
  }

  // Server not running - start it
  log.info('Server not running, starting...');
  if (await startLocalServer()) {
    await saveSettings({
      ...desktopSettings,
      lastConnectedHost: 'localhost'
    });
    loadViboraApp(localUrl);
    return true;
  }

  log.error('Could not start local server');
  showError('Server Failed', 'Could not start local server. Check ~/.vibora/desktop.log for details.');
  return false;
}

/**
 * Main connection logic
 *
 * Simple flow:
 * 1. Try localhost:7777 (or configured port)
 * 2. If server responds, use it (local or SSH tunnel)
 * 3. If not, start bundled server
 */
async function tryConnect() {
  log.info('tryConnect() called');
  await loadSettings();
  await connectToLocal();
}

/**
 * Handle extension ready event (when running with local server extension)
 */
function handleExtensionReady(port) {
  console.log(`[Vibora] Local server extension ready on port ${port}`);

  // Save port for future reference (nested format)
  saveSettings({
    ...desktopSettings,
    server: { ...desktopSettings?.server, port: port },
    lastConnectedHost: 'localhost'
  });

  loadViboraApp(`http://localhost:${port}`);
}

/**
 * Graceful shutdown
 */
async function shutdown() {
  if (isShuttingDown) return;
  isShuttingDown = true;

  log.info('Initiating shutdown...');

  // Kill the server process if we spawned it
  if (serverPid) {
    try {
      log.info('Killing server process', { pid: serverPid });
      await Neutralino.os.execCommand(`kill ${serverPid}`);
      // Give it a moment to terminate gracefully
      await new Promise(resolve => setTimeout(resolve, 500));
      // Force kill if still running
      try {
        await Neutralino.os.execCommand(`kill -9 ${serverPid}`);
      } catch {
        // Process already terminated
      }
    } catch (err) {
      log.error('Failed to kill server process', { pid: serverPid, error: String(err) });
    }
  }

  Neutralino.app.exit();
}

// =============================================================================
// Update Checking
// =============================================================================

/**
 * Get platform identifier for update manifest
 */
function getPlatformId() {
  const os = NL_OS.toLowerCase();
  // NL_ARCH is 'x64' or 'arm64' on supported platforms
  const arch = typeof NL_ARCH !== 'undefined' ? NL_ARCH : 'x64';

  if (os === 'darwin') {
    return `darwin-${arch}`;
  } else if (os === 'linux') {
    return `linux-${arch}`;
  } else if (os === 'windows') {
    return `windows-${arch}`;
  }
  return null;
}

/**
 * Compare semantic versions
 * Returns: 1 if v1 > v2, -1 if v1 < v2, 0 if equal
 */
function compareVersions(v1, v2) {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);

  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;
    if (p1 > p2) return 1;
    if (p1 < p2) return -1;
  }
  return 0;
}

/**
 * Check for updates
 * @param {boolean} showNoUpdateMessage - Show message even if no update available
 */
async function checkForUpdates(showNoUpdateMessage = false) {
  try {
    console.log('[Vibora] Checking for updates...');

    // Fetch the manifest
    const response = await fetch(UPDATE_CHECK_URL);
    if (!response.ok) {
      console.log('[Vibora] Failed to fetch update manifest:', response.status);
      return null;
    }

    const manifest = await response.json();
    const currentVersion = NL_APPVERSION;
    const latestVersion = manifest.version;

    console.log(`[Vibora] Current: ${currentVersion}, Latest: ${latestVersion}`);

    if (compareVersions(latestVersion, currentVersion) > 0) {
      // New version available
      const platformId = getPlatformId();
      const downloadUrl = manifest.platforms?.[platformId]?.url;

      return {
        currentVersion,
        latestVersion,
        downloadUrl
      };
    } else if (showNoUpdateMessage) {
      await Neutralino.os.showMessageBox(
        'Up to Date',
        `You are running the latest version (${currentVersion}).`,
        'INFO',
        ['OK']
      );
    }

    return null;
  } catch (err) {
    console.error('[Vibora] Update check failed:', err);
    if (showNoUpdateMessage) {
      await Neutralino.os.showMessageBox(
        'Update Check Failed',
        'Could not check for updates. Please check your internet connection.',
        'WARNING',
        ['OK']
      );
    }
    return null;
  }
}

/**
 * Prompt user about available update
 */
async function promptForUpdate(updateInfo) {
  const message = `A new version of Vibora is available!\n\n` +
    `Current: ${updateInfo.currentVersion}\n` +
    `Latest: ${updateInfo.latestVersion}\n\n` +
    `Would you like to download the update?`;

  try {
    const result = await Neutralino.os.showMessageBox(
      'Update Available',
      message,
      'QUESTION',
      ['Download', 'Later']
    );

    if (result === 'Download' && updateInfo.downloadUrl) {
      // Open download URL in browser
      await Neutralino.os.open(updateInfo.downloadUrl);
    }
  } catch (err) {
    console.error('[Vibora] Failed to show update dialog:', err);
  }
}

/**
 * Auto-check for updates on startup (once per day)
 */
async function autoCheckForUpdates() {
  // Don't check in dev mode
  if (isDevMode) {
    console.log('[Vibora] Skipping update check in dev mode');
    return;
  }

  try {
    // Check if we should check (based on last check time)
    const settingsPath = await getSettingsPath();
    let settings = {};
    try {
      const content = await Neutralino.filesystem.readFile(settingsPath);
      settings = JSON.parse(content);
    } catch {
      // No settings file yet
    }

    const lastCheck = settings.lastUpdateCheck || 0;
    const now = Date.now();

    if (now - lastCheck < UPDATE_CHECK_INTERVAL) {
      console.log('[Vibora] Skipping update check (checked recently)');
      return;
    }

    // Save check time
    settings.lastUpdateCheck = now;
    await saveSettings(settings);

    // Check for updates
    const updateInfo = await checkForUpdates();
    if (updateInfo) {
      await promptForUpdate(updateInfo);
    }
  } catch (err) {
    console.error('[Vibora] Auto update check failed:', err);
  }
}

// Expose for manual check from UI
window.checkForUpdates = () => checkForUpdates(true);

/**
 * Play a notification sound locally
 * Uses native system commands for each platform
 */
async function playNotificationSound() {
  try {
    if (NL_OS === 'Darwin') {
      // macOS: use afplay with system sound
      await Neutralino.os.execCommand('afplay /System/Library/Sounds/Glass.aiff');
    } else if (NL_OS === 'Linux') {
      // Linux: try various audio players in order of preference
      try {
        // Try PulseAudio first (most common)
        await Neutralino.os.execCommand('paplay /usr/share/sounds/freedesktop/stereo/complete.oga 2>/dev/null');
      } catch {
        try {
          // Try ALSA
          await Neutralino.os.execCommand('aplay /usr/share/sounds/sound-icons/xylofon.wav 2>/dev/null');
        } catch {
          // Fall back to beep if available
          await Neutralino.os.execCommand('echo -e "\\a" 2>/dev/null');
        }
      }
    } else if (NL_OS === 'Windows') {
      // Windows: use PowerShell to play system sound
      await Neutralino.os.execCommand('powershell -c "[System.Media.SystemSounds]::Exclamation.Play()"');
    }
    console.log('[Vibora] Notification sound played');
  } catch (err) {
    // Sound is non-critical, just log the error
    console.error('[Vibora] Failed to play notification sound:', err);
  }
}

/**
 * Initialize the application
 */
async function init() {
  // Record start time for minimum loading duration
  loadingStartTime = Date.now();

  try {
    // Initialize Neutralino
    Neutralino.init();

    // Initialize logger (needs Neutralino to be ready)
    await initLogger();
    log.info('Neutralino initialized', { os: NL_OS, version: NL_APPVERSION });

    // Set up native menu for macOS (required for Cmd+C/V/X/A shortcuts to work)
    if (NL_OS === 'Darwin') {
      await Neutralino.window.setMainMenu([
        {
          id: 'app',
          text: 'Vibora',
          menuItems: [
            { id: 'about', text: 'About Vibora' },
            { text: '-' },
            { id: 'quit', text: 'Quit Vibora', shortcut: 'q', action: 'terminate:' }
          ]
        },
        {
          id: 'edit',
          text: 'Edit',
          menuItems: [
            { id: 'undo', text: 'Undo', shortcut: 'z', action: 'undo:' },
            { id: 'redo', text: 'Redo', shortcut: 'Z', action: 'redo:' },
            { text: '-' },
            { id: 'cut', text: 'Cut', shortcut: 'x', action: 'cut:' },
            { id: 'copy', text: 'Copy', shortcut: 'c', action: 'copy:' },
            { id: 'paste', text: 'Paste', shortcut: 'v', action: 'paste:' },
            { id: 'selectAll', text: 'Select All', shortcut: 'a', action: 'selectAll:' }
          ]
        },
        {
          id: 'view',
          text: 'View',
          menuItems: [
            { id: 'zoomIn', text: 'Zoom In', shortcut: '+' },
            { id: 'zoomOut', text: 'Zoom Out', shortcut: '-' },
            { id: 'zoomReset', text: 'Actual Size', shortcut: '0' }
          ]
        },
        {
          id: 'go',
          text: 'Go',
          menuItems: [
            { id: 'goTasks', text: 'Tasks', shortcut: '1' },
            { id: 'goTerminals', text: 'Terminals', shortcut: '2' },
            { id: 'goTaskTerminals', text: 'Task Terminals', shortcut: 'i' },
            { id: 'goRepositories', text: 'Repositories', shortcut: '3' },
            { id: 'goReview', text: 'Review', shortcut: '4' },
            { id: 'goMonitoring', text: 'Monitoring', shortcut: '5' },
            { text: '-' },
            { id: 'goSettings', text: 'Settings…', shortcut: ',' },
            { text: '-' },
            { id: 'commandPalette', text: 'Command Palette', shortcut: 'k' },
            { id: 'newTask', text: 'New Task', shortcut: 'j' },
            { id: 'showHelp', text: 'Keyboard Shortcuts', shortcut: '/' }
          ]
        }
      ]);

      // Handle custom menu actions (zoom, navigation, actions)
      Neutralino.events.on('mainMenuItemClicked', (evt) => {
        switch (evt.detail.id) {
          // Zoom
          case 'zoomIn': zoomIn(); break;
          case 'zoomOut': zoomOut(); break;
          case 'zoomReset': zoomReset(); break;
          // Navigation
          case 'goTasks': navigateTo('/tasks'); break;
          case 'goTerminals': navigateTo('/terminals'); break;
          case 'goTaskTerminals': navigateTo('/terminals?tab=all-tasks'); break;
          case 'goRepositories': navigateTo('/repositories'); break;
          case 'goReview': navigateTo('/review'); break;
          case 'goMonitoring': navigateTo('/monitoring'); break;
          case 'goSettings': navigateTo('/settings'); break;
          // Actions (via postMessage to React app)
          case 'commandPalette': postMessageToApp('vibora:action', { action: 'openCommandPalette' }); break;
          case 'newTask': postMessageToApp('vibora:action', { action: 'openNewTask' }); break;
          case 'showHelp': postMessageToApp('vibora:action', { action: 'showShortcuts' }); break;
        }
      });

      console.log('[Vibora] macOS menu configured');
    }

    // Check for --dev flag in command line args
    isDevMode = typeof NL_ARGS !== 'undefined' && NL_ARGS.includes('--dev');
    if (isDevMode) {
      console.log('[Vibora] Running in development mode (port 5173)');
    }

    // Set up event listeners
    Neutralino.events.on('windowClose', shutdown);

    // Listen for extension ready (local server)
    Neutralino.events.on('serverReady', (evt) => {
      handleExtensionReady(evt.detail.port);
    });

    Neutralino.events.on('extClientConnect', (evt) => {
      console.log('[Vibora] Extension connected:', evt.detail);
    });

    // Listen for messages from iframe (postMessage from Vibora frontend)
    window.addEventListener('message', (event) => {
      if (event.data?.type === 'vibora:route') {
        currentRoute = {
          pathname: event.data.pathname || '/',
          search: event.data.search || ''
        };
        console.log('[Vibora] Route updated:', currentRoute.pathname);
      } else if (event.data?.type === 'vibora:notification') {
        // Show native system notification
        const { title, message } = event.data;
        Neutralino.os.showNotification(title, message || '').catch((err) => {
          console.error('[Vibora] Failed to show notification:', err);
        });
      } else if (event.data?.type === 'vibora:playSound') {
        // Play notification sound locally
        playNotificationSound();
      } else if (event.data?.type === 'vibora:openUrl') {
        // Open URL with system handler (for vscode://, cursor://, etc.)
        const { url } = event.data;
        Neutralino.os.open(url).catch((err) => {
          console.error('[Vibora] Failed to open URL:', url, err);
        });
      }
    });

    // Start connection flow
    await tryConnect();

    // Check for updates after app is loaded (wait 5 seconds to not block startup)
    setTimeout(autoCheckForUpdates, 5000);

  } catch (err) {
    log.error('Initialization error', { error: String(err), stack: err?.stack });
    showError('Initialization Failed', err.message || 'Could not initialize the application.');
  }
}

// Start the application when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
