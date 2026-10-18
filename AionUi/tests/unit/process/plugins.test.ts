/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  DOCUMENT_SKILL_NAMES,
  syncDocumentSkillsToOpenCode,
} from '@process/isolatedRuntime/plugins';
import type { IsolatedRuntimePaths } from '@process/isolatedRuntime/paths';

/** Lay out the installed document-skills plugin the way `claude plugin
 *  install` leaves it in the cache, with all four skills present. */
function seedDocumentSkillsPlugin(claudeConfigDir: string, version = '1.0.0'): void {
  const skillsRoot = join(claudeConfigDir, 'plugins', 'cache', 'anthropic-agent-skills', 'document-skills', version, 'skills');
  for (const name of ['docx', 'xlsx', 'pptx', 'pdf']) {
    mkdirSync(join(skillsRoot, name), { recursive: true });
    writeFileSync(join(skillsRoot, name, 'SKILL.md'), `---\nname: ${name}\n---\n`, 'utf-8');
  }
}

describe('syncDocumentSkillsToOpenCode', () => {
  let root: string;
  let paths: IsolatedRuntimePaths;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'doc-skills-'));
    paths = {
      claudeConfigDir: join(root, 'claude'),
      opencodeConfigDir: join(root, 'opencode'),
    } as unknown as IsolatedRuntimePaths;
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('mirrors the office document skills but never a second skill named pdf', async () => {
    seedDocumentSkillsPlugin(paths.claudeConfigDir);

    const log = await syncDocumentSkillsToOpenCode(paths);

    const opencodeSkills = join(paths.opencodeConfigDir, 'skills');
    for (const name of ['docx', 'xlsx', 'pptx']) {
      expect(existsSync(join(opencodeSkills, name, 'SKILL.md')), `${name} should be mirrored`).toBe(true);
    }
    // The corpus ships `pdf` under that exact name and reaches office through
    // the skills index; a mirror copy here would collide with it.
    expect(DOCUMENT_SKILL_NAMES).not.toContain('pdf');
    expect(existsSync(join(opencodeSkills, 'pdf')), 'pdf must not be mirrored twice').toBe(false);
    expect(log.some((line) => line.includes('pdf'))).toBe(false);
  });

  it('reports a missing plugin checkout without throwing', async () => {
    const emptyPaths = {
      claudeConfigDir: join(root, 'claude-empty'),
      opencodeConfigDir: join(root, 'opencode-empty'),
    } as unknown as IsolatedRuntimePaths;

    const log = await syncDocumentSkillsToOpenCode(emptyPaths);

    expect(log.join('\n')).toContain('install document-skills first');
    expect(existsSync(join(emptyPaths.opencodeConfigDir, 'skills'))).toBe(false);
  });
});
