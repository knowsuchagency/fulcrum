# OpenCode

Vibora 的 OpenCode 集成实现了 AI 编程会话与任务管理之间的深度集成。

## 安装

运行以下命令全局安装插件：

```bash
vibora opencode install
```

这会安装两个组件：

1. **状态同步插件** 位于 `~/.config/opencode/plugin/vibora.ts`
2. **MCP 服务器配置** 位于 `~/.opencode/opencode.json`

启动 OpenCode 时会自动加载。

## 卸载

移除 Vibora 集成：

```bash
vibora opencode uninstall
```

这会同时移除插件文件和 MCP 服务器配置。

## 功能

### 自动状态同步

在任务工作树中工作时：

- **您发送消息** → 任务移至"进行中"
- **Agent 完成/空闲** → 任务移至"待审核"

这一切自动发生——无需手动更新状态。

### MCP 工具

插件配置一个 MCP 服务器，让 OpenCode 可以访问任务管理工具：

- **任务管理** — 创建、列出、更新和移动任务
- **仓库访问** — 列出已配置的仓库
- **通知** — 向已启用的渠道发送通知
- **远程执行** — 在 Vibora 服务器上执行命令

完整工具列表请参见 [MCP 工具参考](/zh/reference/mcp-tools)。

### 智能检测

插件自动检测是否在 Vibora 任务环境中运行（通过环境变量或目录检测）。如果不在任务中，会完全禁用自身以避免开销。

## 故障排除

如果插件似乎不工作：

1. 确保 Vibora 服务器正在运行（`vibora up`）。
2. 确保您已安装插件（`vibora opencode install`）。
3. 重启 OpenCode 以重新加载插件。
4. 检查 `~/.opencode/opencode.json` 是否包含 `vibora` MCP 条目。

### 手动 MCP 配置

如果自动安装无法修改您的 `opencode.json`（例如由于解析错误），请手动添加 MCP 服务器：

```json
{
  "mcp": {
    "vibora": {
      "type": "local",
      "command": ["vibora", "mcp"],
      "enabled": true
    }
  }
}
```
