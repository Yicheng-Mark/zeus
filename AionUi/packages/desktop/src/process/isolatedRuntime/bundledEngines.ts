/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Resolve the engine binaries bundled with the app (claude / opencode under
 * resources/engines/<platform>-<arch>). The build pipeline stages them via
 * packages/shared-scripts prepare-engine-runtimes; the app runs them
 * directly from the install directory (no copy to LOCALAPPDATA), so the
 * engines are ready the moment the app opens — first launch works offline.
 *
 * When no bundle resolves (dev without prepared resources, corrupted
 * install), callers fall back to the download-into-LOCALAPPDATA flow in
 * ensureRuntime.ts.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export type BundledEngines = {
  root: string;
  claudeExe: string;
  opencodeExe: string;
  claudeVersion: string;
  opencodeVersion: string;
};

type EnginesManifest = {
  runtimeKey?: string;
  binariesBundled?: boolean;
  claude?: { version?: string };
  opencode?: { version?: string };
};

/** Candidate bundle roots: packaged app resources first, repo checkout (dev) second. */
export function bundledEngineRootCandidates(runtimeKey: string): string[] {
  const candidates: string[] = [];
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  if (resourcesPath) candidates.push(join(resourcesPath, 'engines', runtimeKey));
  candidates.push(join(process.cwd(), 'resources', 'engines', runtimeKey));
  return candidates;
}

/** Validate one bundle root against the manifest contract; `null` = not usable. */
export function readBundledEnginesAt(root: string, runtimeKey: string): BundledEngines | null {
  let manifest: EnginesManifest;
  try {
    manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8')) as EnginesManifest;
  } catch {
    return null;
  }
  if (manifest.runtimeKey !== runtimeKey || manifest.binariesBundled !== true) return null;
  const { claudeVersion, opencodeVersion } = {
    claudeVersion: manifest.claude?.version,
    opencodeVersion: manifest.opencode?.version,
  };
  if (!claudeVersion || !opencodeVersion) return null;
  const claudeExe = join(root, 'claude', process.platform === 'win32' ? 'claude.exe' : 'claude');
  const opencodeExe = join(root, 'opencode', process.platform === 'win32' ? 'opencode.exe' : 'opencode');
  if (!existsSync(claudeExe) || !existsSync(opencodeExe)) return null;
  return { root, claudeExe, opencodeExe, claudeVersion, opencodeVersion };
}

/** Resolve the bundled engines for this platform, or `null` when not bundled. */
export function resolveBundledEngines(): BundledEngines | null {
  const runtimeKey = `${process.platform}-${process.arch}`;
  for (const root of bundledEngineRootCandidates(runtimeKey)) {
    const engines = readBundledEnginesAt(root, runtimeKey);
    if (engines) return engines;
  }
  return null;
}
