/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Ship generic sub-agent definitions into the isolated CLI runtimes so the
 * 办公/开发 engines can act on the orchestration guidance from their mode rule
 * (assistant-rules) and the multi-agent-orchestration skill:
 *
 *  - Claude Code reads user-level subagents from `$CLAUDE_CONFIG_DIR/agents/*.md`
 *    (frontmatter: name / description / tools).
 *  - OpenCode reads them from `$OPENCODE_CONFIG_DIR/agents/<name>.md`
 *    (frontmatter: description [required] / mode: subagent / permission),
 *    invoked through its Task tool.
 *
 * The office (opencode) engine only gets these while a user-configured model
 * serves it (`opencodeHasUserModel`): on the built-in free models the backend
 * behind them rejects every subagent request, so the mode rule switches to the
 * no-subagent discipline AND the `zeus-*` entries are removed from the
 * opencode agents dir (an empty set makes `writeAgentDir` clean them up).
 * Claude Code always gets the full set.
 *
 * Three of the four entries police a sub-task INSIDE the current mode
 * (explore / plan / critic). The fourth, `zeus-delegate`, is the cross-mode
 * handoff: it creates a new conversation for another mode's assistant through
 * the backend's agent-facing helper CLI. Its invocation is not invented here —
 * it is the contract verified from the backend source:
 *
 *  - subcommand: `aioncore conversation create` (AionCore/crates/aionui-app/src/cli.rs
 *    — `Command::Conversation` / `ConversationCommand::Create`);
 *  - payload: a JSON object on stdin, only `name` required, optional `workspace`
 *    (absolute existing dir) and `assistant_id` (AionCore/crates/aionui-app/src/commands/cmd_conversation.rs,
 *    schema in AionCore/crates/aionui-api-types/src/conversation_tools.rs);
 *  - `$AIONUI_HELPER_BIN` reaches both engines' process env — claude via
 *    `SessionConfig.spawn_env` (aionui-ai-agent session_agent.rs), opencode via
 *    `apply_acp_launch_policy` (aionui-ai-agent factory/acp_launch_policy.rs).
 *
 * The files are app-managed: each boot rewrites exactly the `zeus-*` entries
 * and leaves anything else in those directories untouched.
 */

import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { IsolatedRuntimePaths } from './paths';

type SubAgentDef = {
  name: string;
  description: string;
  body: string;
  /** Claude Code `tools` allowlist (comma-separated frontmatter value). */
  claudeTools: string;
  /** OpenCode permission map. */
  opencodePermission: Record<string, string>;
};

const SUB_AGENT_DEFS: SubAgentDef[] = [
  {
    name: 'zeus-explorer',
    description:
      '并行探索与信息收集：读代码、找文件、查资料、摸底现状。适合调研类子任务。只回传结论摘要（≤10 行，含关键文件路径），不回传过程与长引用。',
    body: [
      '你是探索子 agent，为主 agent 服务。',
      '',
      '## 纪律',
      '1. 只读：不修改任何文件。',
      '2. 主 agent 给你一个调研问题，你去找答案：用搜索/读取工具定位，快速过滤无关内容。',
      '3. 回传格式：先一句话结论，再 ≤10 行要点（含文件路径:行号 或 链接），最后列出「没找到什么」。',
      '4. 不粘贴大段原文——主上下文很贵，过程留在你这里。',
    ].join('\n'),
    claudeTools: 'Read, Grep, Glob, WebSearch, WebFetch',
    opencodePermission: { edit: 'deny', bash: 'deny', webfetch: 'allow' },
  },
  {
    name: 'zeus-planner',
    description:
      '任务分解与执行计划：把一个较大任务拆成可独立验收的子任务清单，标注依赖与并行关系，估算每个子任务的读/写量。适合动手前的方案设计。',
    body: [
      '你是规划子 agent，为主 agent 服务。',
      '',
      '## 纪律',
      '1. 只读：不修改任何文件；需要摸底时可自行检索阅读。',
      '2. 产出一份执行计划：子任务清单（每项一句话 + 验收标准）、依赖图（哪些可并行、哪些必须串行）、风险与前置条件。',
      '3. 标注每个子任务预计的读/写量，读多写少的优先建议派给探索子 agent。',
      '4. 计划本身 ≤60 行；超出说明任务还应再拆一层。',
    ].join('\n'),
    claudeTools: 'Read, Grep, Glob, WebSearch',
    opencodePermission: { edit: 'deny', bash: 'deny', webfetch: 'allow' },
  },
  {
    name: 'zeus-critic',
    description:
      '结果审查与质量校验：检查主 agent 或其他子 agent 的产出是否符合任务要求、有无错误与遗漏，给出逐条通过/不通过结论。适合合并前的把关。',
    body: [
      '你是审查子 agent，为主 agent 服务。',
      '',
      '## 纪律',
      '1. 输入是「任务要求 + 待审产出（或其文件路径）」；必要时可读文件、跑只读命令核对。',
      '2. 逐条对照任务要求，输出：通过项（一行一条）、不通过项（问题 + 证据 + 建议修法）。',
      '3. 不重写产出，只给审查结论。发现矛盾时明确指出，不替主 agent 拍板。',
    ].join('\n'),
    claudeTools: 'Read, Grep, Glob, Bash',
    opencodePermission: { edit: 'deny', bash: 'allow', webfetch: 'deny' },
  },
  {
    name: 'zeus-delegate',
    description:
      '跨模式派单：把一件边界清晰、确实属于另一个模式（办公/开发/设计）的任务交出去，作为新会话创建，只回传一张短回执。不代用户或其他助手执行任何破坏性操作。',
    body: [
      '你是派单子 agent，为主 agent 服务：把一件边界清晰的任务交给另一个模式的助手，作为新会话创建。',
      '',
      '## 不要用于',
      '1. 这件活属于当前模式的范围——自己或本模式的子 agent 做，不要派单。',
      '2. 用户是在本会话里提出的要求——就地做完，不要转手（除非用户明确说要交给另一个模式）。',
      '3. 任务边界还说不清（要探索、要拆解、要边做边定）——先把边界定下来，再派。',
      '',
      '## 纪律',
      '1. 只建会话，不动手：不修改任何文件；不替另一个助手做破坏性操作（删除、覆盖、force push、改配置一律不代劳）。',
      '2. 固定写法——参数以 JSON 走 stdin（没有位置参数）：',
      '',
      '   "$AIONUI_HELPER_BIN" conversation create <<\'JSON\'',
      '   {',
      '     "name": "任务短名",',
      '     "assistant_id": "目标助手的 id"',
      '   }',
      '   JSON',
      '',
      '   `name` 必填（短名，用用户的语言）；`workspace` 省略即沿用当前会话的目录，要换目录时传已存在的绝对路径；`assistant_id` 省略即复用当前助手，要派给另一个模式时先用 `"$AIONUI_HELPER_BIN" config assistants list` 查出目标模式（办公/开发/设计）的 id。',
      '3. 拿到 `data.id` 后把任务投过去（同样 stdin JSON）：',
      '',
      '   "$AIONUI_HELPER_BIN" session send-message <<\'JSON\'',
      '   {',
      '     "to": "上一步返回的 data.id",',
      '     "message": "任务正文：这是用户的委托、目标与边界、期望产出、已知结论与文件路径"',
      '   }',
      '   JSON',
      '',
      '   对方看不到你这边上下文，只收到这一条消息，会因此自己开一轮。正文里写清产出放哪。',
      '4. 绝不传递、内联、回显或设置任何 AIONUI_... 环境变量；payload 走 stdin heredoc，不要写 JSON 文件到磁盘。',
      '5. 一次交接只投一条：不追问、不等回复、不重复投递、不代对方执行。收到 `rate_limited` 立刻停手并如实报告（短时间交接太密），不要重试；被拒时照抄错误原文。',
      '6. 回执 ≤5 行：交给了哪个模式、新会话名 + data.id、投递状态（`delivered` / `queued` / 错误原文）、用户下一步在哪看结果。',
      '7. 失败时照抄 stdout/stderr 的错误摘要，不要声称已派单成功。',
    ].join('\n'),
    claudeTools: 'Bash',
    opencodePermission: { edit: 'deny', bash: 'allow', webfetch: 'deny' },
  },
];

function claudeAgentMd(def: SubAgentDef): string {
  return `---\nname: ${def.name}\ndescription: ${def.description}\ntools: ${def.claudeTools}\n---\n\n${def.body}\n`;
}

function opencodeAgentMd(def: SubAgentDef): string {
  const permission = Object.entries(def.opencodePermission)
    .map(([key, value]) => `  ${key}: ${value}`)
    .join('\n');
  return `---\ndescription: ${def.description}\nmode: subagent\npermission:\n${permission}\n---\n\n${def.body}\n`;
}

async function writeAgentDir(dir: string, files: Array<{ name: string; content: string }>): Promise<string[]> {
  await mkdir(dir, { recursive: true });
  const written: string[] = [];
  for (const file of files) {
    // eslint-disable-next-line no-await-in-loop
    await writeFile(join(dir, `${file.name}.md`), file.content, 'utf-8');
    written.push(file.name);
  }
  // Drop app-managed entries that no longer exist in the current set.
  const current = new Set(files.map((f) => `${f.name}.md`));
  for (const entry of await readdir(dir)) {
    if (entry.startsWith('zeus-') && entry.endsWith('.md') && !current.has(entry)) {
      // eslint-disable-next-line no-await-in-loop
      await rm(join(dir, entry), { force: true });
    }
  }
  return written;
}

export type AgentDefsSyncReport = {
  claudeDir: string;
  opencodeDir: string;
  agents: string[];
};

/** Whether a user-configured model serves the office (opencode) engine —
 *  computed by the model-provider sync from the same provider rows it
 *  injects as `zeus-*` config entries. On the free models the backend
 *  rejects every subagent request, so the opencode agents dir must hold no
 *  `zeus-*` entries (an empty set also removes stale ones). */
export type SubAgentDefsOptions = {
  opencodeHasUserModel: boolean;
};

export async function syncSubAgentDefinitions(
  paths: IsolatedRuntimePaths,
  opts: SubAgentDefsOptions
): Promise<AgentDefsSyncReport> {
  const claudeDir = join(paths.claudeConfigDir, 'agents');
  const opencodeDir = join(paths.opencodeConfigDir, 'agents');
  const claudeFiles = SUB_AGENT_DEFS.map((def) => ({ name: def.name, content: claudeAgentMd(def) }));
  const opencodeFiles = opts.opencodeHasUserModel
    ? SUB_AGENT_DEFS.map((def) => ({ name: def.name, content: opencodeAgentMd(def) }))
    : [];
  const [claudeAgents, opencodeAgents] = await Promise.all([
    writeAgentDir(claudeDir, claudeFiles),
    writeAgentDir(opencodeDir, opencodeFiles),
  ]);
  return { claudeDir, opencodeDir, agents: claudeAgents.length === opencodeAgents.length ? claudeAgents : [...claudeAgents, ...opencodeAgents] };
}
