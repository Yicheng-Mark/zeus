/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_AGENT_SCOPES,
  filterScopesForPlatform,
  platformSupportsAgent,
  providerServesAgent,
} from '@/common/utils/agentScopes';

describe('providerServesAgent', () => {
  it('treats a provider without scopes as available to every agent (legacy rows)', () => {
    expect(providerServesAgent(undefined, 'aionrs')).toBe(true);
    expect(providerServesAgent({ agent_scopes: undefined }, 'claude')).toBe(true);
    expect(providerServesAgent({ agent_scopes: [] }, 'opencode')).toBe(true);
  });

  it('serves only the backends listed in agent_scopes', () => {
    const provider = { agent_scopes: ['aionrs', 'claude'] };
    expect(providerServesAgent(provider, 'aionrs')).toBe(true);
    expect(providerServesAgent(provider, 'claude')).toBe(true);
    expect(providerServesAgent(provider, 'opencode')).toBe(false);
  });

  it('returns false for an unknown backend id in the scope list', () => {
    // Defensive: a corrupted row scoping to a nonexistent backend must not
    // accidentally grant access to a real one.
    expect(providerServesAgent({ agent_scopes: ['gemini'] }, 'aionrs' as never)).toBe(false);
  });
});

describe('platformSupportsAgent', () => {
  it('lets the internal aionrs engine run every platform', () => {
    for (const platform of ['gemini', 'gemini-vertex-ai', 'anthropic', 'custom', 'new-api', 'bedrock', undefined]) {
      expect(platformSupportsAgent(platform, 'aionrs')).toBe(true);
    }
  });

  it('restricts opencode to OpenAI-compatible platforms', () => {
    expect(platformSupportsAgent('custom', 'opencode')).toBe(true);
    expect(platformSupportsAgent('new-api', 'opencode')).toBe(true);
    expect(platformSupportsAgent('anthropic', 'opencode')).toBe(false);
    expect(platformSupportsAgent('gemini', 'opencode')).toBe(false);
    expect(platformSupportsAgent('bedrock', 'opencode')).toBe(false);
  });

  it('restricts claude to Anthropic-protocol endpoints', () => {
    expect(platformSupportsAgent('anthropic', 'claude')).toBe(true);
    expect(platformSupportsAgent('new-api', 'claude', 'anthropic')).toBe(true);
    expect(platformSupportsAgent('new-api', 'claude', 'openai')).toBe(false);
    expect(platformSupportsAgent('custom', 'claude')).toBe(false);
    expect(platformSupportsAgent(undefined, 'claude')).toBe(false);
  });
});

describe('filterScopesForPlatform', () => {
  it('falls back to all three engines when no scopes were chosen yet', () => {
    expect(filterScopesForPlatform(undefined, 'custom')).toEqual(['aionrs', 'opencode']);
    expect(filterScopesForPlatform([], 'anthropic')).toEqual(['aionrs', 'claude']);
  });

  it('prunes scopes the platform cannot serve but keeps valid ones', () => {
    expect(filterScopesForPlatform(['aionrs', 'claude', 'opencode'], 'gemini')).toEqual(['aionrs']);
    expect(filterScopesForPlatform(['claude'], 'new-api', 'anthropic')).toEqual(['claude']);
    expect(filterScopesForPlatform(['claude'], 'new-api', 'openai')).toEqual([]);
  });
});

describe('DEFAULT_AGENT_SCOPES', () => {
  it('ships all three fixed engines as the default selection', () => {
    expect(DEFAULT_AGENT_SCOPES).toEqual(['aionrs', 'claude', 'opencode']);
  });
});
