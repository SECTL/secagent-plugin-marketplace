# SecAgent Plugin Marketplace

The marketplace accepts both native SecAgent plugin packages and Agent Plugins 1.0.0 packages. Agent Plugin entries use `format: "agent"` and point to a ZIP containing `plugin.json`, `skills/`, and optionally `mcp.json`.

这是独立的插件市场索引仓库，不保存插件实现。当前索引包含 SecAgent 的 ClassIsland 联动插件，并指向其 GitHub Release 资产。

客户端流程：下载 `index.json` → 校验索引签名 → 选择与宿主兼容的版本 → 下载 Release zip → 校验 SHA-256 与资产签名 → 安装。
