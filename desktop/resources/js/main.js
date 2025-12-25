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
const SERVER_EXTENSION_ID = 'io.vibora.server';
const DEFAULT_PORT = 7777;
const CURRENT_SCHEMA_VERSION = 3;
const HEALTH_CHECK_TIMEOUT = 3000; // 3 seconds per check
const MAX_HEALTH_RETRIES = 10;
const DEV_PORT = 5173;
const UPDATE_CHECK_URL = 'https://github.com/knowsuchagency/vibora/releases/latest/download/manifest.json';
const UPDATE_CHECK_INTERVAL = 24 * 60 * 60 * 1000; // Check daily (24 hours)

// State
let serverUrl = null;
let isShuttingDown = false;
let desktopSettings = null;
let currentZoom = 1.0;
let currentRoute = { pathname: '/', search: '' }; // Track current SPA route from iframe
let isDevMode = false;

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
 * Check if this is a first launch (no schema version = never used before)
 */
function isFirstLaunch() {
  return !desktopSettings || desktopSettings._schemaVersion === undefined;
}

/**
 * Helper: Construct URL from host and port
 */
function constructRemoteUrl(host, port) {
  if (!host) return '';
  const effectivePort = port || DEFAULT_PORT;
  // Omit port for standard HTTP/HTTPS ports
  const portSuffix = effectivePort === 80 || effectivePort === 443 ? '' : `:${effectivePort}`;
  return `http://${host}${portSuffix}`;
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
    remoteVibora: { url: '' },
    editor: { app: 'vscode', host: '', sshPort: 22 },
  };

  // Copy existing nested groups if present (except remoteVibora which needs special handling)
  for (const key of ['server', 'paths', 'authentication', 'editor', 'integrations', 'appearance', 'notifications', 'zai']) {
    if (settings[key] && typeof settings[key] === 'object') {
      migrated[key] = { ...migrated[key], ...settings[key] };
    }
  }

  // Schema 1 → 2: Migrate flat keys to nested structure
  if (version < 2) {
    const migrationMap = {
      port: ['server', 'port'],
      defaultGitReposDir: ['paths', 'defaultGitReposDir'],
      basicAuthUsername: ['authentication', 'username'],
      basicAuthPassword: ['authentication', 'password'],
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

    // Handle flat remoteHost/hostname → remoteVibora.url
    const flatHost = settings.remoteHost || settings.hostname || '';
    if (flatHost) {
      migrated.remoteVibora = { url: constructRemoteUrl(flatHost, DEFAULT_PORT) };
    }
  }

  // Schema 2 → 3: Migrate remoteVibora.host + remoteVibora.port → remoteVibora.url
  if (version < 3 && settings.remoteVibora) {
    if ('host' in settings.remoteVibora) {
      const host = settings.remoteVibora.host || '';
      const port = settings.remoteVibora.port || DEFAULT_PORT;
      migrated.remoteVibora = { url: constructRemoteUrl(host, port) };
    } else if ('url' in settings.remoteVibora) {
      // Already has url format
      migrated.remoteVibora = { url: settings.remoteVibora.url || '' };
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
    console.log('[Vibora] Loaded settings:', settings);

    // Migrate if needed
    if (!settings._schemaVersion || settings._schemaVersion < CURRENT_SCHEMA_VERSION) {
      settings = migrateSettings(settings);
      // Save migrated settings
      await Neutralino.filesystem.writeFile(settingsPath, JSON.stringify(settings, null, 2));
      console.log('[Vibora] Saved migrated settings');
    }

    desktopSettings = settings;
    return desktopSettings;
  } catch (err) {
    // File doesn't exist or is invalid, use defaults
    console.log('[Vibora] No existing settings, using defaults');
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
    console.log('[Vibora] Settings saved:', settings);
  } catch (err) {
    console.error('[Vibora] Failed to save settings:', err);
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
 * Prompt user for first-time onboarding choice
 * @returns {Promise<'local' | 'remote'>}
 */
function promptOnboardingChoice() {
  return new Promise((resolve) => {
    const app = document.getElementById('app');
    app.innerHTML = `
      <img src="/icons/icon.png" alt="Vibora" class="logo" style="animation: none;">
      <div class="prompt-container">
        <div class="prompt-title">Welcome to Vibora</div>
        <div class="prompt-description">
          How would you like to run Vibora?
        </div>
        <div class="button-group vertical" style="margin-top: 1.5rem;">
          <button class="primary-btn large" id="run-locally-btn">
            <span class="btn-icon">💻</span>
            <span class="btn-content">
              <span class="btn-title">Run Locally</span>
              <span class="btn-desc">Start a local server on this machine</span>
            </span>
          </button>
          <button class="secondary-btn large" id="connect-remote-btn">
            <span class="btn-icon">🌐</span>
            <span class="btn-content">
              <span class="btn-title">Connect to Remote Server</span>
              <span class="btn-desc">Connect to Vibora running on another machine</span>
            </span>
          </button>
        </div>
      </div>
    `;

    document.getElementById('run-locally-btn').onclick = () => resolve('local');
    document.getElementById('connect-remote-btn').onclick = () => resolve('remote');
  });
}

/**
 * Prompt user to configure remote server connection
 * @returns {Promise<{url: string} | null>} null if cancelled
 */
function promptRemoteConfig() {
  return new Promise((resolve) => {
    const app = document.getElementById('app');
    app.innerHTML = `
      <img src="/icons/icon.png" alt="Vibora" class="logo" style="animation: none;">
      <div class="prompt-container">
        <div class="prompt-title">Connect to Remote Server</div>
        <div class="prompt-description">
          Enter the URL of your remote Vibora server.
        </div>
        <div id="remote-error" class="prompt-error" style="display: none;"></div>
        <form class="prompt-form" id="remote-form">
          <div class="input-group">
            <label for="remote-url">Server URL</label>
            <input type="url" id="remote-url" placeholder="http://example.com:7777 or https://vibora.tailnet.ts.net" required autocomplete="off" />
          </div>
          <div class="button-group">
            <button type="button" class="secondary-btn" id="back-btn">Back</button>
            <button type="submit" class="primary-btn" id="connect-btn">Connect</button>
          </div>
        </form>
      </div>
    `;

    document.getElementById('back-btn').onclick = () => resolve(null);
    document.getElementById('remote-form').onsubmit = (e) => {
      e.preventDefault();
      const urlInput = document.getElementById('remote-url').value.trim();
      const errorEl = document.getElementById('remote-error');

      if (!urlInput) {
        errorEl.textContent = 'Please enter a URL';
        errorEl.style.display = 'block';
        return;
      }

      // Validate URL
      try {
        const url = new URL(urlInput);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
          throw new Error('URL must be http:// or https://');
        }
        // Normalize to origin (removes trailing slash, path)
        resolve({ url: url.origin });
      } catch (err) {
        errorEl.textContent = 'Please enter a valid URL (e.g., http://example.com:7777)';
        errorEl.style.display = 'block';
      }
    };
  });
}

/**
 * Prompt user to choose between local and remote server
 * Only shown when remote URL is configured in settings
 * @returns {Promise<'local' | 'remote' | 'edit'>}
 */
function promptServerChoice(remoteUrl) {
  return new Promise((resolve) => {
    const app = document.getElementById('app');
    app.innerHTML = `
      <img src="/icons/icon.png" alt="Vibora" class="logo" style="animation: none;">
      <div class="prompt-container">
        <div class="prompt-title">Choose Server</div>
        <div class="prompt-description">
          You have a remote server configured at:<br>
          <strong>${remoteUrl}</strong>
        </div>
        <div class="button-group" style="margin-top: 1.5rem;">
          <button class="primary-btn" id="use-local-btn">Use Local Server</button>
          <button class="secondary-btn" id="use-remote-btn">Connect to Remote</button>
        </div>
        <button class="text-btn" id="edit-url-btn" style="margin-top: 1rem;">Change URL</button>
      </div>
    `;

    document.getElementById('use-local-btn').onclick = () => resolve('local');
    document.getElementById('use-remote-btn').onclick = () => resolve('remote');
    document.getElementById('edit-url-btn').onclick = () => resolve('edit');
  });
}

/**
 * Check if a server is healthy
 */
async function checkServerHealth(baseUrl) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT);

    const response = await fetch(`${baseUrl}/health`, {
      method: 'GET',
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Wait for server to be ready with retries
 */
async function waitForServerReady(baseUrl) {
  for (let i = 0; i < MAX_HEALTH_RETRIES; i++) {
    setStatus('Connecting to server...', `Attempt ${i + 1}/${MAX_HEALTH_RETRIES}`);
    if (await checkServerHealth(baseUrl)) {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  return false;
}

/**
 * Set zoom level - reloads iframe with zoom query parameter
 * The Vibora frontend applies this as root font-size for native scaling
 */
function setZoom(level) {
  currentZoom = Math.max(0.5, Math.min(2.0, level)); // Clamp between 50% and 200%

  // Update zoom level display
  const zoomLevel = document.getElementById('zoom-level');
  if (zoomLevel) {
    zoomLevel.textContent = Math.round(currentZoom * 100) + '%';
  }
  console.log('[Vibora] Zoom:', Math.round(currentZoom * 100) + '%');

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
window.zoomReset = () => setZoom(1.0);

/**
 * Load the Vibora app in an iframe
 */
async function loadViboraApp(url) {
  setStatus('Loading Vibora...', url);
  serverUrl = url;

  console.log('[Vibora] Loading app from', url);

  // Use iframe to embed the app with zoom parameter
  const frame = document.getElementById('vibora-frame');
  const zoomParam = currentZoom !== 1.0 ? `?zoom=${currentZoom}` : '';
  frame.src = url + zoomParam;

  frame.onload = () => {
    document.body.classList.add('loaded');
    console.log('[Vibora] App loaded successfully from', url);
  };

  frame.onerror = () => {
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
    console.log('[Vibora] Server already running');
    return true;
  }

  setStatus('Starting local server...', `Port ${port}`);
  console.log('[Vibora] Starting local server...');

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

    console.log('[Vibora] Server command:', cmd);

    // Start server process in background
    const result = await Neutralino.os.spawnProcess(cmd);
    console.log('[Vibora] Server process spawned:', result);

    // Wait for server to be ready
    if (await waitForServerReady(localUrl)) {
      console.log('[Vibora] Server is ready');
      return true;
    }

    console.error('[Vibora] Server failed to become ready');
    return false;
  } catch (err) {
    console.error('[Vibora] Failed to start server:', err);
    return false;
  }
}

/**
 * Get remote server config from settings (nested format)
 */
function getRemoteConfig() {
  const url = desktopSettings?.remoteVibora?.url?.trim() || '';
  return { url };
}

/**
 * Connect to remote server
 */
async function connectToRemote(remoteUrl) {
  setStatus('Connecting to remote server...', remoteUrl);
  console.log('[Vibora] Connecting to remote:', remoteUrl);

  if (await waitForServerReady(remoteUrl)) {
    await saveSettings({
      ...desktopSettings,
      lastConnectedHost: remoteUrl
    });
    loadViboraApp(remoteUrl);
    return true;
  }

  console.log('[Vibora] Remote server not available');
  return false;
}

/**
 * Connect to local server
 * Will start the server if it's not already running (e.g., first launch or switching from remote)
 */
async function connectToLocal() {
  const localPort = getLocalPort();
  const localUrl = `http://localhost:${localPort}`;

  setStatus('Connecting to local server...', `localhost:${localPort}${isDevMode ? ' (dev)' : ''}`);
  console.log('[Vibora] Connecting to local server...');

  // Check if server is already running (launcher may have started it)
  if (await checkServerHealth(localUrl)) {
    console.log('[Vibora] Server already running');
    await saveSettings({
      ...desktopSettings,
      lastConnectedHost: 'localhost'
    });
    loadViboraApp(localUrl);
    return true;
  }

  // Server not running - start it
  console.log('[Vibora] Server not running, starting...');
  if (await startLocalServer()) {
    await saveSettings({
      ...desktopSettings,
      lastConnectedHost: 'localhost'
    });
    loadViboraApp(localUrl);
    return true;
  }

  showError('Server Failed', 'Could not start local server. Check ~/.vibora/desktop.log for details.');
  return false;
}

/**
 * Main connection logic
 *
 * Flow:
 * 1. First launch (no settings): Show onboarding choice (local vs remote)
 * 2. Remote configured: Show server choice dialog
 * 3. Otherwise: Connect to local directly
 */
async function tryConnect() {
  await loadSettings();

  const remote = getRemoteConfig();
  const hasRemoteConfig = remote.url !== '';

  // First launch - show onboarding
  if (isFirstLaunch()) {
    console.log('[Vibora] First launch detected, showing onboarding');

    const choice = await promptOnboardingChoice();

    if (choice === 'remote') {
      // User wants to configure remote server
      const config = await promptRemoteConfig();

      if (config) {
        // Save remote config
        await saveSettings({
          ...desktopSettings,
          _schemaVersion: CURRENT_SCHEMA_VERSION,
          server: { port: DEFAULT_PORT },
          remoteVibora: { url: config.url },
          editor: { app: 'vscode', host: '', sshPort: 22 },
        });

        // Try to connect to remote
        if (await connectToRemote(config.url)) {
          return;
        }

        // Remote failed - ask if they want to try local instead
        showError('Connection Failed', `Could not connect to ${config.url}. Try running locally or check the server.`);
        return;
      }

      // User went back - start onboarding again
      await tryConnect();
      return;
    }

    // User chose local - save default settings and continue
    await saveSettings({
      ...desktopSettings,
      _schemaVersion: CURRENT_SCHEMA_VERSION,
      server: { port: DEFAULT_PORT },
      remoteVibora: { url: '' },
      editor: { app: 'vscode', host: '', sshPort: 22 },
    });
  }

  // Check if remote URL is configured (returning user with remote setup)
  if (hasRemoteConfig) {
    // Ask user which server to use
    const choice = await promptServerChoice(remote.url);

    if (choice === 'edit') {
      // User wants to change the URL
      const config = await promptRemoteConfig();
      if (config) {
        // Save new remote config
        await saveSettings({
          ...desktopSettings,
          remoteVibora: { url: config.url },
        });
        // Try to connect to new remote
        if (await connectToRemote(config.url)) {
          return;
        }
        showError('Connection Failed', `Could not connect to ${config.url}`);
        return;
      }
      // User cancelled - restart choice
      await tryConnect();
      return;
    }

    if (choice === 'remote') {
      if (await connectToRemote(remote.url)) {
        return;
      }
      // Remote failed - fall through to local
      console.log('[Vibora] Remote server not available, falling back to local');
    }
  }

  // Connect to local server
  await connectToLocal();
}

/**
 * Handle reconnection request from the React app (via postMessage)
 * Called when user changes the remote URL in Settings
 */
async function handleReconnect(newUrl) {
  console.log('[Vibora] Reconnect requested:', newUrl || 'local');

  // Save new URL to settings
  await saveSettings({
    ...desktopSettings,
    remoteVibora: { url: newUrl || '' }
  });

  if (newUrl) {
    // Connect to remote
    if (await connectToRemote(newUrl)) {
      return;
    }
    // Failed - show error but don't fall back automatically
    showError('Connection Failed', `Could not connect to ${newUrl}`);
  } else {
    // Switch to local
    await connectToLocal();
  }
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

  console.log('[Vibora] Initiating shutdown...');

  try {
    // Signal server extension to shutdown if running locally
    await Neutralino.extensions.dispatch(SERVER_EXTENSION_ID, 'shutdown', {});
    await new Promise(resolve => setTimeout(resolve, 500));
  } catch {
    // Extension might not be running
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
  try {
    // Initialize Neutralino
    Neutralino.init();
    console.log('[Vibora] Neutralino initialized');
    console.log('[Vibora] OS:', NL_OS);

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
        }
      ]);

      // Handle custom menu actions (zoom)
      Neutralino.events.on('mainMenuItemClicked', (evt) => {
        switch (evt.detail.id) {
          case 'zoomIn': zoomIn(); break;
          case 'zoomOut': zoomOut(); break;
          case 'zoomReset': zoomReset(); break;
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
      } else if (event.data?.type === 'vibora:reconnect') {
        // Handle reconnection request from Settings UI
        const newUrl = event.data.url;
        handleReconnect(newUrl);
      }
    });

    // Start connection flow
    await tryConnect();

    // Check for updates after app is loaded (wait 5 seconds to not block startup)
    setTimeout(autoCheckForUpdates, 5000);

  } catch (err) {
    console.error('[Vibora] Initialization error:', err);
    showError('Initialization Failed', err.message || 'Could not initialize the application.');
  }
}

// Start the application when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
