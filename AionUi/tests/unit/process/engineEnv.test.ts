/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  aioncoreEngineEnv,
  ENGINE_ENV_CLAUDE_CONFIG_DIR,
  ENGINE_ENV_CLAUDE_EXE,
  ENGINE_ENV_OPENCODE_CONFIG_DIR,
  ENGINE_ENV_OPENCODE_EXE,
} from '@/process/isolatedRuntime/engineEnv';
import { getIsolatedRuntimePaths } from '@/process/isolatedRuntime/paths';

const paths = getIsolatedRuntimePaths();

describe('aioncoreEngineEnv', () => {
  it('maps the four engine isolation env keys to the isolated runtime paths (no bundle)', () => {
    const env = aioncoreEngineEnv(paths, null);
    expect(env[ENGINE_ENV_CLAUDE_EXE]).toBe(paths.claudeExe);
    expect(env[ENGINE_ENV_CLAUDE_CONFIG_DIR]).toBe(paths.claudeConfigDir);
    expect(env[ENGINE_ENV_OPENCODE_EXE]).toBe(paths.opencodeExe);
    expect(env[ENGINE_ENV_OPENCODE_CONFIG_DIR]).toBe(paths.opencodeConfigDir);
  });

  it('prefers bundled binaries for the exe keys when a bundle resolves', () => {
    const env = aioncoreEngineEnv(paths, {
      root: '/bundle',
      claudeExe: '/bundle/claude/claude.exe',
      opencodeExe: '/bundle/opencode/opencode.exe',
      claudeVersion: '2.1.296',
      opencodeVersion: '1.18.35',
    });
    expect(env[ENGINE_ENV_CLAUDE_EXE]).toBe('/bundle/claude/claude.exe');
    expect(env[ENGINE_ENV_OPENCODE_EXE]).toBe('/bundle/opencode/opencode.exe');
    // Config dirs always point at the isolated tree, never the bundle.
    expect(env[ENGINE_ENV_CLAUDE_CONFIG_DIR]).toBe(paths.claudeConfigDir);
    expect(env[ENGINE_ENV_OPENCODE_CONFIG_DIR]).toBe(paths.opencodeConfigDir);
  });
});
