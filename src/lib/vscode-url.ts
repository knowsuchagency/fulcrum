/**
 * Build a VS Code URL to open a folder
 *
 * @param path - The absolute path to the folder
 * @param hostname - The remote machine hostname (empty for local)
 * @param sshPort - The SSH port (default 22)
 * @returns A VS Code protocol URL
 */
export function buildVSCodeUrl(
  path: string,
  hostname: string,
  sshPort: number
): string {
  if (!hostname) {
    // Local: vscode://file/path
    return `vscode://file${path}`
  }

  // Remote: vscode://vscode-remote/ssh-remote+hostname/path
  // With non-standard port: ssh-remote+hostname:port
  const hostPart = sshPort !== 22 ? `${hostname}:${sshPort}` : hostname
  return `vscode://vscode-remote/ssh-remote+${hostPart}${path}`
}
