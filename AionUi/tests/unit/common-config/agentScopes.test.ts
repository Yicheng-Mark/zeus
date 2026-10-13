/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { platformSupportsAgent, providerServesAgent } from '@/common/utils/agentScopes';

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

  describe('platformSupportsAgent with anthropic_base_url (dual-protocol custom)', () => {
    it('lets claude run custom platforms only when an Anthropic URL is present', () => {
      expect(platformSupportsAgent('custom', 'claude', undefined, 'https://api.deepseek.com/anthropic')).toBe(true);
      expect(platformSupportsAgent('custom', 'claude', undefined, '  ')).toBe(false);
      expect(platformSupportsAgent('custom', 'claude', undefined, undefined)).toBe(false);
      // Other engines on the same row are unaffected.
      expect(platformSupportsAgent('custom', 'opencode', undefined, 'https://x/anthropic')).toBe(true);
      expect(platformSupportsAgent('custom', 'aionrs', undefined, undefined)).toBe(true);
    });
  });
});
