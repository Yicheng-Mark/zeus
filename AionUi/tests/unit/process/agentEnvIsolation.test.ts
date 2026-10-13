/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { ANTHROPIC_NEUTRALIZED_KEYS, claudeEnv } from '@/process/isolatedRuntime/agentOverrides';
import {
  applyActiveProviderEnv,
  claudeProviderCandidates,
  type ProviderRow,
} from '@/process/isolatedRuntime/modelProviders';
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

describe('claudeProviderCandidates', () => {
  it('accepts the anthropic platform, dual-protocol custom rows and anthropic-protocol new-api rows', () => {
    const providers = [
      row({ id: 'a', platform: 'anthropic', base_url: 'https://api.anthropic.com' }),
      row({ id: 'b', platform: 'custom', anthropic_base_url: 'https://api.deepseek.com/anthropic' }),
      row({ id: 'c', platform: 'new-api', model_protocols: { 'claude-sonnet-4': 'anthropic' } }),
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
});
