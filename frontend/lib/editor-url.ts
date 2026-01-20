/**
 * Editor app types supported by Fulcrum
 */
export type EditorApp = 'vscode' | 'cursor' | 'windsurf' | 'zed' | 'antigravity'

/**
 * Editor protocol mapping
 */
const EDITOR_PROTOCOLS: Record<EditorApp, string> = {
  vscode: 'vscode',
  cursor: 'cursor',
  windsurf: 'windsurf',
  zed: 'zed',
  antigravity: 'antigravity',
}

/**
 * Build an editor URL to open a folder
 *
 * @param path - The absolute path to the folder
 * @param editorApp - The editor application to use
 * @param remoteHost - The remote machine hostname (empty for local)
 * @param sshPort - The SSH port (default 22)
 * @returns An editor protocol URL
 */
export function buildEditorUrl(
  path: string,
  editorApp: EditorApp,
  remoteHost: string,
  sshPort: number
): string {
  const protocol = EDITOR_PROTOCOLS[editorApp]

  if (!remoteHost) {
    // Local: protocol://file/path
    return `${protocol}://file${path}`
  }

  // Remote: protocol://vscode-remote/ssh-remote+host/path
  // With non-standard port: ssh-remote+host:port
  // Note: All VS Code forks use the vscode-remote URI format
  const hostPart = sshPort !== 22 ? `${remoteHost}:${sshPort}` : remoteHost
  return `${protocol}://vscode-remote/ssh-remote+${hostPart}${path}`
}

/**
 * Get the display name for an editor app
 */
export function getEditorDisplayName(editorApp: EditorApp): string {
  const names: Record<EditorApp, string> = {
    vscode: 'VS Code',
    cursor: 'Cursor',
    windsurf: 'Windsurf',
    zed: 'Zed',
    antigravity: 'Antigravity',
  }
  return names[editorApp]
}

/**
 * @deprecated Use buildEditorUrl instead
 * Build a VS Code URL to open a folder (legacy compatibility)
 */
export function buildVSCodeUrl(
  path: string,
  remoteHost: string,
  sshPort: number
): string {
  return buildEditorUrl(path, 'vscode', remoteHost, sshPort)
}

/**
 * Open a URL in the appropriate context
 * - Desktop app: posts message to parent to use Neutralino.os.open()
 * - Web browser: uses window.open()
 */
export function openExternalUrl(url: string): void {
  if (window.parent !== window) {
    // Running in desktop app iframe - delegate to Neutralino
    window.parent.postMessage({ type: 'fulcrum:openUrl', url }, '*')
  } else {
    // Running in web browser
    window.open(url, '_blank')
  }
}
