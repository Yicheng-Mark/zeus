# Zeus 项目记忆(2026-10-10)

> 本文件随项目携带。在新目录打开 AI 助手时,先读这份文件恢复上下文。
> 会话记忆(旧工作区 zcodechat)已同步更新路径,但新工作区的记忆是空的 —— 以本文件为准。

## 这是什么

基于 **AionUi v2.2.2(Apache-2.0)** 二开的 Windows 多 agent 桌面应用 **Zeus**:Claude Code + OpenCode 双引擎**完全隔离**(用户机器上有全局安装,app 内置独立副本互不干扰),集成 open-design 设计 MCP、17 个知识工作插件 + docx/xlsx/pptx/pdf 文档技能、Team Mode 多 agent 并行。设计参考腾讯 WorkBuddy:中性无彩主色 #1F2328 + 薄荷色调次级背景 + 白卡片 + 20px 圆角输入胶囊。

## 目录

| 路径 | 内容 |
|---|---|
| `AionUi\` | Electron 前端 fork(bun + electron-vite;改动点见下) |
| `AionCore\` | Rust 后端 fork v0.2.2(cargo;已加迁移 044 改内置 agent 名) |
| `zeus-assets\zeus-icon.{png,ico}` | 用户提供的图标源(黑白耳机动漫插画,所有图标均由此生成) |
| `AionUi\out\win-unpacked\Zeus.exe` | **运行版**(桌面快捷方式指向这里) |
| `AionUi\out\Zeus-2.2.2-win-x64.exe` | 安装包(注意:其后端是 GitHub 官方版,见"坑") |

隔离运行时(与代码无关,勿删):`%LOCALAPPDATA%\AionUiAgent\`(runtime\ 两个 exe + agents\ 隔离配置/插件);应用数据:`%APPDATA%\Zeus\`。

## 代码改动清单(AionUi)

- **三模式首页(2026-10-12)**:首页输入框上方助手选择条改为**三个固定模式胶囊**——办公(OpenCode)/设计(Zeus 内置 aionrs)/开发(Claude Code),见 `guid/components/AssistantSelectionArea.tsx`(按 generated 助手的 acp_backend 匹配,其余条目一律不显示);标签 i18n 在 13 个 locale 的 `guid.json` `workspaceTab` 下;测试 `tests/unit/renderer/hooks/guidAssistantSelectionArea.dom.test.tsx`。同时**内置助手清到只剩 butler**:`AionCore/.../builtin-assistants/assistants.json` 只留 `aionui-assistant`(设置页 TalkToButler 按钮依赖),20 个知识工作助手 + 59 个 rule 文件 + 19 个头像已删(内容可从 git initial commit db8e4e8 取回);`builtin.rs` 的 6 处嵌入式资产断言已改指 butler。有价值的规则/技能已导出到**全局 opencode** `~/.config/opencode/skills/`:officecli-docx/xlsx/pptx、pdf、mermaid(原样复制)+ planning-with-files、ui-ux-pro-max(手工转成自包含 SKILL.md,后者只保留专业规则+检查清单,设计数据库本来就没随包)。
- `packages/desktop/src/process/isolatedRuntime/`(新增,6 文件):paths / ensureRuntime(二进制下载)/ agentOverrides(PUT /api/agents/{id}/overrides 注入 CLAUDE_CONFIG_DIR、OPENCODE_CONFIG_DIR、XDG_*)/ plugins(18 插件安装+技能同步)/ openDesignMcp(ELECTRON_RUN_AS_NODE 跑 Open Design 的 daemon-cli.mjs mcp)/ index;挂在 index.ts 的 markBackendReady
- 品牌:Titlebar/Layout(侧栏 logo 换 img 'Zeus')、登录页 assets/logos/brand/app.png、About、91 个 locale "AionUi"→"Zeus"、34 个 locale "Aion CLI"→"Zeus"、index.html、tray、manifest.webmanifest + pwa 图标
- 主题:main.tsx primaryColor #1F2328;default-color-scheme.css --primary/--bg-1/--bg-hover/--message-*-bg 薄荷中性系
- 构建:package.json productName Zeus;electron-builder.yml productName/executableName;build-with-builder.js Zeus.exe
- AionCore:新增 `crates/aionui-db/migrations/044_rebrand_internal_agent_zeus.sql`(内置 agent 改名 Zeus);`aionui-assets/assets/logos/brand/aion.svg` 换成内嵌 zeus 插画

## 关键坑

0. **opencode 隔离环境默认模型已弃用(2026-10-11 修)**:隔离 opencode 无配置时内置默认 `exo-free` 已被官方下架(410 ModelDeprecated),发消息必失败。修复 = 写 `agents/opencode/config/opencode.json` 的 `"model": "opencode/big-pickle"`(免费可用);已固化进 ensureRuntime.ts(ensureDefaultOpencodeModel,只写缺不覆盖)。诊断命令:带隔离 env 跑 `opencode run "hi" --format json` 看真实报错。全局 opencode 实测一直正常(同模型 big-pickle)。
1. **打包用错后端**:`prepare-aioncore.js` 默认从 GitHub release 拉 aioncore,`AIONUI_BACKEND_LOCAL_BINARY` 只是降级选项。改了 AionCore 后重打包:先 `cargo install --path crates/aionui-app --locked`,再打包后手动 `cp ~/.cargo/bin/aioncore.exe AionUi/out/win-unpacked/resources/bundled-aioncore/win32-x64/`(或设 `AIONUI_BACKEND_LOCAL_BUNDLE_DIR` 指向完整 bundle)。
2. **隔离验证手段**:app 内 spawn 后查 `~/.claude`、`~/.config/opencode`、`~/.local/share/opencode` 无新写入即隔离完好;aioncore API(127.0.0.1:端口,/api/agents/management)可查 overrides 状态。
3. app 内需单独登录/填 API key(隔离本意);第三方 agent(Claude Code 等)显示名是各自品牌,属正常。
4. 未签名 exe 首跑弹 SmartScreen 属正常。

## 环境

Node 24 / Bun 1.3 / Rust 1.99 MSVC(aioncore 在 ~/.cargo/bin)/ VS Build Tools 2022 / 代理 127.0.0.1:8086(闪电猫)。旧工作区 `Desktop\zcodechat` 只剩个人文件 + `runtime-staging\`(约 800MB 下载残留,可删)。
