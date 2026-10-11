/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Install the knowledge-work / document plugin set into the ISOLATED Claude
 * Code environment (the app-managed claude.exe + CLAUDE_CONFIG_DIR under
 * %LOCALAPPDATA%\AionUiAgent). Plugins land in the isolated config dir only;
 * the user's global ~/.claude is untouched.
 *
 * All commands are idempotent: re-running reports "already installed" and
 * succeeds, so this doubles as a repair action from the settings UI.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { cp, mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { IsolatedRuntimePaths } from './paths';

/** The 17 Anthropic-authored plugins in anthropics/knowledge-work-plugins. */
export const KNOWLEDGE_WORK_PLUGINS = [
  'productivity',
  'sales',
  'finance',
  'data',
  'legal',
  'marketing',
  'customer-support',
  'product-management',
  'engineering',
  'human-resources',
  'design',
  'operations',
  'small-business',
  'bio-research',
  'enterprise-search',
  'cowork-plugin-management',
  'pdf-viewer',
] as const;

/** docx/xlsx/pptx/pdf authoring from anthropics/skills (source-available). */
export const DOCUMENT_SKILLS_PLUGIN = 'document-skills@anthropic-agent-skills';

/** The four document skills mirrored into the isolated OpenCode skills dir. */
export const DOCUMENT_SKILL_NAMES = ['docx', 'xlsx', 'pptx', 'pdf'] as const;

const MARKETPLACES = [
  'anthropics/knowledge-work-plugins',
  'anthropics/skills',
];

export type PluginInstallReport = {
  ok: boolean;
  log: string[];
};

function runIsolatedClaude(paths: IsolatedRuntimePaths, args: string[]): Promise<string> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(paths.claudeExe, args, {
      env: {
        ...process.env,
        CLAUDE_CONFIG_DIR: paths.claudeConfigDir,
        DISABLE_AUTOUPDATER: '1',
        DISABLE_TELEMETRY: '1',
      },
      windowsHide: true,
    });
    let out = '';
    child.stdout.on('data', (chunk: Buffer) => {
      out += chunk.toString('utf-8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      out += chunk.toString('utf-8');
    });
    child.on('error', rejectPromise);
    child.on('close', (code) => {
      if (code === 0) resolvePromise(out.trim());
      else rejectPromise(new Error(`claude ${args.join(' ')} exited ${code}: ${out.trim().slice(-400)}`));
    });
  });
}

/**
 * Mirror the document-skills SKILL.md folders into OpenCode's isolated
 * global skills dir. OpenCode reads skills from
 * `$OPENCODE_CONFIG_DIR/skills/<name>/SKILL.md` and the SKILL.md format is
 * shared with Claude Code, so a plain copy makes docx/xlsx/pptx/pdf
 * authoring work in OpenCode sessions too.
 */
export async function syncDocumentSkillsToOpenCode(paths: IsolatedRuntimePaths): Promise<string[]> {
  const log: string[] = [];
  const cacheRoot = join(paths.claudeConfigDir, 'plugins', 'cache', 'anthropic-agent-skills', 'document-skills');
  if (!existsSync(cacheRoot)) {
    return [`${cacheRoot} not found — install document-skills first`];
  }
  const versions = await readdir(cacheRoot);
  const latest = versions[versions.length - 1];
  const skillsSrc = join(cacheRoot, latest, 'skills');
  if (!existsSync(skillsSrc)) {
    return [`${skillsSrc} not found`];
  }
  const skillsDst = join(paths.opencodeConfigDir, 'skills');
  await mkdir(skillsDst, { recursive: true });
  for (const name of DOCUMENT_SKILL_NAMES) {
    const src = join(skillsSrc, name);
    if (!existsSync(src)) {
      log.push(`skill "${name}" missing in document-skills checkout`);
      continue;
    }
    // eslint-disable-next-line no-await-in-loop
    await cp(src, join(skillsDst, name), { recursive: true, force: true });
    log.push(`synced skill "${name}" -> ${join(skillsDst, name)}`);
  }
  return log;
}

export async function installIsolatedPlugins(paths: IsolatedRuntimePaths): Promise<PluginInstallReport> {
  const log: string[] = [];
  if (!existsSync(paths.claudeExe)) {
    return { ok: false, log: ['isolated claude.exe not found — let the runtime bootstrap finish first'] };
  }

  try {
    // Sequential on purpose: every command mutates the same isolated config
    // dir; concurrent claude processes would race on plugins/known_marketplaces.
    for (const marketplace of MARKETPLACES) {
      log.push(`$ claude plugin marketplace add ${marketplace}`);
      // eslint-disable-next-line no-await-in-loop
      log.push(await runIsolatedClaude(paths, ['plugin', 'marketplace', 'add', marketplace]));
    }
    for (const plugin of KNOWLEDGE_WORK_PLUGINS) {
      const spec = `${plugin}@knowledge-work-plugins`;
      log.push(`$ claude plugin install ${spec}`);
      // eslint-disable-next-line no-await-in-loop
      log.push(await runIsolatedClaude(paths, ['plugin', 'install', spec]));
    }
    log.push(`$ claude plugin install ${DOCUMENT_SKILLS_PLUGIN}`);
    log.push(await runIsolatedClaude(paths, ['plugin', 'install', DOCUMENT_SKILLS_PLUGIN]));
    log.push('$ sync document skills -> OpenCode');
    // eslint-disable-next-line no-await-in-loop
    log.push(...(await syncDocumentSkillsToOpenCode(paths)));
    return { ok: true, log };
  } catch (err) {
    log.push(`ERROR: ${err instanceof Error ? err.message : String(err)}`);
    return { ok: false, log };
  }
}
