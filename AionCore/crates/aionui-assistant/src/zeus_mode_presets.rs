//! Zeus fork: skill-name presets for the three fixed mode assistants.
//!
//! Every generated (per-agent) assistant is created with the mode's preset as
//! its fixed skill default, and the conversation layer resolves the names
//! against the live catalog — so the preset mechanism is engine-owned and
//! stable across machines even while the lists themselves are empty.
//!
//! Reset to empty on 2026-10-14 (the third curation pass, migration 056): the
//! owner asked for a clean slate to reconfigure the three assistants by hand.
//! Nothing left the corpus — every curated name still ships in
//! `aionui-app/assets/builtin-skills/` and stays one toggle away in the skills
//! hub / assistant editor; only the auto-on default is gone. Refilling a list
//! means listing names and redoing the budget math in
//! `preset_sizes_stay_within_budget` below.
//!
//! The names reference builtin skills vendored under
//! `aionui-app/assets/builtin-skills/` by two scripts: the flat
//! `<plugin>-<skill>` corpus from anthropics/knowledge-work-plugins via
//! `AionCore/scripts/vendor-knowledge-work-plugins.py`, and the portable
//! personal-stack craft skills via `AionCore/scripts/vendor-personal-stack.py`
//! (see PERSONAL_STACK_SKILLS below). Names, not skill row ids: conversation
//! creation resolves names against the live catalog, which keeps the presets
//! stable across machines and reinstalls.

/// Bare vendored skill names the Zeus fork ships without a plugin prefix
/// (officecli / morph carry their own prefixes; these are standalone). Listed
/// so the prefix test below can tell them apart from typos, which is why it
/// describes the corpus rather than the presets: the two recruiters lost their
/// preset slot in the 055 pass and stay listed here for the day one comes back.
pub const ZEUS_STANDALONE_SKILLS: &[&str] = &[
    "mermaid",
    "multi-agent-orchestration",
    "pdf",
    "weixin-file-send",
    "x-recruiter",
    "xiaohongshu-recruiter",
];

/// 办公 (OpenCode): empty since the 2026-10-14 reset (migration 056).
///
/// History of this list: round 3 shipped the full business corpus (176
/// names), 054 trimmed it to the connector-free 41, 055 to the 33 whose
/// tooling the product actually ships, and the reset emptied it so the owner
/// can reconfigure from scratch. The per-name research behind the 33-name cut
/// lives in the 054/055 migration headers; every name still ships in the
/// corpus and one toggle away in the skills hub.
pub const OFFICE_MODE_SKILLS: &[&str] = &[];

/// 设计 (Zeus aionrs): empty since the 2026-10-14 reset (migration 056).
///
/// Round 3 shipped the 18 design names plus the viz-adjacent data trio; 055
/// trimmed to 12; the reset emptied the rest. Same rules as office above.
pub const DESIGN_MODE_SKILLS: &[&str] = &[];

/// 开发 (Claude Code): empty since the 2026-10-14 reset (migration 056).
///
/// Round 3 shipped 62 engineering + integration names, round 4 added the
/// personal-stack craft skills (71), 054 trimmed to 23, 055 to 22; the reset
/// emptied the rest. PERSONAL_STACK_SKILLS below still lists the vendored
/// craft skills — it describes the corpus, whose members stay one toggle
/// away in the skills hub.
pub const DEV_MODE_SKILLS: &[&str] = &[];

/// Personal-stack craft/process skills vendored by
/// `AionCore/scripts/vendor-personal-stack.py` from the author's own agent
/// backup. Bare names (no plugin prefix) — the uniqueness test below allows
/// exactly these alongside the `<plugin>-` prefixed knowledge-work names, so
/// adding a name here without vendoring the skill fails tests, and vendoring
/// one without registering it here silently shrinks the dev preset.
pub const PERSONAL_STACK_SKILLS: &[&str] = &[
    "decompose-and-execute",
    "diagnosing-bugs",
    "grilling",
    "handoff",
    "karpathy-guidelines",
    "resolving-merge-conflicts",
    "skill-security-auditor",
    "universal-scraping-architect",
    "writing-for-agents",
];

/// Mode rule bodies (the assistant's system-prompt channel — currently the
/// only per-mode prompt text in the product). Chinese-first: the fixed catalog
/// targets a zh user base, and the rule reader falls back to the locale-less
/// `<id>.md` file for every locale.
///
/// reconcile_generated_assistant seeds the matching rule ONCE when no rule
/// file exists yet; a file the user has written or edited always wins.
///
/// The OFFICE rule is stateful: it has two live bodies picked by the provider
/// lineup — [`OFFICE_MODE_RULE_FREE`] when the office engine would boot on
/// OpenCode's built-in free models (their anonymous backend rejects every
/// subagent request with 403, so Task orchestration is instructed away), and
/// [`OFFICE_MODE_RULE`] once an agent-scoped user model exists. See
/// [`provider_enables_opencode_subagents`] for the exact predicate; it mirrors
/// the Electron-side `syncOpenCode` filter in
/// `AionUi/packages/desktop/src/process/isolatedRuntime/modelProviders.ts`
/// (the same providers that get injected as `zeus-*` entries).
pub const OFFICE_MODE_RULE: &str = r#"# 角色

你是「办公」助手（OpenCode 引擎）。你的职责覆盖文档、数据、调研、运营类知识工作。

# 多 Agent 工作方式（重要）

用户已配置自有模型，Task 子 agent 可用。用户只发任务，你来编排。对任何有多个组成部分或需要读大量材料的任务：

1. 先分解任务，识别可并行的独立子任务。
2. 用 Task 工具（subagent）把子任务派发出去：无依赖的并行派发，有依赖的按顺序串行。
3. 主上下文只保留计划、各子任务的结论、最终交付物。读资料、探索、试错一律下沉给子 agent，让它们只回传 ≤10 行的结论摘要。
4. 文档产出（docx/xlsx/pptx/pdf）让子 agent 直接写文件，你只记录路径与结论。
5. 合并前验证关键结果，矛盾之处派子 agent 复核，不要自己重读原始材料。
6. 编排纪律：同时最多 4 个子 agent；同一文件在同一时间只由一个子 agent 改，冲突的拆开或串行；结论超长一律压回 ≤10 行。
7. 若 Task 派发被模型服务拒绝（如 403），说明当前所选模型不支持子 agent：立即停止派发，改为顺序执行并说明原因，不要重试。

小任务（单步可答、单文件小改）直接完成，不编排。

# 跨引擎协作（重要）

同一台机器上还有「设计」「开发」两个助手，各自是独立会话。任务明显是它们的本职（视觉/体验设计、编码调试与工程交付）时，不要硬扛，走内置助手 CLI 交接：

1. 先说明要把任务交给哪个助手，再动手。
2. 用 `"$AIONUI_HELPER_BIN" conversation create` 为目标助手新建会话：参数是一个 JSON 对象、从 stdin 传入，`name` 必填（用户语言的短名），`assistant_id` 填目标助手 id（用 `"$AIONUI_HELPER_BIN" config assistants list` 查），`workspace` 省略即沿用当前目录。响应里的 `data.id` 就是新会话 id。
3. 拿到 id 后，用 `"$AIONUI_HELPER_BIN" session send-message` 把任务投过去（同样 stdin JSON：`{"to":"<上一步的 id>","message":"<任务正文>"}`）。任务正文要写清：这是用户的委托、目标与边界、期望产出、已知结论与相关文件路径——对方看不到你这边上下文，只收到这一条消息。对方会因此自己开一轮。
4. 一次交接只投一条：不追问、不等回复、不重复投递、不代对方执行。收到 `rate_limited` 立刻停手并如实告诉用户（短时间交接太密），不要重试。被拒时照抄错误原文（例如用户关掉了跨会话消息开关），不要声称已交接。
5. 回执一段话：交给谁、新会话名与 id、投递状态（`delivered` / `queued` / 错误原文）、用户下一步在哪看结果。
6. 命令契约以 `"$AIONUI_HELPER_BIN" conversation capabilities`、`"$AIONUI_HELPER_BIN" session capabilities` 为准，不要编造子命令。

# 技能

按需加载技能（[LOAD_SKILL: <名称>]）；复杂多步任务的分解方法见 multi-agent-orchestration 技能。
"#;

/// 办公 (OpenCode) on the free tier: seeded while no agent-scoped user model
/// exists. The anonymous backend behind OpenCode's built-in free models lets
/// the main session through but rejects every subagent request, so this body
/// instructs the phase discipline instead of Task orchestration — mirroring
/// how the design rule handles having no subagent tool at all. Cross-engine
/// handoff stays: it is two local helper-CLI calls from the MAIN session, not
/// a subagent. When the user adds a usable model, the reconcile pass swaps
/// this body for [`OFFICE_MODE_RULE`] in place (see
/// [`rule_is_rewritable_shipped_text`]).
pub const OFFICE_MODE_RULE_FREE: &str = r#"# 角色

你是「办公」助手（OpenCode 引擎）。你的职责覆盖文档、数据、调研、运营类知识工作。

# 多 Agent 工作方式（重要）

当前未配置自有模型，本会话运行在免费模型上：免费档的服务端会拒绝所有子 agent 请求。本会话不派发子 agent，不尝试、不重试 Task 派发；需要别的助手时如实说明。改用严格的阶段化纪律直接完成任务：

1. 先产出工作分解：子任务清单 + 依赖关系 + 每项的产出物。
2. 逐阶段执行；每阶段结束立即把中间产物压缩成要点，再进入下一阶段——上下文里不留长篇过程。
3. 读资料先列「要看的清单 + 每项看什么」，逐项摘要，不整篇展开。
4. 文档产出（docx/xlsx/pptx/pdf）直接写文件，只记录路径与结论。
5. 合并前自行验证关键结果；交付时以工作分解为骨架汇总，标注遗留项。
6. 编排纪律（本会话无子 agent，按阶段落实）：同一文件同一时间只改一处；一次最多并行推进 4 项动作；每阶段结论 ≤10 行。

用户需要多 agent 并行编排时，提示在设置里「添加模型」配置自有模型——配置后本助手自动恢复 Task 子 agent 编排。

# 跨引擎协作（重要）

同一台机器上还有「设计」「开发」两个助手，各自是独立会话。任务明显是它们的本职（视觉/体验设计、编码调试与工程交付）时，不要硬扛，走内置助手 CLI 交接：

1. 先说明要把任务交给哪个助手，再动手。
2. 用 `"$AIONUI_HELPER_BIN" conversation create` 为目标助手新建会话：参数是一个 JSON 对象、从 stdin 传入，`name` 必填（用户语言的短名），`assistant_id` 填目标助手 id（用 `"$AIONUI_HELPER_BIN" config assistants list` 查），`workspace` 省略即沿用当前目录。响应里的 `data.id` 就是新会话 id。
3. 拿到 id 后，用 `"$AIONUI_HELPER_BIN" session send-message` 把任务投过去（同样 stdin JSON：`{"to":"<上一步的 id>","message":"<任务正文>"}`）。任务正文要写清：这是用户的委托、目标与边界、期望产出、已知结论与相关文件路径——对方看不到你这边上下文，只收到这一条消息。对方会因此自己开一轮。
4. 一次交接只投一条：不追问、不等回复、不重复投递、不代对方执行。收到 `rate_limited` 立刻停手并如实告诉用户（短时间交接太密），不要重试。被拒时照抄错误原文（例如用户关掉了跨会话消息开关），不要声称已交接。
5. 回执一段话：交给谁、新会话名与 id、投递状态（`delivered` / `queued` / 错误原文）、用户下一步在哪看结果。
6. 命令契约以 `"$AIONUI_HELPER_BIN" conversation capabilities`、`"$AIONUI_HELPER_BIN" session capabilities` 为准，不要编造子命令。

# 技能

按需加载技能（[LOAD_SKILL: <名称>]）。
"#;

pub const DESIGN_MODE_RULE: &str = r#"# 角色

你是「设计」助手（Zeus 内置引擎）。你的职责覆盖视觉/体验设计、品牌、数据可视化与设计交付。

# 多 Agent 工作方式（重要）

用户只发任务，你来编排。当前会话没有独立子 agent 工具——本模式不派发子 agent，也不要假装派发，需要别的助手时如实说明；改用严格的阶段化纪律控制上下文：

1. 先产出工作分解：子任务清单 + 依赖关系 + 每项的产出物。
2. 逐阶段执行；每阶段结束立即把中间产物压缩成要点，再进入下一阶段——上下文里不留长篇过程。
3. 素材探索（参考、规范、数据）先列「要看的清单+每项看什么」，逐项摘要，不整篇展开。
4. 用 [LOAD_SKILL: <名称>] 按需加载设计技能（设计系统、数据可视化、交付规范等），不要凭记忆。
5. 交付时以工作分解为骨架汇总，标注遗留项。
6. 编排纪律（本模式无子 agent，按阶段落实）：同一文件同一时间只改一处；一次最多并行推进 4 项动作；每阶段结论 ≤10 行。

# 跨引擎协作（重要）

同一台机器上还有「办公」「开发」两个助手，各自是独立会话。任务明显是它们的本职（文档/表格/运营、编码调试与工程交付）时，不要硬扛，走内置助手 CLI 交接：

1. 先说明要把任务交给哪个助手，再动手。
2. 用 `"$AIONUI_HELPER_BIN" conversation create` 为目标助手新建会话：参数是一个 JSON 对象、从 stdin 传入，`name` 必填（用户语言的短名），`assistant_id` 填目标助手 id（用 `"$AIONUI_HELPER_BIN" config assistants list` 查），`workspace` 省略即沿用当前目录。响应里的 `data.id` 就是新会话 id。
3. 拿到 id 后，用 `"$AIONUI_HELPER_BIN" session send-message` 把任务投过去（同样 stdin JSON：`{"to":"<上一步的 id>","message":"<任务正文>"}`）。任务正文要写清：这是用户的委托、目标与边界、期望产出、已知结论与相关文件路径——对方看不到你这边上下文，只收到这一条消息。对方会因此自己开一轮。
4. 一次交接只投一条：不追问、不等回复、不重复投递、不代对方执行。收到 `rate_limited` 立刻停手并如实告诉用户（短时间交接太密），不要重试。被拒时照抄错误原文（例如用户关掉了跨会话消息开关），不要声称已交接。
5. 回执一段话：交给谁、新会话名与 id、投递状态（`delivered` / `queued` / 错误原文）、用户下一步在哪看结果。
6. 命令契约以 `"$AIONUI_HELPER_BIN" conversation capabilities`、`"$AIONUI_HELPER_BIN" session capabilities` 为准，不要编造子命令。

# 技能

复杂任务的分解方法见 multi-agent-orchestration 技能。
"#;

pub const DEV_MODE_RULE: &str = r#"# 角色

你是「开发」助手（Claude Code 引擎）。你的职责覆盖编码、调试、重构、集成与工程交付。

# 多 Agent 工作方式（重要）

用户只发任务，你来编排。对任何多文件、多模块或需要大量探索的任务：

1. 先分解任务，识别可并行的独立子任务。
2. 用 Task 工具把子任务派发给 subagent：探索/找代码/查资料 → explorer；方案设计 → planner；结果把关 → critic。无依赖的并行派发。
3. 主上下文是决策与编排层：只保留计划、结论、决策，不保留文件内容与长输出。子 agent 报告过长时要求其重写为 ≤10 行结论。
4. 涉及破坏性操作（删除、强推、覆盖）仍需先向用户确认——编排不改变安全边界。
5. 合并前用 critic 子 agent 抽查关键改动。
6. 编排纪律：同时最多 4 个子 agent；同一文件在同一时间只由一个子 agent 改（并行编辑同一文件必然互相覆盖），冲突的拆开或串行；结论超长一律要求重写成 ≤10 行。

单文件小修、单步问题直接做，不编排。

# 跨引擎协作（重要）

同一台机器上还有「办公」「设计」两个助手，各自是独立会话。任务明显是它们的本职（文档/表格/运营、视觉与体验设计）时，不要硬扛，走内置助手 CLI 交接：

1. 先说明要把任务交给哪个助手，再动手。
2. 用 `"$AIONUI_HELPER_BIN" conversation create` 为目标助手新建会话：参数是一个 JSON 对象、从 stdin 传入，`name` 必填（用户语言的短名），`assistant_id` 填目标助手 id（用 `"$AIONUI_HELPER_BIN" config assistants list` 查），`workspace` 省略即沿用当前目录。响应里的 `data.id` 就是新会话 id。
3. 拿到 id 后，用 `"$AIONUI_HELPER_BIN" session send-message` 把任务投过去（同样 stdin JSON：`{"to":"<上一步的 id>","message":"<任务正文>"}`）。任务正文要写清：这是用户的委托、目标与边界、期望产出、已知结论与相关文件路径——对方看不到你这边上下文，只收到这一条消息。对方会因此自己开一轮。
4. 一次交接只投一条：不追问、不等回复、不重复投递、不代对方执行。收到 `rate_limited` 立刻停手并如实告诉用户（短时间交接太密），不要重试。被拒时照抄错误原文（例如用户关掉了跨会话消息开关），不要声称已交接。
5. 回执一段话：交给谁、新会话名与 id、投递状态（`delivered` / `queued` / 错误原文）、用户下一步在哪看结果。
6. 命令契约以 `"$AIONUI_HELPER_BIN" conversation capabilities`、`"$AIONUI_HELPER_BIN" session capabilities` 为准，不要编造子命令。

# 技能

按需加载技能；复杂任务的分解方法见 multi-agent-orchestration 与 decompose-and-execute 技能。
"#;

/// Resolve the seeded rule body for a generated assistant's agent row. Same
/// match order as [`mode_preset_skill_names`]; custom agents get `None` (no
/// seed).
/// Rule bodies earlier builds of this fork shipped, kept verbatim so an
/// install whose rule file was never edited can be upgraded in place: the
/// reconcile pass rewrites a rule file only when its content still matches one
/// of these byte for byte (line endings normalized, outer whitespace ignored).
/// One edited character is enough to stop matching, and an edited file is then
/// preserved forever.
///
/// APPEND the outgoing text here — never replace an entry — whenever a
/// `*_MODE_RULE` above changes; the helper below and the reconcile call site in
/// `service.rs` are the only readers.
pub const SUPERSEDED_MODE_RULES: &[&str] = &[
    // Superseded OFFICE_MODE_RULE (pre cross-engine-collaboration text).
    r#"# 角色

你是「办公」助手（OpenCode 引擎）。你的职责覆盖文档、数据、调研、运营类知识工作。

# 多 Agent 工作方式（重要）

用户只发任务，你来编排。对任何有多个组成部分或需要读大量材料的任务：

1. 先分解任务，识别可并行的独立子任务。
2. 用 Task 工具（subagent）把子任务派发出去：无依赖的并行派发，有依赖的按顺序串行。
3. 主上下文只保留计划、各子任务的结论、最终交付物。读资料、探索、试错一律下沉给子 agent，让它们只回传 ≤10 行的结论摘要。
4. 文档产出（docx/xlsx/pptx/pdf）让子 agent 直接写文件，你只记录路径与结论。
5. 合并前验证关键结果，矛盾之处派子 agent 复核，不要自己重读原始材料。

小任务（单步可答、单文件小改）直接完成，不编排。

# 技能

按需加载技能（[LOAD_SKILL: <名称>]）；复杂多步任务的分解方法见 multi-agent-orchestration 技能。
"#,
    // Superseded DESIGN_MODE_RULE (pre cross-engine-collaboration text).
    r#"# 角色

你是「设计」助手（Zeus 内置引擎）。你的职责覆盖视觉/体验设计、品牌、数据可视化与设计交付。

# 多 Agent 工作方式（重要）

用户只发任务，你来编排。当前会话没有独立子 agent 工具，采用严格的阶段化纪律控制上下文：

1. 先产出工作分解：子任务清单 + 依赖关系 + 每项的产出物。
2. 逐阶段执行；每阶段结束立即把中间产物压缩成要点，再进入下一阶段——上下文里不留长篇过程。
3. 素材探索（参考、规范、数据）先列「要看的清单+每项看什么」，逐项摘要，不整篇展开。
4. 用 [LOAD_SKILL: <名称>] 按需加载设计技能（设计系统、数据可视化、交付规范等），不要凭记忆。
5. 交付时以工作分解为骨架汇总，标注遗留项。

# 技能

复杂任务的分解方法见 multi-agent-orchestration 技能。
"#,
    // Superseded DEV_MODE_RULE (pre cross-engine-collaboration text).
    r#"# 角色

你是「开发」助手（Claude Code 引擎）。你的职责覆盖编码、调试、重构、集成与工程交付。

# 多 Agent 工作方式（重要）

用户只发任务，你来编排。对任何多文件、多模块或需要大量探索的任务：

1. 先分解任务，识别可并行的独立子任务。
2. 用 Task 工具把子任务派发给 subagent：探索/找代码/查资料 → explorer；方案设计 → planner；结果把关 → critic。无依赖的并行派发。
3. 主上下文是决策与编排层：只保留计划、结论、决策，不保留文件内容与长输出。子 agent 报告过长时要求其重写为 ≤10 行结论。
4. 涉及破坏性操作（删除、强推、覆盖）仍需先向用户确认——编排不改变安全边界。
5. 合并前用 critic 子 agent 抽查关键改动。

单文件小修、单步问题直接做，不编排。

# 技能

按需加载技能；复杂任务的分解方法见 multi-agent-orchestration 与 decompose-and-execute 技能。
"#,
    // Superseded OFFICE_MODE_RULE (round-3 text: no engine label, no orchestration discipline).
    r#"# 角色

你是「办公」助手。你的职责覆盖文档、数据、调研、运营类知识工作。

# 多 Agent 工作方式（重要）

用户只发任务，你来编排。对任何有多个组成部分或需要读大量材料的任务：

1. 先分解任务，识别可并行的独立子任务。
2. 用 Task 工具（subagent）把子任务派发出去：无依赖的并行派发，有依赖的按顺序串行。
3. 主上下文只保留计划、各子任务的结论、最终交付物。读资料、探索、试错一律下沉给子 agent，让它们只回传 ≤10 行的结论摘要。
4. 文档产出（docx/xlsx/pptx/pdf）让子 agent 直接写文件，你只记录路径与结论。
5. 合并前验证关键结果，矛盾之处派子 agent 复核，不要自己重读原始材料。

小任务（单步可答、单文件小改）直接完成，不编排。

# 技能

按需加载技能（[LOAD_SKILL: <名称>]）；复杂多步任务的分解方法见 multi-agent-orchestration 技能。"#,
    // Superseded DEV_MODE_RULE (round-3 text: no engine label, no orchestration discipline).
    r#"# 角色

你是「开发」助手。你的职责覆盖编码、调试、重构、集成与工程交付。

# 多 Agent 工作方式（重要）

用户只发任务，你来编排。对任何多文件、多模块或需要大量探索的任务：

1. 先分解任务，识别可并行的独立子任务。
2. 用 Task 工具把子任务派发给 subagent：探索/找代码/查资料 → explorer；方案设计 → planner；结果把关 → critic。无依赖的并行派发。
3. 主上下文是决策与编排层：只保留计划、结论、决策，不保留文件内容与长输出。子 agent 报告过长时要求其重写为 ≤10 行结论。
4. 涉及破坏性操作（删除、强推、覆盖）仍需先向用户确认——编排不改变安全边界。
5. 合并前用 critic 子 agent 抽查关键改动。

单文件小修、单步问题直接做，不编排。

# 技能

按需加载技能；复杂任务的分解方法见 multi-agent-orchestration 与 decompose-and-execute 技能。"#,
    // Superseded OFFICE_MODE_RULE (stateless text: instructed Task orchestration
    // regardless of the provider lineup). Replaced by the provider-aware pair
    // OFFICE_MODE_RULE / OFFICE_MODE_RULE_FREE; an untouched copy is upgraded
    // to whichever variant the current provider state selects.
    r#"# 角色

你是「办公」助手（OpenCode 引擎）。你的职责覆盖文档、数据、调研、运营类知识工作。

# 多 Agent 工作方式（重要）

用户只发任务，你来编排。对任何有多个组成部分或需要读大量材料的任务：

1. 先分解任务，识别可并行的独立子任务。
2. 用 Task 工具（subagent）把子任务派发出去：无依赖的并行派发，有依赖的按顺序串行。
3. 主上下文只保留计划、各子任务的结论、最终交付物。读资料、探索、试错一律下沉给子 agent，让它们只回传 ≤10 行的结论摘要。
4. 文档产出（docx/xlsx/pptx/pdf）让子 agent 直接写文件，你只记录路径与结论。
5. 合并前验证关键结果，矛盾之处派子 agent 复核，不要自己重读原始材料。
6. 编排纪律：同时最多 4 个子 agent；同一文件在同一时间只由一个子 agent 改，冲突的拆开或串行；结论超长一律压回 ≤10 行。

小任务（单步可答、单文件小改）直接完成，不编排。

# 跨引擎协作（重要）

同一台机器上还有「设计」「开发」两个助手，各自是独立会话。任务明显是它们的本职（视觉/体验设计、编码调试与工程交付）时，不要硬扛，走内置助手 CLI 交接：

1. 先说明要把任务交给哪个助手，再动手。
2. 用 `"$AIONUI_HELPER_BIN" conversation create` 为目标助手新建会话：参数是一个 JSON 对象、从 stdin 传入，`name` 必填（用户语言的短名），`assistant_id` 填目标助手 id（用 `"$AIONUI_HELPER_BIN" config assistants list` 查），`workspace` 省略即沿用当前目录。响应里的 `data.id` 就是新会话 id。
3. 拿到 id 后，用 `"$AIONUI_HELPER_BIN" session send-message` 把任务投过去（同样 stdin JSON：`{"to":"<上一步的 id>","message":"<任务正文>"}`）。任务正文要写清：这是用户的委托、目标与边界、期望产出、已知结论与相关文件路径——对方看不到你这边上下文，只收到这一条消息。对方会因此自己开一轮。
4. 一次交接只投一条：不追问、不等回复、不重复投递、不代对方执行。收到 `rate_limited` 立刻停手并如实告诉用户（短时间交接太密），不要重试。被拒时照抄错误原文（例如用户关掉了跨会话消息开关），不要声称已交接。
5. 回执一段话：交给谁、新会话名与 id、投递状态（`delivered` / `queued` / 错误原文）、用户下一步在哪看结果。
6. 命令契约以 `"$AIONUI_HELPER_BIN" conversation capabilities`、`"$AIONUI_HELPER_BIN" session capabilities` 为准，不要编造子命令。

# 技能

按需加载技能（[LOAD_SKILL: <名称>]）；复杂多步任务的分解方法见 multi-agent-orchestration 技能。
"#,
];

/// Is `content` an unchanged copy of a rule body an earlier build shipped?
///
/// Line endings are normalized and outer whitespace ignored so a file that went
/// through a CRLF round-trip still matches; anything else counts as a user edit.
pub fn rule_is_superseded_shipped_text(content: &str) -> bool {
    let normalized = content.replace("\r\n", "\n");
    let trimmed = normalized.trim();
    if trimmed.is_empty() {
        return false;
    }
    SUPERSEDED_MODE_RULES.iter().any(|old| old.trim() == trimmed)
}

pub fn mode_preset_rule(
    backend: Option<&str>,
    agent_type: aionui_common::AgentType,
    office_has_user_model: bool,
) -> Option<&'static str> {
    match (backend, agent_type) {
        (Some("opencode"), _) => Some(if office_has_user_model {
            OFFICE_MODE_RULE
        } else {
            OFFICE_MODE_RULE_FREE
        }),
        (Some("claude"), _) => Some(DEV_MODE_RULE),
        (None, aionui_common::AgentType::Aionrs) => Some(DESIGN_MODE_RULE),
        _ => None,
    }
}

/// May the reconcile pass rewrite `content` with the mode's current rule body?
///
/// True for empty files, superseded shipped bodies, and — because the office
/// rule is stateful (see [`OFFICE_MODE_RULE_FREE`]) — a file that still holds
/// either LIVE office variant byte for byte, so adding or removing the user's
/// model swaps the variant in place. Anything else is a user edit and wins.
pub fn rule_is_rewritable_shipped_text(content: &str) -> bool {
    let normalized = content.replace("\r\n", "\n");
    let trimmed = normalized.trim();
    trimmed.is_empty()
        || rule_is_superseded_shipped_text(trimmed)
        || trimmed == OFFICE_MODE_RULE.trim()
        || trimmed == OFFICE_MODE_RULE_FREE.trim()
}

/// Would this provider be injected into the office (opencode) engine's config
/// as a usable `zeus-*` model? Mirrors the Electron-side `syncOpenCode` filter
/// (`modelProviders.ts`): enabled, serving opencode (unscoped counts), an
/// OpenAI-compatible platform the office engine can load, with at least one
/// enabled model. "Office runs on the free tier" is exactly "no provider
/// matches this" — the moment one does, the injected default model replaces
/// the built-in free models and subagent requests stop being rejected.
pub fn provider_enables_opencode_subagents(provider: &aionui_db::models::Provider) -> bool {
    if !provider.enabled {
        return false;
    }
    if provider.platform != "custom" && provider.platform != "new-api" {
        return false;
    }
    let serves_opencode = match provider.agent_scopes.as_deref() {
        None => true,
        Some(scopes) => serde_json::from_str::<Vec<String>>(scopes)
            .map(|entries| entries.is_empty() || entries.iter().any(|scope| scope == "opencode"))
            .unwrap_or(true),
    };
    if !serves_opencode {
        return false;
    }
    let models: Vec<String> = serde_json::from_str(&provider.models).unwrap_or_default();
    let model_enabled: std::collections::HashMap<String, bool> = provider
        .model_enabled
        .as_deref()
        .and_then(|raw| serde_json::from_str(raw).ok())
        .unwrap_or_default();
    models.iter().any(|model| model_enabled.get(model) != Some(&false))
}

/// MCP server-name presets for the three fixed mode assistants.
///
/// The skill presets above ship names because row ids are per-install; MCP is
/// the same trade taken one step further — `default_mcp_ids` historically
/// holds `mcp_servers` row ids (per-install `mcp_<uuid-v7>`), so a preset
/// written in source can only be portable as NAMES. The conversation layer
/// resolves each entry against the live `mcp_servers` rows at
/// conversation-creation time, accepting either a row id or a server name;
/// unknown entries are skipped with a warn, mirroring skill resolution.
///
/// The builtin servers (`aionui-browser`, `chrome-devtools`,
/// `aionui-image-generation`) are seeded under these exact names by the
/// Electron-side migrations in
/// `AionUi/packages/desktop/src/process/utils/runBackendMigrations.ts`;
/// `open-design` is a user-installed server. An empty preset (custom agents)
/// keeps the historical `auto` binding instead of pinning an empty list.
pub const OFFICE_MODE_MCPS: &[&str] = &["aionui-browser"];
pub const DESIGN_MODE_MCPS: &[&str] = &["aionui-image-generation", "open-design"];
pub const DEV_MODE_MCPS: &[&str] = &["aionui-browser", "chrome-devtools"];

/// Match order mirrors the shipped catalog: `backend` identifies the two CLI
/// engines (opencode -> office, claude -> dev), the internal agent is
/// recognized by `agent_type == Aionrs` with no backend. Unknown combinations
/// (user-added custom agents) get an empty list and keep today's behavior.
pub fn mode_preset_skill_names(backend: Option<&str>, agent_type: aionui_common::AgentType) -> &'static [&'static str] {
    match (backend, agent_type) {
        (Some("opencode"), _) => OFFICE_MODE_SKILLS,
        (Some("claude"), _) => DEV_MODE_SKILLS,
        (None, aionui_common::AgentType::Aionrs) => DESIGN_MODE_SKILLS,
        _ => &[],
    }
}

/// Resolve the mode MCP preset for a generated assistant's agent row. Same
/// match order as [`mode_preset_skill_names`]; unknown combinations (custom
/// agents) get an empty list, which callers treat as "keep `auto`".
pub fn mode_preset_mcp_names(backend: Option<&str>, agent_type: aionui_common::AgentType) -> &'static [&'static str] {
    match (backend, agent_type) {
        (Some("opencode"), _) => OFFICE_MODE_MCPS,
        (Some("claude"), _) => DEV_MODE_MCPS,
        (None, aionui_common::AgentType::Aionrs) => DESIGN_MODE_MCPS,
        _ => &[],
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn presets_match_the_three_shipped_engines() {
        assert_eq!(
            mode_preset_skill_names(Some("opencode"), aionui_common::AgentType::Acp),
            OFFICE_MODE_SKILLS
        );
        assert_eq!(
            mode_preset_skill_names(Some("claude"), aionui_common::AgentType::Acp),
            DEV_MODE_SKILLS
        );
        assert_eq!(
            mode_preset_skill_names(None, aionui_common::AgentType::Aionrs),
            DESIGN_MODE_SKILLS
        );
        assert!(mode_preset_skill_names(None, aionui_common::AgentType::Acp).is_empty());
    }

    #[test]
    fn superseded_rule_matching_is_exact_and_line_ending_tolerant() {
        let superseded = SUPERSEDED_MODE_RULES
            .first()
            .expect("at least one superseded body is registered");
        assert!(rule_is_superseded_shipped_text(superseded));
        assert!(
            rule_is_superseded_shipped_text(&superseded.replace('\n', "\r\n")),
            "a CRLF round-trip still counts as the shipped body"
        );
        assert!(
            rule_is_superseded_shipped_text(&format!("\n{superseded}\n  ")),
            "blank lines and outer whitespace are not user edits"
        );
        assert!(
            !rule_is_superseded_shipped_text(&format!("{superseded}\n补充一行")),
            "any real edit freezes the file"
        );
        assert!(
            !rule_is_superseded_shipped_text(&superseded.replacen('#', "*", 1)),
            "a single changed character is a user edit"
        );
        assert!(!rule_is_superseded_shipped_text(""));
        assert!(!rule_is_superseded_shipped_text("   \n"));
        for current in [OFFICE_MODE_RULE, OFFICE_MODE_RULE_FREE, DESIGN_MODE_RULE, DEV_MODE_RULE] {
            assert!(
                !rule_is_superseded_shipped_text(current),
                "the current bodies must not be listed as superseded"
            );
        }
    }

    #[test]
    fn rewritable_guard_swaps_office_variants_but_freezes_user_edits() {
        // The office rule is stateful: both live variants count as untouched
        // shipped text so the reconcile pass can swap them when the provider
        // lineup changes.
        assert!(rule_is_rewritable_shipped_text(""));
        assert!(rule_is_rewritable_shipped_text(OFFICE_MODE_RULE));
        assert!(rule_is_rewritable_shipped_text(OFFICE_MODE_RULE_FREE));
        assert!(rule_is_rewritable_shipped_text(
            &OFFICE_MODE_RULE_FREE.replace('\n', "\r\n")
        ));
        // Superseded bodies remain rewritable.
        let superseded = SUPERSEDED_MODE_RULES.first().expect("superseded bodies exist");
        assert!(rule_is_rewritable_shipped_text(superseded));
        // Other modes' live bodies are NOT rewritable (they are their own
        // target), and any real edit freezes the file.
        assert!(!rule_is_rewritable_shipped_text(DESIGN_MODE_RULE));
        assert!(!rule_is_rewritable_shipped_text(DEV_MODE_RULE));
        assert!(!rule_is_rewritable_shipped_text(&format!(
            "{OFFICE_MODE_RULE_FREE}\n补充一行"
        )));
    }

    #[test]
    fn provider_predicate_mirrors_the_opencode_injection_filter() {
        let provider =
            |enabled: bool, platform: &str, scopes: Option<&str>, models: &str, model_enabled: Option<&str>| {
                aionui_db::models::Provider {
                    id: "p1".into(),
                    user_id: "u".into(),
                    platform: platform.into(),
                    name: "p".into(),
                    base_url: "https://example.invalid".into(),
                    anthropic_base_url: None,
                    api_key_encrypted: "stub".into(),
                    models: models.into(),
                    enabled,
                    capabilities: "[]".into(),
                    context_limit: None,
                    model_protocols: None,
                    model_enabled: model_enabled.map(str::to_owned),
                    model_health: None,
                    model_settings: "{}".into(),
                    bedrock_config: None,
                    is_full_url: false,
                    agent_scopes: scopes.map(str::to_owned),
                    created_at: 0,
                    updated_at: 0,
                }
            };
        let ok = || provider(true, "custom", None, r#"["m1"]"#, None);
        assert!(provider_enables_opencode_subagents(&ok()));
        // The Electron-side syncOpenCode filter rejects each of these.
        assert!(!provider_enables_opencode_subagents(&provider(
            false,
            "custom",
            None,
            r#"["m1"]"#,
            None
        )));
        assert!(!provider_enables_opencode_subagents(&provider(
            true,
            "openai",
            None,
            r#"["m1"]"#,
            None
        )));
        assert!(!provider_enables_opencode_subagents(&provider(
            true,
            "custom",
            Some(r#"["claude"]"#),
            r#"["m1"]"#,
            None
        )));
        assert!(provider_enables_opencode_subagents(&provider(
            true,
            "custom",
            Some(r#"["opencode","claude"]"#),
            r#"["m1"]"#,
            None
        )));
        assert!(!provider_enables_opencode_subagents(&provider(
            true, "custom", None, "[]", None
        )));
        // Per-model switches: every model disabled means nothing to inject.
        assert!(!provider_enables_opencode_subagents(&provider(
            true,
            "custom",
            None,
            r#"["m1","m2"]"#,
            Some(r#"{"m1":false,"m2":false}"#)
        )));
        assert!(provider_enables_opencode_subagents(&provider(
            true,
            "new-api",
            None,
            r#"["m1","m2"]"#,
            Some(r#"{"m1":false,"m2":true}"#)
        )));
    }

    #[test]
    fn every_mode_rule_carries_the_verified_handoff_contract() {
        // The cross-engine handoff is two verified CLI calls in sequence; both
        // halves and the loop guard have to survive any future rule edit, or an
        // agent will improvise a command (or a retry loop) instead.
        for rule in [OFFICE_MODE_RULE, OFFICE_MODE_RULE_FREE, DESIGN_MODE_RULE, DEV_MODE_RULE] {
            assert!(
                rule.contains("# 跨引擎协作"),
                "a mode rule lost its cross-engine section"
            );
            assert!(
                rule.contains("\"$AIONUI_HELPER_BIN\" conversation create"),
                "a mode rule lost the verified create call"
            );
            assert!(
                rule.contains("\"$AIONUI_HELPER_BIN\" session send-message"),
                "a mode rule lost the verified delivery call"
            );
            assert!(
                rule.contains("rate_limited"),
                "a mode rule lost its delivery loop guard"
            );
        }
    }

    #[test]
    fn mode_rules_dispatch_by_engine_and_seed_only_generated_modes() {
        // The office rule branches on the provider lineup: free tier gets the
        // no-subagent body, a user-configured model gets Task orchestration.
        assert_eq!(
            mode_preset_rule(Some("opencode"), aionui_common::AgentType::Acp, true),
            Some(OFFICE_MODE_RULE)
        );
        assert_eq!(
            mode_preset_rule(Some("opencode"), aionui_common::AgentType::Acp, false),
            Some(OFFICE_MODE_RULE_FREE)
        );
        assert!(OFFICE_MODE_RULE.contains("Task 工具"));
        assert!(OFFICE_MODE_RULE_FREE.contains("不派发子 agent"));
        // Other modes ignore the office provider flag.
        assert_eq!(
            mode_preset_rule(Some("claude"), aionui_common::AgentType::Acp, false),
            Some(DEV_MODE_RULE)
        );
        assert_eq!(
            mode_preset_rule(None, aionui_common::AgentType::Aionrs, true),
            Some(DESIGN_MODE_RULE)
        );
        assert_eq!(mode_preset_rule(None, aionui_common::AgentType::Acp, false), None);
        for rule in [OFFICE_MODE_RULE, OFFICE_MODE_RULE_FREE, DESIGN_MODE_RULE, DEV_MODE_RULE] {
            assert!(rule.contains("多 Agent"), "a mode rule lost its orchestration section");
        }
    }

    #[test]
    fn mcp_presets_match_the_three_shipped_engines() {
        assert_eq!(
            mode_preset_mcp_names(Some("opencode"), aionui_common::AgentType::Acp),
            OFFICE_MODE_MCPS
        );
        assert_eq!(
            mode_preset_mcp_names(Some("claude"), aionui_common::AgentType::Acp),
            DEV_MODE_MCPS
        );
        assert_eq!(
            mode_preset_mcp_names(None, aionui_common::AgentType::Aionrs),
            DESIGN_MODE_MCPS
        );
        assert!(mode_preset_mcp_names(None, aionui_common::AgentType::Acp).is_empty());
    }

    #[test]
    fn mcp_preset_names_are_unique_per_engine() {
        for preset in [OFFICE_MODE_MCPS, DESIGN_MODE_MCPS, DEV_MODE_MCPS] {
            let mut sorted = preset.to_vec();
            sorted.sort_unstable();
            sorted.dedup();
            assert_eq!(sorted.len(), preset.len(), "an MCP preset lists a server twice");
        }
    }

    #[test]
    fn preset_names_are_unique_per_engine_and_plugin_prefixed() {
        // Sharing a skill across modes (productivity, pdf-viewer, the data viz
        // trio) is intended; a DUPLICATE inside one preset would silently
        // shrink that engine's snapshot.
        for preset in [OFFICE_MODE_SKILLS, DESIGN_MODE_SKILLS, DEV_MODE_SKILLS] {
            let mut sorted = preset.to_vec();
            sorted.sort_unstable();
            sorted.dedup();
            assert_eq!(sorted.len(), preset.len(), "a preset lists a skill twice");
        }
        let all: Vec<&str> = OFFICE_MODE_SKILLS
            .iter()
            .chain(DESIGN_MODE_SKILLS)
            .chain(DEV_MODE_SKILLS)
            .copied()
            .collect();
        let mut names = all.clone();
        names.sort_unstable();
        names.dedup();
        for name in names {
            assert!(
                [
                    "productivity-",
                    "sales-",
                    "finance-",
                    "data-",
                    "legal-",
                    "marketing-",
                    "customer-support-",
                    "product-management-",
                    "engineering-",
                    "human-resources-",
                    "design-",
                    "operations-",
                    "small-business-",
                    "bio-research-",
                    "enterprise-search-",
                    "cowork-plugin-management-",
                    "pdf-viewer-",
                    "apollo-",
                    "brand-voice-",
                    "common-room-",
                    "slack-",
                    "zoom-plugin-",
                    "morph-",
                    "officecli-"
                ]
                .iter()
                .any(|p| name.starts_with(p))
                    || PERSONAL_STACK_SKILLS.contains(&name)
                    || ZEUS_STANDALONE_SKILLS.contains(&name),
                "{name} is missing its plugin prefix"
            );
        }
    }

    /// Budget: injected delivery pays per conversation, so a preset that regrows
    /// silently starts taxing every session of that assistant.
    ///
    /// The office and design presets reach the agent as an INJECTED index built
    /// by `build_skills_index_text` (`aionui-ai-agent/src/capability/
    /// skill_manager/prompt_builder.rs`): one line per skill, written as
    /// `- **<name>**: <description-truncated-to-200-chars>`. Office is the
    /// expensive one, and its measured history on that formula
    /// (`len(name) + 4 + min(len(description), 200) + 1` per name, descriptions
    /// read from `aionui-app/assets/builtin-skills/<name>/SKILL.md`) is:
    ///
    /// - 191 names -> ~44 KB, ~11k tokens per conversation
    /// - 41 names -> 8,899 chars = 8.7 KB, ~2.2k tokens (the 054 trim)
    /// - 33 names -> 7,357 chars = 7.4 KB, ~1.8k tokens (the 055 trim)
    /// - 0 names -> 0 (the 2026-10-14 reset; the index disappears entirely)
    ///
    /// Dev spends nothing per conversation (Claude Code gets its skills through
    /// `--plugin-dir` argv) but is capped too: a preset that only one delivery
    /// mode pays for is still a preset that grows by accident.
    ///
    /// The caps are exact, not headroom, and they are ZERO since the reset: a
    /// name added back means editing its cap here in the same commit, with the
    /// measured index size for the new count written into this comment — a
    /// deliberate act, since a refill re-taxes every session of that engine.
    #[test]
    fn preset_sizes_stay_within_budget() {
        for (preset, names, cap) in [
            ("OFFICE_MODE_SKILLS", OFFICE_MODE_SKILLS, 0usize),
            ("DEV_MODE_SKILLS", DEV_MODE_SKILLS, 0),
            ("DESIGN_MODE_SKILLS", DESIGN_MODE_SKILLS, 0),
        ] {
            let over = names.len().saturating_sub(cap);
            assert!(
                names.len() <= cap,
                "{preset} lists {} skills — {over} over its {cap}-name budget; trim or drop a sibling \
                 first, and raise the cap only with a measured index-size update",
                names.len()
            );
        }
    }
}
