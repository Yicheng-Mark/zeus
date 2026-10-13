/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Engine-isolation env injected into the aioncore process at spawn (the same
 * seam as AIONUI_CACHE_DIR / AIONUI_WORK_DIR). aioncore's MCP adapters read
 * these to locate the app-managed engine binaries and their isolated config
 * dirs, so MCP config detection/sync never touches the user's global
 * claude / opencode configuration. Pure path computation — existence is
 * checked by the adapters at call time, so this is safe to call before the
 * isolated directory tree exists.
 */

import { getIsolatedRuntimePaths, type IsolatedRuntimePaths } from './paths';
import { resolveBundledEngines, type BundledEngines } from './bundledEngines';

export const ENGINE_ENV_CLAUDE_EXE = 'AIONUI_ENGINE_CLAUDE_EXE';
export const ENGINE_ENV_CLAUDE_CONFIG_DIR = 'AIONUI_ENGINE_CLAUDE_CONFIG_DIR';
export const ENGINE_ENV_OPENCODE_EXE = 'AIONUI_ENGINE_OPENCODE_EXE';
export const ENGINE_ENV_OPENCODE_CONFIG_DIR = 'AIONUI_ENGINE_OPENCODE_CONFIG_DIR';

/** Env mapping the app-managed engine locations for the aioncore process.
 *  `bundled` is injectable for tests; production resolves it from the app
 *  resources. */
export function aioncoreEngineEnv(
  paths: IsolatedRuntimePaths = getIsolatedRuntimePaths(),
  bundled: BundledEngines | null = resolveBundledEngines()
): Record<string, string> {
  // Bundled binaries win: they are what the session overrides point at.
  return {
    [ENGINE_ENV_CLAUDE_EXE]: bundled?.claudeExe ?? paths.claudeExe,
    [ENGINE_ENV_CLAUDE_CONFIG_DIR]: paths.claudeConfigDir,
    [ENGINE_ENV_OPENCODE_EXE]: bundled?.opencodeExe ?? paths.opencodeExe,
    [ENGINE_ENV_OPENCODE_CONFIG_DIR]: paths.opencodeConfigDir,
  };
}
