/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { bundledEngineRootCandidates, readBundledEnginesAt } from '@/process/isolatedRuntime/bundledEngines';

const tempRoots: string[] = [];
function bundleDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'bundled-engines-test-'));
  tempRoots.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of tempRoots) rmSync(dir, { recursive: true, force: true });
});

const RUNTIME_KEY = `${process.platform}-${process.arch}`;

function stageBinaries(root: string) {
  const claudeName = process.platform === 'win32' ? 'claude.exe' : 'claude';
  const opencodeName = process.platform === 'win32' ? 'opencode.exe' : 'opencode';
  mkdirSync(join(root, 'claude'), { recursive: true });
  mkdirSync(join(root, 'opencode'), { recursive: true });
  writeFileSync(join(root, 'claude', claudeName), 'stub');
  writeFileSync(join(root, 'opencode', opencodeName), 'stub');
}

describe('readBundledEnginesAt', () => {
  it('accepts a valid bundle and reports manifest versions', () => {
    const root = bundleDir();
    stageBinaries(root);
    writeFileSync(
      join(root, 'manifest.json'),
      JSON.stringify({ runtimeKey: RUNTIME_KEY, binariesBundled: true, claude: { version: '2.1.296' }, opencode: { version: '1.18.35' } })
    );
    const engines = readBundledEnginesAt(root, RUNTIME_KEY);
    expect(engines?.root).toBe(root);
    expect(engines?.claudeVersion).toBe('2.1.296');
    expect(engines?.opencodeVersion).toBe('1.18.35');
    expect(engines?.claudeExe).toBe(join(root, 'claude', process.platform === 'win32' ? 'claude.exe' : 'claude'));
  });

  it('rejects a runtimeKey mismatch', () => {
    const root = bundleDir();
    stageBinaries(root);
    writeFileSync(
      join(root, 'manifest.json'),
      JSON.stringify({ runtimeKey: 'other-arch', binariesBundled: true, claude: { version: '1' }, opencode: { version: '1' } })
    );
    expect(readBundledEnginesAt(root, RUNTIME_KEY)).toBeNull();
  });

  it('rejects a not-bundled manifest (platforms without binaries)', () => {
    const root = bundleDir();
    writeFileSync(join(root, 'manifest.json'), JSON.stringify({ runtimeKey: RUNTIME_KEY, binariesBundled: false }));
    expect(readBundledEnginesAt(root, RUNTIME_KEY)).toBeNull();
  });

  it('rejects a manifest with missing versions or missing binaries', () => {
    const root = bundleDir();
    stageBinaries(root);
    writeFileSync(
      join(root, 'manifest.json'),
      JSON.stringify({ runtimeKey: RUNTIME_KEY, binariesBundled: true, claude: { version: '1' } })
    );
    expect(readBundledEnginesAt(root, RUNTIME_KEY), 'missing opencode version').toBeNull();

    const root2 = bundleDir();
    mkdirSync(join(root2, 'claude'), { recursive: true });
    writeFileSync(join(root2, 'claude', process.platform === 'win32' ? 'claude.exe' : 'claude'), 'stub');
    writeFileSync(
      join(root2, 'manifest.json'),
      JSON.stringify({ runtimeKey: RUNTIME_KEY, binariesBundled: true, claude: { version: '1' }, opencode: { version: '1' } })
    );
    expect(readBundledEnginesAt(root2, RUNTIME_KEY), 'missing opencode binary').toBeNull();
  });

  it('returns null for a directory without a manifest', () => {
    const root = bundleDir();
    expect(readBundledEnginesAt(root, RUNTIME_KEY)).toBeNull();
  });
});

describe('bundledEngineRootCandidates', () => {
  it('offers the packaged resources dir first (when running under Electron) and the repo checkout last', () => {
    const candidates = bundledEngineRootCandidates('win32-x64');
    const hasResourcesPath = Boolean((process as NodeJS.Process & { resourcesPath?: string }).resourcesPath);
    expect(candidates).toHaveLength(hasResourcesPath ? 2 : 1);
    if (hasResourcesPath) expect(candidates[0]).toContain(join('engines', 'win32-x64'));
    expect(candidates[candidates.length - 1]).toContain(join('resources', 'engines', 'win32-x64'));
  });
});
