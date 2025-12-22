#!/usr/bin/env node
// @bun

// cli/src/utils/server.ts
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
function expandPath(p) {
  if (p.startsWith("~/")) {
    return join(homedir(), p.slice(2));
  }
  return p;
}
function readSettingsFile(path) {
  try {
    if (existsSync(path)) {
      const content = readFileSync(path, "utf-8");
      return JSON.parse(content);
    }
  } catch {}
  return null;
}
function discoverServerUrl(urlOverride, portOverride) {
  if (urlOverride) {
    return urlOverride;
  }
  if (portOverride) {
    return `http://localhost:${portOverride}`;
  }
  if (process.env.VIBORA_URL) {
    return process.env.VIBORA_URL;
  }
  if (process.env.VIBORA_DIR) {
    const viboraDirSettings = join(expandPath(process.env.VIBORA_DIR), "settings.json");
    const settings = readSettingsFile(viboraDirSettings);
    if (settings?.port) {
      return `http://localhost:${settings.port}`;
    }
  }
  const cwdSettings = join(process.cwd(), ".vibora", "settings.json");
  const localSettings = readSettingsFile(cwdSettings);
  if (localSettings?.port) {
    return `http://localhost:${localSettings.port}`;
  }
  const globalSettings = join(homedir(), ".vibora", "settings.json");
  const homeSettings = readSettingsFile(globalSettings);
  if (homeSettings?.port) {
    return `http://localhost:${homeSettings.port}`;
  }
  return "http://localhost:3333";
}
function getViboraDir() {
  if (process.env.VIBORA_DIR) {
    return expandPath(process.env.VIBORA_DIR);
  }
  const cwdViboraDir = join(process.cwd(), ".vibora");
  if (existsSync(cwdViboraDir)) {
    return cwdViboraDir;
  }
  return join(homedir(), ".vibora");
}
function getAuthCredentials() {
  const settingsPaths = [
    process.env.VIBORA_DIR && join(expandPath(process.env.VIBORA_DIR), "settings.json"),
    join(process.cwd(), ".vibora", "settings.json"),
    join(homedir(), ".vibora", "settings.json")
  ].filter(Boolean);
  for (const path of settingsPaths) {
    const settings = readSettingsFile(path);
    if (settings?.basicAuthUsername && settings?.basicAuthPassword) {
      return {
        username: settings.basicAuthUsername,
        password: settings.basicAuthPassword
      };
    }
  }
  return null;
}

// cli/src/utils/errors.ts
var ExitCodes = {
  SUCCESS: 0,
  ERROR: 1,
  INVALID_ARGS: 2,
  SERVER_UNREACHABLE: 3,
  NOT_FOUND: 4,
  VALIDATION_ERROR: 5
};

class CliError extends Error {
  code;
  exitCode;
  constructor(code, message, exitCode = ExitCodes.ERROR) {
    super(message);
    this.code = code;
    this.exitCode = exitCode;
    this.name = "CliError";
  }
}

class ApiError extends CliError {
  statusCode;
  constructor(statusCode, message) {
    const exitCode = statusCode === 0 ? ExitCodes.SERVER_UNREACHABLE : statusCode === 404 ? ExitCodes.NOT_FOUND : statusCode === 400 ? ExitCodes.VALIDATION_ERROR : ExitCodes.ERROR;
    const code = statusCode === 0 ? "SERVER_UNREACHABLE" : statusCode === 404 ? "NOT_FOUND" : statusCode === 400 ? "VALIDATION_ERROR" : "API_ERROR";
    super(code, message, exitCode);
    this.statusCode = statusCode;
    this.name = "ApiError";
  }
}

// cli/src/client.ts
class ViboraClient {
  baseUrl;
  authHeader;
  constructor(urlOverride, portOverride) {
    this.baseUrl = discoverServerUrl(urlOverride, portOverride);
    const credentials = getAuthCredentials();
    if (credentials) {
      const encoded = btoa(`${credentials.username}:${credentials.password}`);
      this.authHeader = `Basic ${encoded}`;
    } else {
      this.authHeader = null;
    }
  }
  async fetch(path, options) {
    const url = `${this.baseUrl}${path}`;
    const headers = {
      "Content-Type": "application/json",
      ...options?.headers
    };
    if (this.authHeader) {
      headers["Authorization"] = this.authHeader;
    }
    try {
      const res = await fetch(url, {
        ...options,
        headers
      });
      if (res.status === 401) {
        throw new ApiError(401, "Authentication required. Configure basicAuthUsername and basicAuthPassword in settings.json");
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new ApiError(res.status, body.error || body.message || `Request failed: ${res.status}`);
      }
      return res.json();
    } catch (err) {
      if (err instanceof ApiError)
        throw err;
      throw new ApiError(0, `Server unreachable: ${this.baseUrl}`);
    }
  }
  async health() {
    return this.fetch("/health");
  }
  async listTasks() {
    return this.fetch("/api/tasks");
  }
  async getTask(id) {
    return this.fetch(`/api/tasks/${id}`);
  }
  async createTask(data) {
    return this.fetch("/api/tasks", {
      method: "POST",
      body: JSON.stringify(data)
    });
  }
  async updateTask(id, updates) {
    return this.fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      body: JSON.stringify(updates)
    });
  }
  async moveTask(id, status, position) {
    if (position === undefined) {
      const tasks = await this.listTasks();
      const targetTasks = tasks.filter((t) => t.status === status);
      position = targetTasks.length;
    }
    return this.fetch(`/api/tasks/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status, position })
    });
  }
  async deleteTask(id) {
    return this.fetch(`/api/tasks/${id}`, { method: "DELETE" });
  }
  async bulkDeleteTasks(ids) {
    return this.fetch("/api/tasks/bulk", {
      method: "DELETE",
      body: JSON.stringify({ ids })
    });
  }
  async getBranches(repo) {
    return this.fetch(`/api/git/branches?repo=${encodeURIComponent(repo)}`);
  }
  async getDiff(path, options) {
    const params = new URLSearchParams({ path });
    if (options?.staged)
      params.set("staged", "true");
    if (options?.ignoreWhitespace)
      params.set("ignoreWhitespace", "true");
    if (options?.includeUntracked)
      params.set("includeUntracked", "true");
    return this.fetch(`/api/git/diff?${params}`);
  }
  async getStatus(path) {
    return this.fetch(`/api/git/status?path=${encodeURIComponent(path)}`);
  }
  async listWorktrees() {
    return this.fetch("/api/worktrees");
  }
  async deleteWorktree(worktreePath, repoPath) {
    return this.fetch("/api/worktrees", {
      method: "DELETE",
      body: JSON.stringify({ worktreePath, repoPath })
    });
  }
  async getConfig(key) {
    return this.fetch(`/api/config/${key}`);
  }
  async setConfig(key, value) {
    return this.fetch(`/api/config/${key}`, {
      method: "PUT",
      body: JSON.stringify({ value })
    });
  }
  async resetConfig(key) {
    return this.fetch(`/api/config/${key}`, { method: "DELETE" });
  }
}

// cli/src/utils/output.ts
var prettyOutput = false;
function setPrettyOutput(value) {
  prettyOutput = value;
}
function isPrettyOutput() {
  return prettyOutput;
}
function prettyLog(type, message) {
  const prefixes = {
    success: "\u2713",
    info: "\u2192",
    error: "\u2717",
    warning: "\u26A0"
  };
  console.log(`${prefixes[type]} ${message}`);
}
function outputSuccess(message) {
  if (prettyOutput) {
    prettyLog("success", message);
  } else {
    output({ message });
  }
}
function output(data) {
  const response = {
    success: true,
    data
  };
  console.log(prettyOutput ? JSON.stringify(response, null, 2) : JSON.stringify(response));
}
function outputError(error) {
  const response = {
    success: false,
    error: {
      code: error.code,
      message: error.message
    }
  };
  console.log(prettyOutput ? JSON.stringify(response, null, 2) : JSON.stringify(response));
  process.exit(error.exitCode);
}

// cli/src/commands/current-task.ts
var STATUS_MAP = {
  done: "DONE",
  review: "IN_REVIEW",
  cancel: "CANCELED",
  "in-progress": "IN_PROGRESS"
};
async function findCurrentTask(client, pathOverride) {
  const currentPath = pathOverride || process.cwd();
  const tasks = await client.listTasks();
  const task = tasks.find((t) => {
    if (!t.worktreePath)
      return false;
    return currentPath === t.worktreePath || currentPath.startsWith(t.worktreePath + "/");
  });
  if (!task) {
    throw new CliError("NOT_IN_WORKTREE", `No task found for path: ${currentPath}. Are you inside a Vibora task worktree?`, ExitCodes.NOT_FOUND);
  }
  return task;
}
async function handleCurrentTaskCommand(action, rest, flags) {
  const client = new ViboraClient(flags.url, flags.port);
  const pathOverride = flags.path;
  if (!action) {
    const task2 = await findCurrentTask(client, pathOverride);
    output(task2);
    return;
  }
  if (action === "pr") {
    const prUrl = rest[0];
    if (!prUrl) {
      throw new CliError("MISSING_PR_URL", "Usage: vibora current-task pr <url>", ExitCodes.INVALID_ARGS);
    }
    const task2 = await findCurrentTask(client, pathOverride);
    const updatedTask2 = await client.updateTask(task2.id, { prUrl });
    output(updatedTask2);
    return;
  }
  if (action === "linear") {
    const linearUrl = rest[0];
    if (!linearUrl) {
      throw new CliError("MISSING_LINEAR_URL", "Usage: vibora current-task linear <url>", ExitCodes.INVALID_ARGS);
    }
    const ticketId = linearUrl.match(/\/issue\/([A-Z]+-\d+)/i)?.[1];
    if (!ticketId) {
      throw new CliError("INVALID_LINEAR_URL", "Invalid Linear URL. Expected format: https://linear.app/team/issue/TEAM-123", ExitCodes.INVALID_ARGS);
    }
    const task2 = await findCurrentTask(client, pathOverride);
    const updatedTask2 = await client.updateTask(task2.id, {
      linearTicketId: ticketId,
      linearTicketUrl: linearUrl
    });
    output(updatedTask2);
    return;
  }
  const newStatus = STATUS_MAP[action];
  if (!newStatus) {
    throw new CliError("INVALID_ACTION", `Unknown action: ${action}. Valid actions: done, review, cancel, in-progress, pr, linear`, ExitCodes.INVALID_ARGS);
  }
  const task = await findCurrentTask(client, pathOverride);
  const updatedTask = await client.moveTask(task.id, newStatus);
  output(updatedTask);
}

// cli/src/commands/tasks.ts
import { basename } from "path";
var VALID_STATUSES = ["IN_PROGRESS", "IN_REVIEW", "DONE", "CANCELED"];
async function handleTasksCommand(action, positional, flags) {
  const client = new ViboraClient(flags.url, flags.port);
  switch (action) {
    case "list": {
      let tasks = await client.listTasks();
      if (flags.status) {
        const status = flags.status.toUpperCase();
        if (!VALID_STATUSES.includes(status)) {
          throw new CliError("INVALID_STATUS", `Invalid status: ${flags.status}. Valid: ${VALID_STATUSES.join(", ")}`, ExitCodes.INVALID_ARGS);
        }
        tasks = tasks.filter((t) => t.status === status);
      }
      if (flags.repo) {
        const repoFilter = flags.repo.toLowerCase();
        tasks = tasks.filter((t) => t.repoName.toLowerCase().includes(repoFilter) || t.repoPath.toLowerCase().includes(repoFilter));
      }
      output(tasks);
      break;
    }
    case "get": {
      const [id] = positional;
      if (!id) {
        throw new CliError("MISSING_ID", "Task ID required", ExitCodes.INVALID_ARGS);
      }
      const task = await client.getTask(id);
      output(task);
      break;
    }
    case "create": {
      const title = flags.title;
      const repoPath = flags.repo || flags["repo-path"];
      const baseBranch = flags["base-branch"] || "main";
      const branch = flags.branch;
      const description = flags.description || "";
      if (!title) {
        throw new CliError("MISSING_TITLE", "--title is required", ExitCodes.INVALID_ARGS);
      }
      if (!repoPath) {
        throw new CliError("MISSING_REPO", "--repo is required", ExitCodes.INVALID_ARGS);
      }
      const repoName = flags["repo-name"] || basename(repoPath);
      const task = await client.createTask({
        title,
        description,
        repoPath,
        repoName,
        baseBranch,
        branch: branch || null,
        worktreePath: flags["worktree-path"] || null,
        status: "IN_PROGRESS"
      });
      output(task);
      break;
    }
    case "update": {
      const [id] = positional;
      if (!id) {
        throw new CliError("MISSING_ID", "Task ID required", ExitCodes.INVALID_ARGS);
      }
      const updates = {};
      if (flags.title !== undefined)
        updates.title = flags.title;
      if (flags.description !== undefined)
        updates.description = flags.description;
      if (Object.keys(updates).length === 0) {
        throw new CliError("NO_UPDATES", "No updates provided. Use --title or --description", ExitCodes.INVALID_ARGS);
      }
      const task = await client.updateTask(id, updates);
      output(task);
      break;
    }
    case "move": {
      const [id] = positional;
      if (!id) {
        throw new CliError("MISSING_ID", "Task ID required", ExitCodes.INVALID_ARGS);
      }
      const status = flags.status?.toUpperCase() || "";
      if (!status || !VALID_STATUSES.includes(status)) {
        throw new CliError("INVALID_STATUS", `--status is required. Valid: ${VALID_STATUSES.join(", ")}`, ExitCodes.INVALID_ARGS);
      }
      const position = flags.position ? parseInt(flags.position, 10) : undefined;
      const task = await client.moveTask(id, status, position);
      output(task);
      break;
    }
    case "delete": {
      const [id] = positional;
      if (!id) {
        throw new CliError("MISSING_ID", "Task ID required", ExitCodes.INVALID_ARGS);
      }
      await client.deleteTask(id);
      output({ deleted: id });
      break;
    }
    default:
      throw new CliError("UNKNOWN_ACTION", `Unknown action: ${action}. Valid: list, get, create, update, move, delete`, ExitCodes.INVALID_ARGS);
  }
}

// cli/src/commands/up.ts
import { spawn } from "child_process";
import { dirname as dirname2, join as join3 } from "path";
import { fileURLToPath } from "url";

// cli/src/utils/process.ts
import { existsSync as existsSync2, readFileSync as readFileSync2, writeFileSync, unlinkSync, mkdirSync } from "fs";
import { join as join2, dirname } from "path";
function getPidPath() {
  return join2(getViboraDir(), "vibora.pid");
}
function writePid(pid) {
  const pidPath = getPidPath();
  const dir = dirname(pidPath);
  if (!existsSync2(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(pidPath, pid.toString(), "utf-8");
}
function readPid() {
  const pidPath = getPidPath();
  try {
    if (existsSync2(pidPath)) {
      const content = readFileSync2(pidPath, "utf-8").trim();
      const pid = parseInt(content, 10);
      return isNaN(pid) ? null : pid;
    }
  } catch {}
  return null;
}
function removePid() {
  const pidPath = getPidPath();
  try {
    if (existsSync2(pidPath)) {
      unlinkSync(pidPath);
    }
  } catch {}
}
function isProcessRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
function getPort(portOverride) {
  if (portOverride) {
    const port = parseInt(portOverride, 10);
    if (!isNaN(port))
      return port;
  }
  if (process.env.PORT) {
    const port = parseInt(process.env.PORT, 10);
    if (!isNaN(port))
      return port;
  }
  return 3333;
}

// cli/src/commands/up.ts
function getPackageRoot() {
  const currentFile = fileURLToPath(import.meta.url);
  return dirname2(dirname2(dirname2(currentFile)));
}
async function handleUpCommand(flags) {
  const existingPid = readPid();
  if (existingPid && isProcessRunning(existingPid)) {
    throw new CliError("ALREADY_RUNNING", `Vibora server is already running (PID: ${existingPid})`, ExitCodes.ERROR);
  }
  const port = getPort(flags.port);
  const packageRoot = getPackageRoot();
  const serverPath = join3(packageRoot, "server", "index.js");
  const ptyLibPath = join3(packageRoot, "lib", "librust_pty.so");
  console.error("Starting Vibora server...");
  const serverProc = spawn("bun", [serverPath], {
    detached: true,
    stdio: "ignore",
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: port.toString(),
      VIBORA_PACKAGE_ROOT: packageRoot,
      BUN_PTY_LIB: ptyLibPath
    }
  });
  serverProc.unref();
  const pid = serverProc.pid;
  if (!pid) {
    throw new CliError("START_FAILED", "Failed to start server process", ExitCodes.ERROR);
  }
  writePid(pid);
  await new Promise((resolve) => setTimeout(resolve, 1000));
  if (!isProcessRunning(pid)) {
    throw new CliError("START_FAILED", "Server process died immediately after starting", ExitCodes.ERROR);
  }
  output({
    pid,
    port,
    url: `http://localhost:${port}`
  });
}

// cli/src/commands/down.ts
async function handleDownCommand() {
  const pid = readPid();
  if (!pid) {
    throw new CliError("NOT_RUNNING", "No PID file found. Vibora server may not be running.", ExitCodes.ERROR);
  }
  if (!isProcessRunning(pid)) {
    removePid();
    output({ stopped: true, pid, wasRunning: false });
    return;
  }
  try {
    process.kill(pid, "SIGTERM");
  } catch (err) {
    throw new CliError("KILL_FAILED", `Failed to stop server (PID: ${pid}): ${err}`, ExitCodes.ERROR);
  }
  let attempts = 0;
  while (attempts < 50 && isProcessRunning(pid)) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    attempts++;
  }
  if (isProcessRunning(pid)) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {}
  }
  removePid();
  output({ stopped: true, pid, wasRunning: true });
}

// cli/src/commands/status.ts
async function handleStatusCommand(flags) {
  const pid = readPid();
  const port = getPort(flags.port);
  const serverUrl = discoverServerUrl(flags.url, flags.port);
  const pidRunning = pid !== null && isProcessRunning(pid);
  let healthOk = false;
  if (pidRunning) {
    try {
      const res = await fetch(`${serverUrl}/health`, { signal: AbortSignal.timeout(2000) });
      healthOk = res.ok;
    } catch {}
  }
  output({
    running: pidRunning,
    healthy: healthOk,
    pid: pid || null,
    port,
    url: serverUrl
  });
}

// cli/src/commands/git.ts
async function handleGitCommand(action, flags) {
  const client = new ViboraClient(flags.url, flags.port);
  switch (action) {
    case "status": {
      const path = flags.path || process.cwd();
      const status = await client.getStatus(path);
      output(status);
      break;
    }
    case "diff": {
      const path = flags.path || process.cwd();
      const diff = await client.getDiff(path, {
        staged: flags.staged === "true",
        ignoreWhitespace: flags["ignore-whitespace"] === "true",
        includeUntracked: flags["include-untracked"] === "true"
      });
      output(diff);
      break;
    }
    case "branches": {
      const repo = flags.repo;
      if (!repo) {
        throw new CliError("MISSING_REPO", "--repo is required", ExitCodes.INVALID_ARGS);
      }
      const branches = await client.getBranches(repo);
      output(branches);
      break;
    }
    default:
      throw new CliError("UNKNOWN_ACTION", `Unknown action: ${action}. Valid: status, diff, branches`, ExitCodes.INVALID_ARGS);
  }
}

// cli/src/commands/worktrees.ts
async function handleWorktreesCommand(action, flags) {
  const client = new ViboraClient(flags.url, flags.port);
  switch (action) {
    case "list": {
      const worktrees = await client.listWorktrees();
      output(worktrees);
      break;
    }
    case "delete": {
      const worktreePath = flags.path;
      if (!worktreePath) {
        throw new CliError("MISSING_PATH", "--path is required", ExitCodes.INVALID_ARGS);
      }
      const result = await client.deleteWorktree(worktreePath, flags.repo);
      output(result);
      break;
    }
    default:
      throw new CliError("UNKNOWN_ACTION", `Unknown action: ${action}. Valid: list, delete`, ExitCodes.INVALID_ARGS);
  }
}

// cli/src/commands/config.ts
async function handleConfigCommand(action, positional, flags) {
  const client = new ViboraClient(flags.url, flags.port);
  switch (action) {
    case "get": {
      const [key] = positional;
      if (!key) {
        throw new CliError("MISSING_KEY", "Config key is required", ExitCodes.INVALID_ARGS);
      }
      const config = await client.getConfig(key);
      output(config);
      break;
    }
    case "set": {
      const [key, value] = positional;
      if (!key) {
        throw new CliError("MISSING_KEY", "Config key is required", ExitCodes.INVALID_ARGS);
      }
      if (value === undefined) {
        throw new CliError("MISSING_VALUE", "Config value is required", ExitCodes.INVALID_ARGS);
      }
      const parsedValue = /^\d+$/.test(value) ? parseInt(value, 10) : value;
      const config = await client.setConfig(key, parsedValue);
      output(config);
      break;
    }
    case "reset": {
      const [key] = positional;
      if (!key) {
        throw new CliError("MISSING_KEY", "Config key is required", ExitCodes.INVALID_ARGS);
      }
      const config = await client.resetConfig(key);
      output(config);
      break;
    }
    default:
      throw new CliError("UNKNOWN_ACTION", `Unknown action: ${action}. Valid: get, set, reset`, ExitCodes.INVALID_ARGS);
  }
}

// cli/src/commands/health.ts
async function handleHealthCommand(flags) {
  const client = new ViboraClient(flags.url, flags.port);
  const health = await client.health();
  output(health);
}

// cli/src/commands/hooks.ts
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { execSync } from "child_process";
import { fileURLToPath as fileURLToPath2 } from "url";
function getClaudeSettingsPath(global) {
  if (global) {
    return path.join(os.homedir(), ".claude", "settings.json");
  }
  return path.join(process.cwd(), ".claude", "settings.json");
}
function readClaudeSettings(settingsPath) {
  if (!fs.existsSync(settingsPath)) {
    return {};
  }
  try {
    const content = fs.readFileSync(settingsPath, "utf-8");
    return JSON.parse(content);
  } catch {
    return {};
  }
}
function writeClaudeSettings(settingsPath, settings) {
  const dir = path.dirname(settingsPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), "utf-8");
}
function getViboraHookPath() {
  const currentFile = fileURLToPath2(import.meta.url);
  const scriptDir = path.dirname(currentFile);
  const possiblePaths = [
    path.join(scriptDir, "..", "scripts", "vibora-plan-complete-hook"),
    path.join(scriptDir, "..", "..", "scripts", "vibora-plan-complete-hook"),
    "vibora-plan-complete-hook"
  ];
  for (const p of possiblePaths) {
    if (p === "vibora-plan-complete-hook") {
      try {
        execSync("which vibora-plan-complete-hook", { stdio: "pipe" });
        return "vibora-plan-complete-hook";
      } catch {
        continue;
      }
    } else if (fs.existsSync(p)) {
      return path.resolve(p);
    }
  }
  return "vibora-plan-complete-hook";
}
function installStopHook(global) {
  const settingsPath = getClaudeSettingsPath(global);
  const settings = readClaudeSettings(settingsPath);
  const hookCommand = getViboraHookPath();
  if (!settings.hooks) {
    settings.hooks = {};
  }
  const existingStopHooks = settings.hooks.Stop || [];
  const hasViboraHook = existingStopHooks.some((hook) => hook.hooks.some((h) => h.type === "command" && h.command?.includes("vibora-plan-complete-hook")));
  if (hasViboraHook) {
    return { settingsPath, hookCommand };
  }
  settings.hooks.Stop = [
    ...existingStopHooks,
    {
      hooks: [
        {
          type: "command",
          command: hookCommand
        }
      ]
    }
  ];
  writeClaudeSettings(settingsPath, settings);
  return { settingsPath, hookCommand };
}
function uninstallStopHook(global) {
  const settingsPath = getClaudeSettingsPath(global);
  const settings = readClaudeSettings(settingsPath);
  if (!settings.hooks?.Stop) {
    return { settingsPath, removed: false };
  }
  const originalLength = settings.hooks.Stop.length;
  settings.hooks.Stop = settings.hooks.Stop.filter((hook) => !hook.hooks.some((h) => h.type === "command" && h.command?.includes("vibora-plan-complete-hook")));
  const removed = settings.hooks.Stop.length < originalLength;
  if (removed) {
    if (settings.hooks.Stop.length === 0) {
      delete settings.hooks.Stop;
    }
    if (Object.keys(settings.hooks).length === 0) {
      delete settings.hooks;
    }
    writeClaudeSettings(settingsPath, settings);
  }
  return { settingsPath, removed };
}
function checkStopHook(global) {
  const settingsPath = getClaudeSettingsPath(global);
  const settings = readClaudeSettings(settingsPath);
  if (!settings.hooks?.Stop) {
    return { installed: false, settingsPath };
  }
  for (const hook of settings.hooks.Stop) {
    for (const h of hook.hooks) {
      if (h.type === "command" && h.command?.includes("vibora-plan-complete-hook")) {
        return { installed: true, settingsPath, hookCommand: h.command };
      }
    }
  }
  return { installed: false, settingsPath };
}
async function handleHooksCommand(action, _rest, flags) {
  const global = flags.global === "true" || flags.g === "true";
  switch (action) {
    case "install": {
      const { settingsPath, hookCommand } = installStopHook(global);
      if (isPrettyOutput()) {
        prettyLog("success", `Installed Vibora Stop hook`);
        prettyLog("info", `  Settings: ${settingsPath}`);
        prettyLog("info", `  Command: ${hookCommand}`);
        prettyLog("info", "");
        prettyLog("info", "The hook will automatically transition tasks to IN_REVIEW");
        prettyLog("info", "when Claude Code finishes in a Vibora worktree.");
      } else {
        outputSuccess({
          action: "install",
          settingsPath,
          hookCommand,
          message: "Stop hook installed successfully"
        });
      }
      break;
    }
    case "uninstall": {
      const { settingsPath, removed } = uninstallStopHook(global);
      if (isPrettyOutput()) {
        if (removed) {
          prettyLog("success", `Removed Vibora Stop hook from ${settingsPath}`);
        } else {
          prettyLog("info", "Vibora Stop hook was not installed");
        }
      } else {
        outputSuccess({
          action: "uninstall",
          settingsPath,
          removed
        });
      }
      break;
    }
    case "status": {
      const { installed, settingsPath, hookCommand } = checkStopHook(global);
      if (isPrettyOutput()) {
        if (installed) {
          prettyLog("success", "Vibora Stop hook is installed");
          prettyLog("info", `  Settings: ${settingsPath}`);
          prettyLog("info", `  Command: ${hookCommand}`);
        } else {
          prettyLog("info", "Vibora Stop hook is not installed");
          prettyLog("info", `  Settings: ${settingsPath}`);
          prettyLog("info", "");
          prettyLog("info", 'Run "vibora hooks install" to install it.');
        }
      } else {
        outputSuccess({
          action: "status",
          installed,
          settingsPath,
          hookCommand
        });
      }
      break;
    }
    default:
      if (isPrettyOutput()) {
        console.log(`Usage: vibora hooks <action> [--global]

Actions:
  install     Install the Stop hook for auto task transitions
  uninstall   Remove the Stop hook
  status      Check if the Stop hook is installed

Options:
  --global    Use global Claude settings (~/.claude/settings.json)
              Default is project-local (.claude/settings.json)

The Stop hook automatically transitions tasks from IN_PROGRESS to IN_REVIEW
when Claude Code finishes in a Vibora worktree.`);
      } else {
        throw new CliError("INVALID_ACTION", `Invalid hooks action: ${action}. Use install, uninstall, or status.`, ExitCodes.INVALID_ARGS);
      }
  }
}

// cli/src/index.ts
var VERSION = "0.1.0";
function parseArgs(args) {
  const positional = [];
  const flags = {};
  for (let i = 0;i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const eqIndex = arg.indexOf("=");
      if (eqIndex !== -1) {
        const key = arg.slice(2, eqIndex);
        const value = arg.slice(eqIndex + 1);
        flags[key] = value;
      } else {
        const key = arg.slice(2);
        const nextArg = args[i + 1];
        if (nextArg && !nextArg.startsWith("--")) {
          flags[key] = nextArg;
          i++;
        } else {
          flags[key] = "true";
        }
      }
    } else {
      positional.push(arg);
    }
  }
  return { positional, flags };
}
async function main() {
  const args = process.argv.slice(2);
  const { positional, flags } = parseArgs(args);
  if (flags.pretty) {
    setPrettyOutput(true);
  }
  const [command, ...rest] = positional;
  if (flags.version || command === "--version") {
    console.log(JSON.stringify({ success: true, data: { version: VERSION } }));
    process.exit(0);
  }
  if (flags.help || command === "--help" || !command) {
    console.log(`vibora CLI v${VERSION}

Usage: vibora <command> [options]

Commands:
  current-task              Get task for current worktree
  current-task pr <url>     Associate a PR with current task
  current-task in-progress  Mark current task as IN_PROGRESS
  current-task review       Mark current task as IN_REVIEW
  current-task done         Mark current task as DONE
  current-task cancel       Mark current task as CANCELED

  tasks list                List all tasks
  tasks get <id>            Get a task by ID
  tasks create              Create a new task
  tasks update <id>         Update a task
  tasks move <id>           Move task to different status
  tasks delete <id>         Delete a task

  up                        Start Vibora server (daemon)
  down                      Stop Vibora server
  status                    Check if server is running

  git status                Get git status for worktree
  git diff                  Get git diff for worktree
  git branches              List branches in a repo

  worktrees list            List all worktrees
  worktrees delete          Delete a worktree

  config get <key>          Get a config value
  config set <key> <value>  Set a config value

  hooks install             Install Claude Code Stop hook
  hooks uninstall           Remove Claude Code Stop hook
  hooks status              Check if Stop hook is installed

  health                    Check server health

Global Options:
  --port=<port>     Server port (default: 3333)
  --url=<url>       Override full server URL
  --pretty          Pretty-print JSON output
  --version         Show version
  --help            Show this help

Examples:
  vibora current-task                    # Get current task info
  vibora current-task review             # Mark current task as IN_REVIEW
  vibora tasks list --status=IN_PROGRESS # List in-progress tasks
  vibora tasks create --title="My Task" --repo=/path/to/repo
`);
    process.exit(0);
  }
  try {
    switch (command) {
      case "current-task": {
        const [action, ...actionRest] = rest;
        await handleCurrentTaskCommand(action, actionRest, flags);
        break;
      }
      case "tasks": {
        const [action, ...taskRest] = rest;
        await handleTasksCommand(action, taskRest, flags);
        break;
      }
      case "up": {
        await handleUpCommand(flags);
        break;
      }
      case "down": {
        await handleDownCommand();
        break;
      }
      case "status": {
        await handleStatusCommand(flags);
        break;
      }
      case "git": {
        const [action] = rest;
        await handleGitCommand(action, flags);
        break;
      }
      case "worktrees": {
        const [action] = rest;
        await handleWorktreesCommand(action, flags);
        break;
      }
      case "config": {
        const [action, ...configRest] = rest;
        await handleConfigCommand(action, configRest, flags);
        break;
      }
      case "health": {
        await handleHealthCommand(flags);
        break;
      }
      case "hooks": {
        const [action, ...hooksRest] = rest;
        await handleHooksCommand(action, hooksRest, flags);
        break;
      }
      default:
        throw new CliError("UNKNOWN_COMMAND", `Unknown command: ${command}`, ExitCodes.INVALID_ARGS);
    }
  } catch (err) {
    if (err instanceof CliError) {
      outputError(err);
    }
    throw err;
  }
}
main();
