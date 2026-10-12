# Zeus 项目记忆(2026-10-12)

> 本文件随项目携带。在新目录打开 AI 助手时,先读这份文件恢复上下文。
> 会话记忆(旧工作区 zcodechat)已同步更新路径,但新工作区的记忆是空的 —— 以本文件为准。

## 这是什么

基于 **AionUi v2.2.2(Apache-2.0)** 二开的 Windows 多 agent 桌面应用 **Zeus**:Claude Code + OpenCode 双引擎**完全隔离**(用户机器上有全局安装,app 内置独立副本互不干扰),集成 open-design 设计 MCP、17 个知识工作插件 + docx/xlsx/pptx/pdf 文档技能、Team Mode 多 agent 并行。设计参考腾讯 WorkBuddy:中性无彩主色 #1F2328 + 薄荷色调次级背景 + 白卡片 + 20px 圆角输入胶囊。**agent 目录固定三引擎**(2026-10-12 定稿):Zeus(内置 aionrs)/ Claude Code / OpenCode,其余 agent、butler 管家、所有创建入口已删(见下)。

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

- **知识工作技能全量内置 + 三模式预设(2026-10-12 第三轮)**:anthropics/knowledge-work-plugins 全部 22 插件 225 个 skill 以 `AionCore/scripts/vendor-knowledge-work-plugins.py` 从 clone 扁平 vendor 进 `AionCore/crates/aionui-app/assets/builtin-skills/`(目录名=frontmatter name=`<插件>-<技能>`,如 `sales-call-prep`;归因文件 knowledge-work-ATTRIBUTION.md/-LICENSE 在语料根;脚本幂等、写后复验 frontmatter、撞名即失败)。走 app 自带 skill 系统(编译期 include_dir → 启动物化 → 目录同步,**无需迁移**),三个 generated 助手按模式预置:`crates/aionui-assistant/src/zeus_mode_presets.rs`(办公/OpenCode=176、设计/aionrs=18 含 data 可视化三件套、开发/Claude=62 含 zoom-plugin 30 个建集成技能;reconcile 创建分支注入)+ `migrations/046_zeus_mode_skill_presets.sql`(存量库三条空 default_skill_ids='[]' 的行按 backend/agent_type 补齐,只在未动过时写)。**技能名而非 id 入库**——快照/preset/LOAD_SKILL 全链路用名字,跨机器稳定。Guid 页两处配套:`handleToggleSkill` 非 auto 分支的基底从 `prev ?? []` 改为 `prev ?? resolvedAssistantDefaults.skillIds`(否则第一次勾选会把整套预置顶掉),动作行 `enabledSkills` 显示同步改为默认值,预置技能在勾选器里可见且已勾。`isolatedRuntime/plugins.ts` 撤掉 17 个 kwp 的 marketplace 安装(改网络安装为本地语料,避免 claude 侧双重技能;只留 document-skills + 镜像 4 个文档技能给 OpenCode),IsolatedRuntimeCard 注释与 zh/en `pluginsDone` 文案更新。护栏测试:`skill_service.rs` 的 `knowledge_work_corpus_shape_is_pinned`(225/22 个前缀、frontmatter name=目录名)+ presets 唯一性/前缀测试 + `bootstrap_materializes_generated_assistant_from_available_agent` 改断言 DEV 预置。技能索引体积:办公 ~40KB(~1 万 token/会话,注入通道 per-session 成本,可接受;Claude 走 argv 无此成本)。**语料更新后的首启目录竞态(2026-10-12 实证)**:指纹变化那一启,startup 同步只扫到部分新目录(225 中 141 入库),第二启每次启动的重同步补齐到 252;会话不受影响——`resolve_skill_source_path_with_repo_for_user` 有 `builtin-skills/<名字>` 扁平回退,预置技能照样全量解析,缺口只在技能中心列表显示一启。更新语料后看到 hub 少技能先重启一次再排查。运行时验证记录:046 应用 ✓、三助手预置 176/62/18 ✓、运行时 builtin-skills 物化 246 目录 ✓、二启目录 252 行 ✓。

- **三引擎定稿(2026-10-12 第二轮)**:agent/助手目录全端只留 Zeus(aionrs)/Claude Code/OpenCode。前端删:助手页「新建助手」按钮+官方助手 Tab+「Created by you」分组(AssistantHomeTabs/MyAssistantsList/OfficialAssistantsGrid 删)、Agent 管理页自定义 agent 区块+kimi 置顶(InlineAgentEditor/AgentHubModal/useHubAgents 删)、全部 butler 入口(TalkToButlerButton/useTalkToButler/ButlerDiagnoseButton 删;模型/工具/WebUI/技能/定时任务/反馈/聊天错误提示等约 12 处调用点改为直接执行手动动作);AssistantListPanel(死代码)删。AionCore:`migrations/045_zeus_keep_only_core_three_agents.sql` 删 agent_metadata 39 个 builtin 行(只留 2d23ff1c/53861a53/632f31d2)+ assistant_definitions 里全部 builtin(含 butler)与非三引擎 generated + 孤儿 overlays/preferences;builtin-assistants 清单清空(资产已删,builtin.rs 测试改断言空)。注意 sqlx 校验和——已应用迁移不能改,只能加新的;011/023/025/029/031/034 追加过 001 之外的 builtin,删除要按 agent_id 白名单而非枚举。

- **三模式首页(2026-10-12)**:首页输入框上方助手选择条改为**三个固定模式胶囊**——办公(OpenCode)/设计(Zeus 内置 aionrs)/开发(Claude Code),见 `guid/components/AssistantSelectionArea.tsx`(按 generated 助手的 acp_backend 匹配,其余条目一律不显示);标签 i18n 在 13 个 locale 的 `guid.json` `workspaceTab` 下;测试 `tests/unit/renderer/hooks/guidAssistantSelectionArea.dom.test.tsx`。同时**内置助手清到只剩 butler**:`AionCore/.../builtin-assistants/assistants.json` 只留 `aionui-assistant`(设置页 TalkToButler 按钮依赖),20 个知识工作助手 + 59 个 rule 文件 + 19 个头像已删(内容可从 git initial commit db8e4e8 取回);`builtin.rs` 的 6 处嵌入式资产断言已改指 butler。有价值的规则/技能已导出到**全局 opencode** `~/.config/opencode/skills/`:officecli-docx/xlsx/pptx、pdf、mermaid(原样复制)+ planning-with-files、ui-ux-pro-max(手工转成自包含 SKILL.md,后者只保留专业规则+检查清单,设计数据库本来就没随包)。
- `packages/desktop/src/process/isolatedRuntime/`(新增,6 文件):paths / ensureRuntime(二进制下载)/ agentOverrides(PUT /api/agents/{id}/overrides 注入 CLAUDE_CONFIG_DIR、OPENCODE_CONFIG_DIR、XDG_*)/ plugins(18 插件安装+技能同步)/ openDesignMcp(ELECTRON_RUN_AS_NODE 跑 Open Design 的 daemon-cli.mjs mcp)/ index;挂在 index.ts 的 markBackendReady
- 品牌:Titlebar/Layout(侧栏 logo 换 img 'Zeus')、登录页 assets/logos/brand/app.png、About、91 个 locale "AionUi"→"Zeus"、34 个 locale "Aion CLI"→"Zeus"、index.html、tray、manifest.webmanifest + pwa 图标
- 主题:main.tsx primaryColor #1F2328;default-color-scheme.css --primary/--bg-1/--bg-hover/--message-*-bg 薄荷中性系
- 构建:package.json productName Zeus;electron-builder.yml productName/executableName;build-with-builder.js Zeus.exe
- AionCore:新增 `crates/aionui-db/migrations/044_rebrand_internal_agent_zeus.sql`(内置 agent 改名 Zeus);`aionui-assets/assets/logos/brand/aion.svg` 换成内嵌 zeus 插画

## 关键坑

0. **bash 环境有 `ELECTRON_RUN_AS_NODE=1`(2026-10-12 踩)**:本机 bash profile 给所有子进程注入该变量(Open Design MCP 相关),从终端启动/验证 Zeus.exe 时 Electron 会以纯 Node 模式秒退(退出码 0、零日志、零窗口),酷似打包损坏——其实 exe 没问题。验证启动必须 `env -u ELECTRON_RUN_AS_NODE ./Zeus.exe`;该变量不在用户级/系统级,只污染 shell 会话。另:exe 的 asar 完整性校验 fuse 本来就是 Disabled,别往那个方向排查。
0. **前端遗留失败测试(2026-10-12 存量,与三引擎改动无关)**:`AssistantSelectionArea.dom.test`(4)、`documentTitle`(2)、`useDesktopTurnNotification`(4)、`LayoutSiderBrandHome`(3)、`releasePackagingConfig`(1)、`buildWithBuilder.test`(3,源於工作区里未提交的 build-with-builder.js 手改)、`imageGenCore`(3)共 19 个在 HEAD 上就红;另有 `isolatedRuntime/index.ts:81` 的 TS7011 也是 HEAD 遗留。Rust 侧同样有 HEAD 存量红(2026-10-12 干净 worktree 实证):aionui-extension 的 `lifecycle::tests::test_execute_hook_*`(4,钩子执行)与 `import_skills_replaces_dangling_link_with_copy`(1,符号链接权限)共 5 个,aionui-conversation 的 `create_rejects_unavailable_workspace_with_trailing_whitespace_in_request` 与 `is_auto_workspace_matches_by_structure_across_user_and_date`(2,Windows 路径语义:尾随空格被系统归一、路径分隔符结构匹配),均 Windows 环境相关;勿误归因到后续改动。
0. **opencode 隔离环境默认模型已弃用(2026-10-11 修)**:隔离 opencode 无配置时内置默认 `exo-free` 已被官方下架(410 ModelDeprecated),发消息必失败。修复 = 写 `agents/opencode/config/opencode.json` 的 `"model": "opencode/big-pickle"`(免费可用);已固化进 ensureRuntime.ts(ensureDefaultOpencodeModel,只写缺不覆盖)。诊断命令:带隔离 env 跑 `opencode run "hi" --format json` 看真实报错。全局 opencode 实测一直正常(同模型 big-pickle)。
1. **打包用错后端**:`prepare-aioncore.js` 默认从 GitHub release 拉 aioncore,`AIONUI_BACKEND_LOCAL_BINARY` 只是降级选项(下载成功就用不上),手动 `cp` 进 out/ 也只救 win-unpacked 不救安装包——**唯一让两者都带本地后端的办法是 `AIONUI_BACKEND_LOCAL_BUNDLE_DIR` 指向含 `aioncore.exe + managed-resources/` 的完整目录**(2026-10-12 实证,优先级高于下载;managed-resources 可直接复用 resources/ 下已有的)。完整打包命令:`AIONUI_HUB_SKIP=1 AIONUI_BACKEND_LOCAL_BUNDLE_DIR=<bundle目录> bun run dist:win`(hub 市场界面已删,网络差时 hub 步骤会 fatal,务必带上 SKIP)。注意 `--prepackaged` 直跑 electron-builder 生成安装包会被上游模板的 warning-as-error 卡死,别走那条路。另:仓库根的 `package.json` 别在 AionUi 目录里跑 `bunx asar extract-file`——它把解出的文件写到当前目录,会覆盖仓库文件(踩过,git checkout 恢复)。
2. **隔离验证手段**:app 内 spawn 后查 `~/.claude`、`~/.config/opencode`、`~/.local/share/opencode` 无新写入即隔离完好;aioncore API(127.0.0.1:端口,/api/agents/management)可查 overrides 状态。
3. app 内需单独登录/填 API key(隔离本意);第三方 agent(Claude Code 等)显示名是各自品牌,属正常。
4. 未签名 exe 首跑弹 SmartScreen 属正常。
5. **build-with-builder.js 降级重试会丢图标**(2026-10-12 踩过):Windows 本地打包若 exe 资源写入步骤失败(典型:打包时 Zeus.exe 在运行文件被锁/杀软瞬时占用),脚本自动用 `win.signAndEditExecutable=false` 重打——exe 能跑但穿原生 Electron 图标、元数据全是 Electron 37.x/GitHub(electron-builder 26 的 resEdit 阶段被跳过)。判别:`(Get-Item Zeus.exe).VersionInfo.ProductName` 是 Electron 即中招。修复(免重打包,秒级):用 app-builder-lib 自带 `out/util/resEdit.js` 的 `editWindowsResources` 原位补——iconPath 用 `AionUi/resources/app.ico`(即 zeus-icon),versionStrings 照 electron-builder 映射(FileDescription/ProductName=Zeus、LegalCopyright 照 yml、InternalName=Zeus、OriginalFilename=""、CompanyName=author.name=AionUi、版本 2.2.2);装包可 `bunx electron-builder --config packages/desktop/electron-builder.yml --win nsis --x64 --prepackaged out/win-unpacked --publish=never` 从修好的 win-unpacked 重生成。预防:打包前关掉 Zeus。
6. **白屏排查路径 + asar 清单陷阱(2026-10-12 踩过,耗时一小时)**:症状 = 窗口纯白,主进程/后端全正常。**先**跑 `env -u ELECTRON_RUN_AS_NODE ./Zeus.exe --enable-logging=stderr` 抓 renderer 的 Uncaught(本例:`Cannot access 'G' before initialization`,GuidPage 里 useCallback 依赖数组引用了声明在后的 `resolvedAssistantDefaults` —— deps 在调用时立即求值,TDZ 崩首渲染;函数必须挪到依赖定义之后)。**别**用 `bunx @electron/asar list | grep "^\\\\out"` 判断 asar 缺文件——list 输出带前导反斜杠且转义极易写错,会得出"asar 缺 out/renderer"的假结论(asar 其实一直完整;electron-builder 26 + bun.lock + workspace 收集器全是被冤枉排查的)。权威检查用 node API:`asar.listPackage(p)` + 自行 normalize 前导分隔符,或 `asar.extractFile(asar,'out/renderer/index.html')` 直接验证。vite 产物在 `AionUi/out/renderer/assets/`,崩溃 chunk 名会直接指向源文件所在模块,配合 `--enable-logging` 的 source 行号定位。

## 环境

Node 24 / Bun 1.3 / Rust 1.99 MSVC(aioncore 在 ~/.cargo/bin)/ VS Build Tools 2022 / 代理 127.0.0.1:8086(闪电猫)。旧工作区 `Desktop\zcodechat` 只剩个人文件 + `runtime-staging\`(约 800MB 下载残留,可删)。
