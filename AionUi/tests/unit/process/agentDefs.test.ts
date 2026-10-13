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

  it('writes the three zeus-* agents into both runtime config dirs with engine-specific frontmatter', async () => {
    const report = await syncSubAgentDefinitions(paths);

    expect(report.agents).toEqual(['zeus-explorer', 'zeus-planner', 'zeus-critic']);

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

    await syncSubAgentDefinitions(paths);

    expect(existsSync(join(claudeAgents, 'zeus-deprecated.md'))).toBe(false);
    expect(existsSync(join(claudeAgents, 'user-own.md'))).toBe(true);
    expect(existsSync(join(claudeAgents, 'zeus-planner.md'))).toBe(true);
  });

  it('every definition body keeps the lean-context discipline the mode rules rely on', async () => {
    const report = await syncSubAgentDefinitions(paths);
    for (const name of report.agents) {
      const body = readFileSync(join(report.claudeDir, `${name}.md`), 'utf-8');
      expect(body.length, `${name} should stay compact`).toBeLessThan(2000);
    }
  });
});
