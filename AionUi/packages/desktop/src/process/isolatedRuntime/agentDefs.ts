/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Ship generic sub-agent definitions into BOTH isolated CLI runtimes so the
 * 办公/开发 engines can act on the orchestration guidance from their mode rule
 * (assistant-rules) and the multi-agent-orchestration skill:
 *
 *  - Claude Code reads user-level subagents from `$CLAUDE_CONFIG_DIR/agents/*.md`
 *    (frontmatter: name / description / tools).
 *  - OpenCode reads them from `$OPENCODE_CONFIG_DIR/agents/<name>.md`
 *    (frontmatter: description [required] / mode: subagent / permission),
 *    invoked through its Task tool.
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

export async function syncSubAgentDefinitions(paths: IsolatedRuntimePaths): Promise<AgentDefsSyncReport> {
  const claudeDir = join(paths.claudeConfigDir, 'agents');
  const opencodeDir = join(paths.opencodeConfigDir, 'agents');
  const [claudeAgents, opencodeAgents] = await Promise.all([
    writeAgentDir(claudeDir, SUB_AGENT_DEFS.map((def) => ({ name: def.name, content: claudeAgentMd(def) }))),
    writeAgentDir(opencodeDir, SUB_AGENT_DEFS.map((def) => ({ name: def.name, content: opencodeAgentMd(def) }))),
  ]);
  return { claudeDir, opencodeDir, agents: claudeAgents.length === opencodeAgents.length ? claudeAgents : [...claudeAgents, ...opencodeAgents] };
}
