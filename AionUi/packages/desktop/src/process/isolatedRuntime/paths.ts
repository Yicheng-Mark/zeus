/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Fully-isolated agent runtime layout.
 *
 * Every CLI binary the app spawns and every config/data directory those CLIs
 * write lives under one private root (%LOCALAPPDATA%\AionUiAgent on Windows).
 * The user's own global `claude` / `opencode` installs — binaries, configs,
 * auth, plugins, session history — are never read or written:
 *
 *   runtime\claude\claude.exe        app-managed Claude Code (from the Agent
 *                                    SDK platform package, not the PATH copy)
 *   runtime\opencode\opencode.exe    app-managed OpenCode (GitHub release zip)
 *   agents\claude\                   CLAUDE_CONFIG_DIR target
 *   agents\opencode\                 OPENCODE_CONFIG_DIR target
 *   agents\opencode\xdg\{config,data,cache}   XDG redirect for OpenCode
 */

import { join } from 'node:path';
import { mkdirSync } from 'node:fs';

export type IsolatedRuntimePaths = {
  root: string;
  runtimeDir: string;
  claudeDir: string;
  opencodeDir: string;
  claudeExe: string;
  opencodeExe: string;
  claudeConfigDir: string;
  opencodeConfigDir: string;
  opencodeXdgConfig: string;
  opencodeXdgData: string;
  opencodeXdgCache: string;
  versionsFile: string;
};

export function getIsolatedRuntimePaths(): IsolatedRuntimePaths {
  const home = process.env.USERPROFILE ?? process.env.HOME ?? '.';
  const localAppData = process.env.LOCALAPPDATA ?? join(home, 'AppData', 'Local');
  const root = join(localAppData, 'AionUiAgent');
  const runtimeDir = join(root, 'runtime');
  const claudeDir = join(runtimeDir, 'claude');
  const opencodeDir = join(runtimeDir, 'opencode');
  const opencodeAgentDir = join(root, 'agents', 'opencode');
  const xdgRoot = join(opencodeAgentDir, 'xdg');
  return {
    root,
    runtimeDir,
    claudeDir,
    opencodeDir,
    claudeExe: join(claudeDir, process.platform === 'win32' ? 'claude.exe' : 'claude'),
    opencodeExe: join(opencodeDir, process.platform === 'win32' ? 'opencode.exe' : 'opencode'),
    claudeConfigDir: join(root, 'agents', 'claude'),
    opencodeConfigDir: join(opencodeAgentDir, 'config'),
    opencodeXdgConfig: join(xdgRoot, 'config'),
    opencodeXdgData: join(xdgRoot, 'data'),
    opencodeXdgCache: join(xdgRoot, 'cache'),
    versionsFile: join(runtimeDir, 'VERSIONS.txt'),
  };
}

/** Create every directory the isolated CLIs may write to. Idempotent. */
export function ensureIsolatedDirs(paths: IsolatedRuntimePaths): void {
  for (const dir of [
    paths.root,
    paths.runtimeDir,
    paths.claudeDir,
    paths.opencodeDir,
    paths.claudeConfigDir,
    paths.opencodeConfigDir,
    paths.opencodeXdgConfig,
    paths.opencodeXdgData,
    paths.opencodeXdgCache,
  ]) {
    mkdirSync(dir, { recursive: true });
  }
}
