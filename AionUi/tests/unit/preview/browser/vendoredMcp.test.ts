/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveVendoredChromeDevtoolsMcp } from '@/process/resources/builtinMcp/vendoredMcp';

/**
 * resolveVendoredChromeDevtoolsMcp walks packaged-resources first, then the
 * repo checkout via process.cwd() — dev builds that ran the staging script
 * resolve through the cwd branch, which is what these fixtures exercise.
 */
describe('resolveVendoredChromeDevtoolsMcp', () => {
  let tmp: string;
  const originalCwd = process.cwd();

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'aionui-vendored-mcp-'));
    process.chdir(tmp);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tmp, { recursive: true, force: true });
  });

  const runtimeDir = () =>
    join(tmp, 'resources', 'bundled-aioncore', `${process.platform}-${process.arch}`, 'managed-resources');

  const stageVendor = ({ manifestEntry = 'node_modules/chrome-devtools-mcp/build/src/index.js' } = {}) => {
    const pkgDir = join(runtimeDir(), 'mcp', 'chrome-devtools-mcp');
    mkdirSync(join(pkgDir, 'node_modules', 'chrome-devtools-mcp', 'build', 'src'), { recursive: true });
    writeFileSync(
      join(pkgDir, 'vendor-manifest.json'),
      `${JSON.stringify({ name: 'chrome-devtools-mcp', version: '0.16.0', entry: manifestEntry }, null, 2)}\n`
    );
    writeFileSync(join(pkgDir, 'node_modules', 'chrome-devtools-mcp', 'build', 'src', 'index.js'), '// entry');
  };

  it('resolves the staged entry through the cwd fallback branch', () => {
    stageVendor();

    const resolved = resolveVendoredChromeDevtoolsMcp();

    expect(resolved).not.toBeNull();
    expect(resolved?.version).toBe('0.16.0');
    expect(resolved?.entry).toBe(join(runtimeDir(), 'mcp', 'chrome-devtools-mcp', 'node_modules/chrome-devtools-mcp/build/src/index.js'));
  });

  it('returns null when no vendor manifest is staged', () => {
    expect(resolveVendoredChromeDevtoolsMcp()).toBeNull();
  });

  it('returns null when the manifest lacks an entry or the entry file is missing', () => {
    stageVendor({ manifestEntry: '' });
    expect(resolveVendoredChromeDevtoolsMcp()).toBeNull();

    // Entry declared but the file itself was not staged.
    stageVendor({ manifestEntry: 'node_modules/chrome-devtools-mcp/build/src/missing.js' });
    expect(resolveVendoredChromeDevtoolsMcp()).toBeNull();
  });
});
