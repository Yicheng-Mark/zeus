/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { syncSubAgentDefinitions } from '@process/isolatedRuntime/agentDefs';
import type { IsolatedRuntimePaths } from '@process/isolatedRuntime/paths';

describe('syncSubAgentDefinitions', () => {
  let root: string;
  let paths: IsolatedRuntimePaths;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'agent-defs-'));
    paths = {
      claudeConfigDir: join(root, 'claude'),
      opencodeConfigDir: join(root, 'opencode'),
    } as unknown as IsolatedRuntimePaths;
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('writes the four zeus-* agents into both runtime config dirs with engine-specific frontmatter', async () => {
    const report = await syncSubAgentDefinitions(paths, { opencodeHasUserModel: true });

    expect(report.agents).toEqual(['zeus-explorer', 'zeus-planner', 'zeus-critic', 'zeus-delegate']);

    const claudeMd = readFileSync(join(report.claudeDir, 'zeus-explorer.md'), 'utf-8');
    expect(claudeMd).toContain('name: zeus-explorer');
    expect(claudeMd).toContain('tools: Read, Grep, Glob, WebSearch, WebFetch');
    expect(claudeMd).not.toContain('mode: subagent');

    const opencodeMd = readFileSync(join(report.opencodeDir, 'zeus-explorer.md'), 'utf-8');
    expect(opencodeMd).toContain('mode: subagent');
    expect(opencodeMd).toContain('description: ');
    expect(opencodeMd).toContain('edit: deny');
  });

  it('is idempotent and removes stale app-managed entries, keeping user files', async () => {
    // A stale app-managed entry and a user-authored agent both exist.
    const claudeAgents = join(paths.claudeConfigDir, 'agents');
    mkdirSync(claudeAgents, { recursive: true });
    writeFileSync(join(claudeAgents, 'zeus-deprecated.md'), '---\nname: zeus-deprecated\n---\n', 'utf-8');
    writeFileSync(join(claudeAgents, 'user-own.md'), 'user content', 'utf-8');

    await syncSubAgentDefinitions(paths, { opencodeHasUserModel: true });

    expect(existsSync(join(claudeAgents, 'zeus-deprecated.md'))).toBe(false);
    expect(existsSync(join(claudeAgents, 'user-own.md'))).toBe(true);
    expect(existsSync(join(claudeAgents, 'zeus-planner.md'))).toBe(true);
  });

  it('free tier: removes zeus-* entries from the opencode dir, keeps claude intact', async () => {
    // The office engine on the free models must not carry sub-agent defs:
    // its backend rejects every subagent request. Stale app-managed entries
    // from a previous configured state are cleaned up; user files stay.
    const freeRoot = mkdtempSync(join(tmpdir(), 'agent-defs-free-'));
    const freePaths = {
      claudeConfigDir: join(freeRoot, 'claude'),
      opencodeConfigDir: join(freeRoot, 'opencode'),
    } as unknown as IsolatedRuntimePaths;

    // A previous boot with a user model seeded both dirs.
    await syncSubAgentDefinitions(freePaths, { opencodeHasUserModel: true });
    const opencodeAgents = join(freePaths.opencodeConfigDir, 'agents');
    writeFileSync(join(opencodeAgents, 'user-own.md'), 'user content', 'utf-8');
    expect(existsSync(join(opencodeAgents, 'zeus-explorer.md'))).toBe(true);

    const report = await syncSubAgentDefinitions(freePaths, { opencodeHasUserModel: false });

    expect(existsSync(join(opencodeAgents, 'zeus-explorer.md'))).toBe(false);
    expect(existsSync(join(opencodeAgents, 'user-own.md'))).toBe(true);
    expect(existsSync(join(report.claudeDir, 'zeus-explorer.md'))).toBe(true);
    expect(existsSync(join(report.claudeDir, 'zeus-delegate.md'))).toBe(true);
    rmSync(freeRoot, { recursive: true, force: true });
  });

  it('every definition body keeps the lean-context discipline the mode rules rely on', async () => {
    const report = await syncSubAgentDefinitions(paths, { opencodeHasUserModel: true });
    for (const name of report.agents) {
      const body = readFileSync(join(report.claudeDir, `${name}.md`), 'utf-8');
      expect(body.length, `${name} should stay compact`).toBeLessThan(2000);
    }
  });

  it('zeus-delegate carries the verified helper invocation, its when-not-to clause, and no edit permission', async () => {
    const report = await syncSubAgentDefinitions(paths, { opencodeHasUserModel: true });

    const claudeMd = readFileSync(join(report.claudeDir, 'zeus-delegate.md'), 'utf-8');
    expect(claudeMd).toContain('name: zeus-delegate');
    // Handoff needs a shell, and only a shell.
    expect(claudeMd).toContain('tools: Bash');
    expect(claudeMd).not.toContain('mode: subagent');
    // The exact contract verified from AionCore's `aioncore conversation create`
    // and `aioncore session send-message`: a handoff is both calls, in order.
    expect(claudeMd).toContain('"$AIONUI_HELPER_BIN" conversation create');
    expect(claudeMd).toContain('"$AIONUI_HELPER_BIN" session send-message');
    expect(claudeMd).toContain("<<'JSON'");
    // The loop guard: one delivery per handoff, stop on the rate gate.
    expect(claudeMd).toContain('rate_limited');
    expect(claudeMd).toContain('一次交接只投一条');
    // When NOT to use it.
    expect(claudeMd).toContain('不要用于');

    const opencodeMd = readFileSync(join(report.opencodeDir, 'zeus-delegate.md'), 'utf-8');
    expect(opencodeMd).toContain('mode: subagent');
    expect(opencodeMd).toContain('"$AIONUI_HELPER_BIN" conversation create');
    expect(opencodeMd).toContain('"$AIONUI_HELPER_BIN" session send-message');
    expect(opencodeMd).toContain('edit: deny');
    expect(opencodeMd).toContain('bash: allow');
  });
});
