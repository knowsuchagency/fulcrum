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
const CURRENT_SCHEMA_VERSION = 2;
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
 * Migrate settings from flat to nested format
 */
function migrateSettings(settings) {
  if (settings._schemaVersion >= CURRENT_SCHEMA_VERSION) {
    return settings; // Already migrated
  }

  console.log('[Vibora] Migrating settings to nested format...');

  // Migration map from flat keys to nested paths
  const migrationMap = {
    port: ['server', 'port'],
    defaultGitReposDir: ['paths', 'defaultGitReposDir'],
    basicAuthUsername: ['authentication', 'username'],
    basicAuthPassword: ['authentication', 'password'],
    remoteHost: ['remoteVibora', 'host'],
    hostname: ['remoteVibora', 'host'], // Legacy key
    remotePort: ['remoteVibora', 'port'],
    sshPort: ['editor', 'sshPort'],
    linearApiKey: ['integrations', 'linearApiKey'],
    githubPat: ['integrations', 'githubPat'],
    language: ['appearance', 'language'],
  };

  const migrated = {
    _schemaVersion: CURRENT_SCHEMA_VERSION,
    server: { port: DEFAULT_PORT },
    remoteVibora: { host: '', port: DEFAULT_PORT },
    editor: { app: 'vscode', host: '', sshPort: 22 },
  };

  // Copy existing nested groups if present
  for (const key of ['server', 'paths', 'authentication', 'remoteVibora', 'editor', 'integrations', 'appearance', 'notifications', 'zai']) {
    if (settings[key] && typeof settings[key] === 'object') {
      migrated[key] = { ...migrated[key], ...settings[key] };
    }
  }

  // Migrate flat keys
  for (const [flatKey, [group, prop]] of Object.entries(migrationMap)) {
    if (settings[flatKey] !== undefined && settings[flatKey] !== null) {
      // Don't migrate old default port (3333) - let user get new default
      if (flatKey === 'port' && settings[flatKey] === 3333) {
        continue;
      }
      // Only migrate if not already set in nested format
      if (!migrated[group]) migrated[group] = {};
      if (migrated[group][prop] === undefined || migrated[group][prop] === null || migrated[group][prop] === '') {
        migrated[group][prop] = settings[flatKey];
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
 * @returns {Promise<{host: string, port: number} | null>} null if cancelled
 */
function promptRemoteConfig() {
  return new Promise((resolve) => {
    const app = document.getElementById('app');
    app.innerHTML = `
      <img src="/icons/icon.png" alt="Vibora" class="logo" style="animation: none;">
      <div class="prompt-container">
        <div class="prompt-title">Connect to Remote Server</div>
        <div class="prompt-description">
          Enter the hostname and port of your remote Vibora server.
        </div>
        <div id="remote-error" class="prompt-error" style="display: none;"></div>
        <form class="prompt-form" id="remote-form">
          <div class="input-group">
            <label for="remote-host">Hostname</label>
            <input type="text" id="remote-host" placeholder="example.com or 192.168.1.100" required autocomplete="off" />
          </div>
          <div class="input-group">
            <label for="remote-port">Port</label>
            <input type="number" id="remote-port" placeholder="${DEFAULT_PORT}" value="${DEFAULT_PORT}" min="1" max="65535" />
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
      const host = document.getElementById('remote-host').value.trim();
      const port = parseInt(document.getElementById('remote-port').value, 10) || DEFAULT_PORT;

      if (!host) {
        const errorEl = document.getElementById('remote-error');
        errorEl.textContent = 'Please enter a hostname';
        errorEl.style.display = 'block';
        return;
      }

      resolve({ host, port });
    };
  });
}

/**
 * Prompt user to choose between local and remote server
 * Only shown when remoteHost is configured in settings
 * @returns {Promise<boolean>} true if user wants to connect to remote
 */
function promptServerChoice(remoteHost, remotePort) {
  return new Promise((resolve) => {
    const app = document.getElementById('app');
    const displayHost = remotePort !== DEFAULT_PORT ? `${remoteHost}:${remotePort}` : remoteHost;
    app.innerHTML = `
      <img src="/icons/icon.png" alt="Vibora" class="logo" style="animation: none;">
      <div class="prompt-container">
        <div class="prompt-title">Choose Server</div>
        <div class="prompt-description">
          You have a remote server configured at:<br>
          <strong>${displayHost}</strong>
        </div>
        <div class="button-group" style="margin-top: 1.5rem;">
          <button class="primary-btn" id="use-local-btn">Use Local Server</button>
          <button class="secondary-btn" id="use-remote-btn">Connect to Remote</button>
        </div>
      </div>
    `;

    document.getElementById('use-local-btn').onclick = () => resolve(false);
    document.getElementById('use-remote-btn').onclick = () => resolve(true);
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
 * Get remote server config from settings (nested format)
 */
function getRemoteConfig() {
  const host = desktopSettings?.remoteVibora?.host?.trim() || '';
  const port = desktopSettings?.remoteVibora?.port || DEFAULT_PORT;
  return { host, port };
}

/**
 * Connect to remote server
 */
async function connectToRemote(remoteHost, remotePort) {
  const remoteUrl = `http://${remoteHost}:${remotePort}`;

  setStatus('Connecting to remote server...', `${remoteHost}:${remotePort}`);
  console.log('[Vibora] Connecting to remote:', remoteHost);

  if (await waitForServerReady(remoteUrl)) {
    await saveSettings({
      ...desktopSettings,
      lastConnectedHost: remoteHost
    });
    loadViboraApp(remoteUrl);
    return true;
  }

  console.log('[Vibora] Remote server not available');
  return false;
}

/**
 * Connect to local server
 */
async function connectToLocal() {
  const localPort = getLocalPort();
  const localUrl = `http://localhost:${localPort}`;

  setStatus('Starting Vibora...', `localhost:${localPort}${isDevMode ? ' (dev)' : ''}`);
  console.log('[Vibora] Waiting for local server...');

  if (await waitForServerReady(localUrl)) {
    await saveSettings({
      ...desktopSettings,
      lastConnectedHost: 'localhost'
    });
    loadViboraApp(localUrl);
    return true;
  }

  showError('Server Failed', 'Could not connect to local server. Check the logs.');
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
  const hasRemoteConfig = remote.host !== '';

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
          remoteVibora: { host: config.host, port: config.port },
          editor: { app: 'vscode', host: '', sshPort: 22 },
        });

        // Try to connect to remote
        if (await connectToRemote(config.host, config.port)) {
          return;
        }

        // Remote failed - ask if they want to try local instead
        showError('Connection Failed', `Could not connect to ${config.host}:${config.port}. Try running locally or check the server.`);
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
      remoteVibora: { host: '', port: DEFAULT_PORT },
      editor: { app: 'vscode', host: '', sshPort: 22 },
    });
  }

  // Check if remoteHost is configured (returning user with remote setup)
  if (hasRemoteConfig) {
    // Ask user which server to use
    const useRemote = await promptServerChoice(remote.host, remote.port);

    if (useRemote) {
      if (await connectToRemote(remote.host, remote.port)) {
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
