<div align="center">

<img src="zeus-assets/zeus-icon.png" width="96" alt="Zeus" />

# Zeus

**Windows 多引擎 AI 桌面助手 —— 装完即用，无需预装任何环境**

[下载最新版](../../releases) · [English](#english)

</div>

## 是什么

Zeus 基于 [AionUi](https://github.com/iWangJiaxi/AionUi) 二次开发，在一个桌面应用里提供三个相互隔离的 agent 引擎：

| 模式 | 引擎 | 面向 |
|---|---|---|
| 开发 | Claude Code | 编码、调试、重构 |
| 办公 | OpenCode | 文档、报表、日常知识工作 |
| 设计 | 内置 aionrs 引擎 | 设计与通用任务 |

三个引擎的运行时全部随安装包内置，与你机器上的全局安装完全隔离（不会读写 `~/.claude`、`~/.config/opencode`）。

## 特性

- **干净机器开箱即用**：内置 Node / Python / Git / OfficeCli，安装后不需要预装环境，也不需要首次启动联网下载
- **200+ 内置知识工作技能**，覆盖 docx / xlsx / pptx / pdf 文档处理、会议准备、数据分析等场景
- **知识库**：笔记是纯 markdown 文件，`[[双链]]` 反链索引，目录可直接用 Obsidian 打开
- **多模型平台**：OpenAI 兼容端点 + Anthropic 协议端点双支持，平台可按引擎分配；自带 API key 即可使用
- **Team Mode**：多 agent 并行协作
- 界面支持 13 种语言

## 下载与安装

1. 从 [Releases](../../releases) 下载 `Zeus-x.y.z-win-x64.exe`（约 500 MB）
2. exe 未签名，首次运行 Windows SmartScreen 会拦截：点「更多信息」→「仍要运行」
3. 启动后在「设置 → 模型平台」填入你自己的 API key（支持 OpenAI 兼容 / Anthropic 协议端点，任选服务商）

要求：Windows 10/11 x64。模型服务需自行配置，应用不内置任何 key。

## 从源码构建

```bash
# 前端依赖
cd AionUi && bun install

# 后端
cd ../AionCore && cargo build --release

# 打包（LOCAL_BUNDLE_DIR 指向含 aioncore.exe + managed-resources/ 的目录）
AIONUI_HUB_SKIP=1 AIONUI_BACKEND_LOCAL_BUNDLE_DIR=<bundle目录> bun run dist:win
```

开发细节与踩坑记录见 [PROJECT-MEMORY.md](PROJECT-MEMORY.md)。

## 许可

- 本项目代码以 [Apache-2.0](LICENSE) 发布，基于 AionUi（Apache-2.0）二次开发
- 内置技能语料来自 [anthropics/knowledge-work-plugins](https://github.com/anthropics/knowledge-work-plugins)，归因文件见语料根目录
- 内置的 MinGit 以 GPLv2 许可分发（源码要约随包附带）；Claude Code 与 OpenCode 引擎版权归各自所有者

---

## English

Zeus is a Windows desktop app (a fork of [AionUi](https://github.com/iWangJiaxi/AionUi)) bundling three isolated agent engines: **Dev** (Claude Code), **Office** (OpenCode) and **Design** (built-in aionrs engine).

- Zero-dependency install: Node / Python / Git / OfficeCli are all bundled — no prerequisites, no first-run downloads. Engine runtimes are fully isolated from any global installs.
- 200+ built-in knowledge-work skills, including docx / xlsx / pptx / pdf document handling.
- Obsidian-compatible knowledge base (plain markdown files, `[[wikilinks]]`, backlink index).
- Multi-provider model setup with dual OpenAI-compatible / Anthropic-protocol endpoints, assignable per engine. Bring your own API key.
- Team Mode for parallel multi-agent work. UI in 13 languages.

**Install**: grab `Zeus-x.y.z-win-x64.exe` from [Releases](../../releases) (Windows 10/11 x64, ~500 MB). The exe is unsigned — bypass SmartScreen via "More info → Run anyway", then configure your API key in Settings.

License: Apache-2.0. See the Chinese section above for build instructions and full attribution.
