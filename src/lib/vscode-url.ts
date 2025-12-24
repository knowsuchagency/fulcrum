/**
 * Build a VS Code URL to open a folder
 *
 * @param path - The absolute path to the folder
 * @param remoteHost - The remote machine hostname (empty for local)
 * @param sshPort - The SSH port (default 22)
 * @returns A VS Code protocol URL
 */
export function buildVSCodeUrl(
  path: string,
  remoteHost: string,
  sshPort: number
): string {
  if (!remoteHost) {
    // Local: vscode://file/path
    return `vscode://file${path}`
  }

  // Remote: vscode://vscode-remote/ssh-remote+host/path
  // With non-standard port: ssh-remote+host:port
  const hostPart = sshPort !== 22 ? `${remoteHost}:${sshPort}` : remoteHost
  return `vscode://vscode-remote/ssh-remote+${hostPart}${path}`
}
