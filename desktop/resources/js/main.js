/**
 * Vibora Desktop - Neutralinojs Frontend
 *
 * This script handles:
 * 1. Initializing Neutralino
 * 2. Trying to connect to localhost first
 * 3. Falling back to remote hostname from settings
 * 4. Prompting user for remote hostname if not configured
 * 5. Graceful shutdown on window close
 */

// Configuration
const SERVER_EXTENSION_ID = 'io.vibora.server';
const DEFAULT_PORT = 3333;
const HEALTH_CHECK_TIMEOUT = 3000; // 3 seconds per check
const MAX_HEALTH_RETRIES = 10;

// State
let serverUrl = null;
let isShuttingDown = false;
let desktopSettings = null;
let currentZoom = 1.0;

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
 * Load settings from file
 */
async function loadSettings() {
  try {
    const settingsPath = await getSettingsPath();
    const content = await Neutralino.filesystem.readFile(settingsPath);
    desktopSettings = JSON.parse(content);
    console.log('[Vibora] Loaded settings:', desktopSettings);
    return desktopSettings;
  } catch (err) {
    // File doesn't exist or is invalid, use defaults
    console.log('[Vibora] No existing settings, using defaults');
    desktopSettings = {};
    return desktopSettings;
  }
}

/**
 * Save settings to file
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
 * Show the remote host prompt
 */
function showRemoteHostPrompt(prefillHost = '', prefillPort = DEFAULT_PORT) {
  const app = document.getElementById('app');
  app.innerHTML = `
    <img src="/icons/icon.png" alt="Vibora" class="logo" style="animation: none;">
    <div class="prompt-container">
      <div class="prompt-title">Connect to Remote Vibora</div>
      <div class="prompt-description">
        Could not connect to a local Vibora server.<br>
        Enter the hostname of your remote Vibora instance:
      </div>
      <form id="remote-form" class="prompt-form">
        <div class="input-group">
          <label for="remote-host">Hostname</label>
          <input
            type="text"
            id="remote-host"
            placeholder="e.g., my-server.tailnet.ts.net"
            value="${prefillHost}"
            required
          >
        </div>
        <div class="input-group">
          <label for="remote-port">Port</label>
          <input
            type="number"
            id="remote-port"
            placeholder="${DEFAULT_PORT}"
            value="${prefillPort}"
            min="1"
            max="65535"
          >
        </div>
        <div class="button-group">
          <button type="submit" class="primary-btn">Connect</button>
          <button type="button" class="secondary-btn" onclick="retryLocal()">Retry Local</button>
        </div>
      </form>
    </div>
  `;

  document.getElementById('remote-form').addEventListener('submit', handleRemoteFormSubmit);
  document.getElementById('remote-host').focus();
}

/**
 * Handle remote form submission
 */
async function handleRemoteFormSubmit(e) {
  e.preventDefault();

  const hostInput = document.getElementById('remote-host');
  const portInput = document.getElementById('remote-port');

  const host = hostInput.value.trim();
  const port = parseInt(portInput.value) || DEFAULT_PORT;

  if (!host) {
    hostInput.focus();
    return;
  }

  // Show connecting state
  setStatus('Connecting to remote server...', `${host}:${port}`);
  document.getElementById('app').innerHTML = `
    <img src="/icons/icon.png" alt="Vibora" class="logo">
    <div class="spinner"></div>
    <div class="status">
      <div id="status-text">Connecting to remote server...</div>
      <div class="status-detail" id="status-detail">${host}:${port}</div>
    </div>
  `;

  // Try to connect
  const url = `http://${host}:${port}`;
  const isHealthy = await checkServerHealth(url);

  if (isHealthy) {
    // Save settings and connect
    await saveSettings({
      ...desktopSettings,
      remoteHost: host,
      remotePort: port,
      lastConnectedHost: host
    });
    loadViboraApp(url);
  } else {
    // Show prompt again with error
    showRemoteHostPrompt(host, port);
    const app = document.getElementById('app');
    const errorDiv = document.createElement('div');
    errorDiv.className = 'prompt-error';
    errorDiv.textContent = `Could not connect to ${host}:${port}. Please check the hostname and port.`;
    app.querySelector('.prompt-container').insertBefore(errorDiv, app.querySelector('.prompt-form'));
  }
}

/**
 * Retry connecting to localhost
 */
window.retryLocal = async function() {
  // Reset UI
  document.getElementById('app').innerHTML = `
    <img src="/icons/icon.png" alt="Vibora" class="logo">
    <div class="spinner"></div>
    <div class="status">
      <div id="status-text">Connecting to local server...</div>
      <div class="status-detail" id="status-detail"></div>
    </div>
  `;

  await tryConnect();
};

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

  // Reload iframe with new zoom parameter
  // Note: We can't preserve the current SPA route because the iframe is cross-origin
  // (Neutralino runs on 127.0.0.1:random, iframe is localhost:3333)
  // A future enhancement could use postMessage to communicate the route
  const frame = document.getElementById('vibora-frame');
  if (frame && serverUrl) {
    const zoomParam = currentZoom !== 1.0 ? `?zoom=${currentZoom}` : '';
    frame.src = serverUrl + zoomParam;
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
 * Main connection logic
 */
async function tryConnect() {
  // Load settings
  await loadSettings();

  // Use 'port' from settings (same as server config)
  const localPort = desktopSettings.port || DEFAULT_PORT;
  const localUrl = `http://localhost:${localPort}`;

  // Step 1: Try localhost first
  setStatus('Checking local server...', `localhost:${localPort}`);
  console.log('[Vibora] Trying localhost...');

  if (await checkServerHealth(localUrl)) {
    console.log('[Vibora] Local server found');
    await saveSettings({
      ...desktopSettings,
      lastConnectedHost: 'localhost'
    });
    loadViboraApp(localUrl);
    return;
  }

  console.log('[Vibora] Local server not available');

  // Step 2: Try configured remote host
  if (desktopSettings.remoteHost) {
    const remoteUrl = `http://${desktopSettings.remoteHost}:${desktopSettings.remotePort || DEFAULT_PORT}`;
    setStatus('Checking remote server...', `${desktopSettings.remoteHost}:${desktopSettings.remotePort || DEFAULT_PORT}`);
    console.log('[Vibora] Trying remote host:', desktopSettings.remoteHost);

    if (await checkServerHealth(remoteUrl)) {
      console.log('[Vibora] Remote server found');
      await saveSettings({
        ...desktopSettings,
        lastConnectedHost: desktopSettings.remoteHost
      });
      loadViboraApp(remoteUrl);
      return;
    }

    console.log('[Vibora] Remote server not available');
  }

  // Step 3: Prompt user for remote hostname
  console.log('[Vibora] Prompting for remote hostname');
  showRemoteHostPrompt(
    desktopSettings.remoteHost || '',
    desktopSettings.remotePort || DEFAULT_PORT
  );
}

/**
 * Handle extension ready event (when running with local server extension)
 */
function handleExtensionReady(port) {
  console.log(`[Vibora] Local server extension ready on port ${port}`);

  // Save port for future reference
  saveSettings({
    ...desktopSettings,
    port: port,
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

/**
 * Initialize the application
 */
async function init() {
  try {
    // Initialize Neutralino
    Neutralino.init();
    console.log('[Vibora] Neutralino initialized');
    console.log('[Vibora] OS:', NL_OS);

    // Set up event listeners
    Neutralino.events.on('windowClose', shutdown);

    // Listen for extension ready (local server)
    Neutralino.events.on('serverReady', (evt) => {
      handleExtensionReady(evt.detail.port);
    });

    Neutralino.events.on('extClientConnect', (evt) => {
      console.log('[Vibora] Extension connected:', evt.detail);
    });

    // Start connection flow
    await tryConnect();

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
