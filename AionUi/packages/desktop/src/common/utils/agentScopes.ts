/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IProvider } from '../config/storage';

/**
 * Per-agent model scoping for Zeus's fixed three-engine catalog.
 *
 * A provider row carries `agent_scopes`: the list of agent backends it is
 * meant for. Empty/undefined means "every agent" (legacy rows and the
 * default selection), so existing behavior is unchanged.
 */

/** Agent backend ids as stored in `providers.agent_scopes` (match agent_metadata.backend). */
export const AGENT_SCOPE_BACKENDS = ['aionrs', 'claude', 'opencode'] as const;

export type AgentScopeBackend = (typeof AGENT_SCOPE_BACKENDS)[number];

/** What a fresh "添加模型" gets pre-selected: all three engines. */
export const DEFAULT_AGENT_SCOPES: AgentScopeBackend[] = ['aionrs', 'claude', 'opencode'];

/** i18n label keys for the three engines (guid module owns the workspace tab labels). */
export const AGENT_SCOPE_LABEL_KEYS: Record<AgentScopeBackend, string> = {
  aionrs: 'guid.workspaceTab.design',
  claude: 'guid.workspaceTab.dev',
  opencode: 'guid.workspaceTab.office',
};

/** Does this provider serve the given agent backend? */
export const providerServesAgent = (provider: Pick<IProvider, 'agent_scopes'> | undefined, backend: AgentScopeBackend): boolean => {
  const scopes = provider?.agent_scopes;
  if (!scopes || scopes.length === 0) return true;
  return scopes.includes(backend);
};

/**
 * Which engines can actually RUN a platform's models:
 *  - 设计 (aionrs): speaks every protocol the app supports natively.
 *  - 办公 (opencode): OpenAI-compatible endpoints only (custom / new-api),
 *    injected into the isolated opencode.json provider section.
 *  - 开发 (claude): Anthropic-protocol endpoints (anthropic platform, or
 *    new-api with the anthropic per-model protocol), injected via env override.
 */
export const platformSupportsAgent = (
  platform: string | undefined,
  backend: AgentScopeBackend,
  modelProtocol?: string
): boolean => {
  if (backend === 'aionrs') return true;
  if (backend === 'opencode') {
    return platform === 'custom' || platform === 'new-api';
  }
  // claude
  if (platform === 'anthropic') return true;
  if (platform === 'new-api') return modelProtocol === 'anthropic';
  return false;
};

/** Keep only scopes that are still valid for the current platform/protocol combo. */
export const filterScopesForPlatform = (
  scopes: AgentScopeBackend[] | undefined,
  platform: string | undefined,
  modelProtocol?: string
): AgentScopeBackend[] => {
  const base = scopes && scopes.length > 0 ? scopes : DEFAULT_AGENT_SCOPES;
  return base.filter((backend) => platformSupportsAgent(platform, backend, modelProtocol));
};
