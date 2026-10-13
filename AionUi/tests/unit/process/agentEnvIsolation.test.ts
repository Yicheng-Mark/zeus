/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { ANTHROPIC_NEUTRALIZED_KEYS, claudeEnv, opencodeEnv } from '@/process/isolatedRuntime/agentOverrides';
import {
  applyActiveProviderEnv,
  claudeProviderCandidates,
  claudeSyncSkipped,
  enabledModels,
  type ProviderRow,
} from '@/process/isolatedRuntime/modelProviders';
import { isolatedClaudeSpawnEnv } from '@/process/isolatedRuntime/plugins';
import { getIsolatedRuntimePaths } from '@/process/isolatedRuntime/paths';

const paths = getIsolatedRuntimePaths();

const row = (overrides: Partial<ProviderRow>): ProviderRow => ({
  id: 'test',
  platform: 'custom',
  base_url: 'https://api.deepseek.com/v1',
  api_key: 'sk-multi-a, sk-multi-b',
  models: ['deepseek-flash'],
  ...overrides,
});

describe('claudeEnv host-environment isolation', () => {
  it('neutralizes every credential/model-routing ANTHROPIC_* variable with empty values', () => {
    const env = claudeEnv(paths);
    const entry = (name: string) => env.find((e) => e.name === name);

    expect(entry('CLAUDE_CONFIG_DIR')?.value).toBe(paths.claudeConfigDir);
    for (const key of ANTHROPIC_NEUTRALIZED_KEYS) {
      expect(entry(key), `${key} must be present`).toBeDefined();
      expect(entry(key)?.value, `${key} must be empty so inherited values cannot leak`).toBe('');
    }
  });
});

describe('opencodeEnv config redirection', () => {
  it('moves config, data and cache off the user-global XDG locations', () => {
    const env = opencodeEnv(paths);
    const value = (name: string) => env.find((e) => e.name === name)?.value;

    expect(value('OPENCODE_CONFIG_DIR')).toBe(paths.opencodeConfigDir);
    expect(value('XDG_CONFIG_HOME')).toBe(paths.opencodeXdgConfig);
    expect(value('XDG_DATA_HOME')).toBe(paths.opencodeXdgData);
    expect(value('XDG_CACHE_HOME')).toBe(paths.opencodeXdgCache);
  });
});

describe('isolatedClaudeSpawnEnv', () => {
  it('neutralizes host ANTHROPIC_* credentials even when the app was launched from a polluted shell', () => {
    const previousApiKey = process.env.ANTHROPIC_API_KEY;
    const previousBaseUrl = process.env.ANTHROPIC_BASE_URL;
    process.env.ANTHROPIC_API_KEY = 'sk-host-leak';
    process.env.ANTHROPIC_BASE_URL = 'https://host-relay.example';
    try {
      const env = isolatedClaudeSpawnEnv(paths);
      expect(env.ANTHROPIC_API_KEY).toBe('');
      expect(env.ANTHROPIC_BASE_URL).toBe('');
      expect(env.CLAUDE_CONFIG_DIR).toBe(paths.claudeConfigDir);
    } finally {
      if (previousApiKey === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = previousApiKey;
      if (previousBaseUrl === undefined) delete process.env.ANTHROPIC_BASE_URL;
      else process.env.ANTHROPIC_BASE_URL = previousBaseUrl;
    }
  });
});

describe('enabledModels', () => {
  it('drops models switched off in model_enabled and keeps the rest', () => {
    const provider = row({
      models: ['glm-4.6', 'glm-4.5-flash', 'glm-4.5-air'],
      model_enabled: { 'glm-4.5-flash': false },
    });
    expect(enabledModels(provider)).toEqual(['glm-4.6', 'glm-4.5-air']);
  });

  it('keeps every model when model_enabled is absent', () => {
    expect(enabledModels(row({ models: ['a', 'b'] }))).toEqual(['a', 'b']);
  });
});

describe('claudeProviderCandidates', () => {
  it('accepts the anthropic platform, dual-protocol custom rows and anthropic-protocol new-api rows', () => {
    const providers = [
      row({ id: 'a', platform: 'anthropic', base_url: 'https://api.anthropic.com' }),
      row({ id: 'b', platform: 'custom', anthropic_base_url: 'https://api.deepseek.com/anthropic' }),
      row({ id: 'c', platform: 'new-api', models: ['claude-sonnet-4'], model_protocols: { 'claude-sonnet-4': 'anthropic' } }),
      // OpenAI-only custom rows and openai-protocol new-api rows cannot serve claude.
      row({ id: 'd', platform: 'custom' }),
      row({ id: 'e', platform: 'new-api', model_protocols: { 'gpt-4o': 'openai' } }),
      // Disabled / keyless / unscoped rows are excluded.
      row({ id: 'f', platform: 'anthropic', enabled: false }),
      row({ id: 'g', platform: 'anthropic', api_key: '' }),
      row({ id: 'h', platform: 'custom', anthropic_base_url: 'https://x/anthropic', agent_scopes: ['opencode'] }),
    ];

    expect(claudeProviderCandidates(providers).map((p) => p.id)).toEqual(['a', 'b', 'c']);
  });

  it('excludes new-api rows whose only anthropic-protocol model is switched off', () => {
    const providers = [
      row({
        id: 'off',
        platform: 'new-api',
        models: ['claude-x', 'gpt-4o'],
        model_protocols: { 'claude-x': 'anthropic', 'gpt-4o': 'openai' },
        model_enabled: { 'claude-x': false },
      }),
      row({
        id: 'on',
        platform: 'new-api',
        models: ['claude-x', 'gpt-4o'],
        model_protocols: { 'claude-x': 'anthropic', 'gpt-4o': 'openai' },
      }),
    ];

    expect(claudeProviderCandidates(providers).map((p) => p.id)).toEqual(['on']);
  });
});

describe('claudeSyncSkipped', () => {
  it('names a custom provider scoped to claude without an Anthropic URL (the "Not logged in" trap)', () => {
    const providers = [row({ id: 'deepseek', name: 'DeepSeek', agent_scopes: ['aionrs', 'claude', 'opencode'] })];
    expect(claudeSyncSkipped(providers)).toEqual([
      { id: 'deepseek', name: 'DeepSeek', reason: 'missing_anthropic_base_url' },
    ]);
  });

  it('stays silent once the Anthropic URL is filled in', () => {
    const providers = [
      row({
        id: 'deepseek',
        name: 'DeepSeek',
        agent_scopes: ['claude'],
        anthropic_base_url: 'https://api.deepseek.com/anthropic',
      }),
    ];
    expect(claudeSyncSkipped(providers)).toEqual([]);
  });

  it('reports empty-scope providers too, with per-platform reasons', () => {
    const providers = [
      row({ id: 'keyless', api_key: '' }),
      row({ id: 'newapi-openai-only', platform: 'new-api', model_protocols: { 'gpt-4o': 'openai' } }),
      row({ id: 'plain-openai', platform: 'openai' }),
      row({ id: 'no-base-url', platform: 'anthropic', base_url: '' }),
    ];
    expect(claudeSyncSkipped(providers)).toEqual([
      { id: 'keyless', name: 'keyless', reason: 'missing_api_key' },
      { id: 'newapi-openai-only', name: 'newapi-openai-only', reason: 'missing_anthropic_model' },
      { id: 'plain-openai', name: 'plain-openai', reason: 'unsupported_platform' },
      { id: 'no-base-url', name: 'no-base-url', reason: 'missing_base_url' },
    ]);
  });

  it('ignores providers scoped away from claude and disabled ones', () => {
    const providers = [
      row({ id: 'office-only', agent_scopes: ['opencode'] }),
      row({ id: 'off', platform: 'anthropic', base_url: 'https://api.anthropic.com', enabled: false }),
    ];
    expect(claudeSyncSkipped(providers)).toEqual([]);
  });
});

describe('applyActiveProviderEnv', () => {
  it('fills endpoint, first key of a multi-key field and model slots over the neutralized base', () => {
    const env = applyActiveProviderEnv(
      claudeEnv(paths),
      row({ anthropic_base_url: 'https://api.deepseek.com/anthropic' })
    );
    const value = (name: string) => env.find((e) => e.name === name)?.value;

    expect(value('ANTHROPIC_BASE_URL')).toBe('https://api.deepseek.com/anthropic');
    expect(value('ANTHROPIC_AUTH_TOKEN')).toBe('sk-multi-a');
    expect(value('ANTHROPIC_API_KEY')).toBe('sk-multi-a');
    expect(value('ANTHROPIC_MODEL')).toBe('deepseek-flash');
    expect(value('ANTHROPIC_DEFAULT_SONNET_MODEL')).toBe('deepseek-flash');
    expect(value('ANTHROPIC_DEFAULT_SONNET_MODEL_NAME')).toBe('deepseek-flash');
    expect(value('CLAUDE_CODE_SUBAGENT_MODEL')).toBe('deepseek-flash');
  });

  it('uses the plain base_url for anthropic-platform rows', () => {
    const env = applyActiveProviderEnv(
      claudeEnv(paths),
      row({ platform: 'anthropic', base_url: 'https://api.anthropic.com' })
    );
    expect(env.find((e) => e.name === 'ANTHROPIC_BASE_URL')?.value).toBe('https://api.anthropic.com');
  });

  it('stamps the first enabled model — a disabled models[0] must not leak into the model slots', () => {
    const env = applyActiveProviderEnv(
      claudeEnv(paths),
      row({
        anthropic_base_url: 'https://api.deepseek.com/anthropic',
        models: ['glm-4.5-flash', 'glm-4.6'],
        model_enabled: { 'glm-4.5-flash': false },
      })
    );
    const value = (name: string) => env.find((e) => e.name === name)?.value;

    expect(value('ANTHROPIC_MODEL')).toBe('glm-4.6');
    expect(value('ANTHROPIC_DEFAULT_SONNET_MODEL')).toBe('glm-4.6');
    expect(value('CLAUDE_CODE_SUBAGENT_MODEL')).toBe('glm-4.6');
  });

  it('spreads the enabled lineup across the model slots so every checked model is selectable', () => {
    const env = applyActiveProviderEnv(
      claudeEnv(paths),
      row({
        anthropic_base_url: 'https://api.deepseek.com/anthropic',
        models: ['glm-4.6', 'glm-4.5-air'],
      })
    );
    const value = (name: string) => env.find((e) => e.name === name)?.value;

    expect(value('ANTHROPIC_MODEL')).toBe('glm-4.6');
    expect(value('ANTHROPIC_DEFAULT_OPUS_MODEL')).toBe('glm-4.6');
    expect(value('ANTHROPIC_DEFAULT_SONNET_MODEL')).toBe('glm-4.5-air');
    // Slots beyond the lineup repeat the first model; the display layer
    // collapses the duplicates by label.
    expect(value('ANTHROPIC_DEFAULT_HAIKU_MODEL')).toBe('glm-4.6');
    expect(value('ANTHROPIC_DEFAULT_FABLE_MODEL_NAME')).toBe('glm-4.6');
  });

  it('leaves the model slots neutralized when every model is switched off', () => {
    const env = applyActiveProviderEnv(
      claudeEnv(paths),
      row({ anthropic_base_url: 'https://api.deepseek.com/anthropic', model_enabled: { 'deepseek-flash': false } })
    );
    expect(env.find((e) => e.name === 'ANTHROPIC_MODEL')?.value).toBe('');
    expect(env.find((e) => e.name === 'ANTHROPIC_DEFAULT_SONNET_MODEL')?.value).toBe('');
  });
});
