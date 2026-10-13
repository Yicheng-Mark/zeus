/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Push agent-scoped model providers into the ISOLATED CLI runtimes so a model
 * added via "添加模型" is actually usable by the agent it was scoped to:
 *
 *  - 办公 (opencode): OpenAI-compatible providers (custom / new-api) are
 *    written into the isolated opencode.json `provider` section under
 *    `zeus-<providerId>`. Models are then addressed as
 *    `zeus-<providerId>/<model>` in opencode's namespace.
 *  - 开发 (claude): the most recently updated claude-scoped Anthropic-protocol
 *    provider becomes ANTHROPIC_BASE_URL / ANTHROPIC_AUTH_TOKEN env on the
 *    claude agent's spawn override (one active endpoint at a time — the env is
 *    process-wide for the CLI).
 *  - 设计 (aionrs) reads the provider pool directly per request; nothing to
 *    inject, but its cached availability snapshot ("no provider configured")
 *    is re-probed so the agent card reflects the new provider lineup.
 *
 * Idempotent: re-running regenerates the `zeus-*` provider entries and re-PUTs
 * the claude override. Called at boot (isolatedRuntime bootstrap) and after
 * every provider create/update/delete from the settings UI.
 */

import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { IsolatedRuntimePaths } from './paths';
import { resolveBundledEngines } from './bundledEngines';
import { claudeEnv, type AgentEnvEntry } from './agentOverrides';

export type ProviderRow = {
  id: string;
  platform: string;
  name?: string;
  base_url: string;
  anthropic_base_url?: string;
  api_key: string;
  models: string[];
  enabled?: boolean;
  is_full_url?: boolean;
  agent_scopes?: string[];
  model_protocols?: Record<string, string>;
  model_enabled?: Record<string, boolean>;
  updated_at?: number;
};

type AgentManagementRow = { id: string; backend?: string; agent_type?: string };

type ApiResponse<T> = { success?: boolean; data?: T; message?: string };

/** Why a provider that serves the claude agent still cannot run it. Mirrors
 *  the rejection paths of claudeProviderCandidates so the sync report can name
 *  the exact fix instead of failing later with an opaque "Not logged in". */
export type ClaudeSyncSkipReason =
  | 'missing_api_key'
  | 'missing_base_url'
  | 'missing_anthropic_base_url'
  | 'missing_anthropic_model'
  | 'unsupported_platform';

export type ClaudeSkippedProvider = { id: string; name: string; reason: ClaudeSyncSkipReason };

export type ModelProviderSyncReport = {
  opencode: { configPath: string; providers: number; error?: string };
  claude: { providerId: string | null; skipped: ClaudeSkippedProvider[]; error?: string };
};

async function api<T>(port: number, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  const body = (await res.json().catch(() => ({}))) as ApiResponse<T>;
  if (!res.ok || body.success === false) {
    throw new Error(`${init?.method ?? 'GET'} ${path} -> ${res.status}: ${body.message ?? 'request failed'}`);
  }
  return body.data as T;
}

const servesAgent = (p: ProviderRow, backend: string): boolean => {
  const scopes = p.agent_scopes;
  return !scopes || scopes.length === 0 || scopes.includes(backend);
};

/** Models the user actually enabled in settings — the per-model switches clear
 *  `model_enabled[name]` to false but keep the name in `models`, so every
 *  injection site must go through this filter instead of the raw array. */
export const enabledModels = (p: ProviderRow): string[] => p.models.filter((m) => p.model_enabled?.[m] !== false);

/** Multi-key fields hold comma/newline-separated keys; the CLI wants one. */
const firstApiKey = (key: string): string => key.split(/[,;\n]/)[0]?.trim() ?? '';

/** The openai-compatible SDK appends /chat/completions; full-URL entries store
 *  the complete endpoint — strip the suffix back down to a baseURL. */
const toBaseUrl = (provider: ProviderRow): string => {
  if (!provider.is_full_url) return provider.base_url;
  return provider.base_url.replace(/\/chat\/completions\/?$/i, '').replace(/\/completions\/?$/i, '');
};

type OpenCodeConfig = Record<string, unknown> & {
  $schema?: string;
  model?: string;
  provider?: Record<string, unknown>;
};

async function syncOpenCode(port: number, paths: IsolatedRuntimePaths): Promise<ModelProviderSyncReport['opencode']> {
  const result: ModelProviderSyncReport['opencode'] = {
    configPath: join(paths.opencodeConfigDir, 'opencode.json'),
    providers: 0,
  };
  try {
    const providers = await api<ProviderRow[]>(port, '/api/providers');
    const scoped = providers.filter(
      (p) =>
        p.enabled !== false &&
        servesAgent(p, 'opencode') &&
        (p.platform === 'custom' || p.platform === 'new-api') &&
        enabledModels(p).length > 0
    );

    const configPath = result.configPath;
    let config: OpenCodeConfig = {};
    if (existsSync(configPath)) {
      config = JSON.parse(await readFile(configPath, 'utf-8')) as OpenCodeConfig;
    }
    const providerSection: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(config.provider ?? {})) {
      // Drop stale injected entries; everything else (user's own config) stays.
      if (!key.startsWith('zeus-')) providerSection[key] = value;
    }
    let injectedDefaultModel: string | undefined;
    for (const p of scoped) {
      const providerId = `zeus-${p.id.replace(/[^A-Za-z0-9_-]/g, '-')}`;
      const enabled = enabledModels(p);
      providerSection[providerId] = {
        npm: '@ai-sdk/openai-compatible',
        name: p.name || providerId,
        options: {
          baseURL: toBaseUrl(p),
          apiKey: firstApiKey(p.api_key),
        },
        models: Object.fromEntries(enabled.map((m) => [m, {}])),
      };
      injectedDefaultModel ??= `${providerId}/${enabled[0]}`;
      result.providers += 1;
    }
    config.provider = providerSection;
    // Point the CLI's default model at the injected lineup so the agent stops
    // booting on its built-in free models (opencode/big-pickle and friends);
    // an already-selected zeus-* default is left alone.
    if (injectedDefaultModel && (!config.model || !config.model.startsWith('zeus-'))) {
      config.model = injectedDefaultModel;
    }
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf-8');
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
  }
  return result;
}

/** Providers the claude engine can actually run, regardless of scopes. */
export const claudeProviderCandidates = (providers: ProviderRow[]): ProviderRow[] =>
  providers.filter((p) => {
    if (p.enabled === false || !servesAgent(p, 'claude') || !p.api_key) return false;
    if (p.platform === 'anthropic') return Boolean(p.base_url);
    // Dual-protocol OpenAI-compatible providers: the Anthropic surface lives
    // under a separate URL (e.g. DeepSeek's …/anthropic).
    if (p.platform === 'custom') return Boolean(p.anthropic_base_url?.trim());
    // new-api gateways serve both protocols from one base URL; claude only
    // when at least one enabled model is routed via the anthropic protocol.
    if (p.platform === 'new-api') return enabledModels(p).some((m) => p.model_protocols?.[m] === 'anthropic');
    return false;
  });

const claudeSkipReason = (p: ProviderRow): ClaudeSyncSkipReason | null => {
  if (!p.api_key?.trim()) return 'missing_api_key';
  if (p.platform === 'anthropic') return p.base_url?.trim() ? null : 'missing_base_url';
  if (p.platform === 'custom') return p.anthropic_base_url?.trim() ? null : 'missing_anthropic_base_url';
  if (p.platform === 'new-api')
    return enabledModels(p).some((m) => p.model_protocols?.[m] === 'anthropic') ? null : 'missing_anthropic_model';
  return 'unsupported_platform';
};

/** Providers meant for the claude engine that cannot run on it, with the
 *  reason — surfaced by the settings UI at save time so the misconfiguration
 *  is caught before the engine reports an opaque "Not logged in". */
export const claudeSyncSkipped = (providers: ProviderRow[]): ClaudeSkippedProvider[] =>
  providers
    .filter((p) => p.enabled !== false && servesAgent(p, 'claude'))
    .map((p) => ({ provider: p, reason: claudeSkipReason(p) }))
    .filter((x): x is { provider: ProviderRow; reason: ClaudeSyncSkipReason } => x.reason !== null)
    .map(({ provider, reason }) => ({ id: provider.id, name: provider.name || provider.id, reason }));

/**
 * Fill the neutralized ANTHROPIC_* slots with the active provider's endpoint,
 * credentials and model-slot mappings. Mutates and returns `env`.
 */
export const applyActiveProviderEnv = (env: AgentEnvEntry[], active: ProviderRow): AgentEnvEntry[] => {
  const baseUrl = active.platform === 'custom' ? active.anthropic_base_url!.trim() : toBaseUrl(active);
  const key = firstApiKey(active.api_key);
  const models = enabledModels(active);
  const model = models[0] ?? '';
  // Spread the enabled lineup across the CLI's model slots so every checked
  // model is individually selectable in the agent's picker — the CLI derives
  // each slot's label from these env values. Slots beyond the lineup repeat
  // the first model, which the display layer collapses by label.
  const slotModel = (index: number) => models[index] ?? model;
  const slots: Array<{ name: string; value: string }> = [
    { name: 'ANTHROPIC_API_KEY', value: key },
    { name: 'ANTHROPIC_BASE_URL', value: baseUrl },
    { name: 'ANTHROPIC_AUTH_TOKEN', value: key },
    ...(model ? [{ name: 'ANTHROPIC_MODEL', value: model }] : []),
    ...(model
      ? (['OPUS', 'SONNET', 'HAIKU', 'FABLE'] as const).flatMap((slot, index) => [
          { name: `ANTHROPIC_DEFAULT_${slot}_MODEL`, value: slotModel(index) },
          { name: `ANTHROPIC_DEFAULT_${slot}_MODEL_NAME`, value: slotModel(index) },
        ])
      : []),
    ...(model ? [{ name: 'CLAUDE_CODE_SUBAGENT_MODEL', value: model }] : []),
  ];
  for (const { name, value } of slots) {
    const existing = env.find((e) => e.name === name);
    if (existing) existing.value = value;
    else env.push({ name, value });
  }
  return env;
};

async function syncClaude(
  port: number,
  paths: IsolatedRuntimePaths,
  rows: AgentManagementRow[]
): Promise<ModelProviderSyncReport['claude']> {
  const result: ModelProviderSyncReport['claude'] = { providerId: null, skipped: [] };
  try {
    const claudeRow = rows.find((r) => r.backend === 'claude');
    if (!claudeRow) {
      result.error = 'preset claude agent not found in registry';
      return result;
    }

    const providers = await api<ProviderRow[]>(port, '/api/providers');
    result.skipped = claudeSyncSkipped(providers);
    // One active endpoint at a time: latest-touched wins.
    const active = claudeProviderCandidates(providers).toSorted((a, b) => (b.updated_at ?? 0) - (a.updated_at ?? 0))[0];

    // claudeEnv() pre-neutralizes the whole ANTHROPIC_* family (empty values)
    // so host-environment credentials can never leak in; an active provider
    // then fills the real endpoint, credentials and model-slot mappings.
    const env: AgentEnvEntry[] = [...claudeEnv(paths)];
    if (active) {
      applyActiveProviderEnv(env, active);
      result.providerId = active.id;
    }

    await api(port, `/api/agents/${encodeURIComponent(claudeRow.id)}/overrides`, {
      method: 'PUT',
      // Same exe source as applyIsolatedAgentOverrides: bundled binaries win
      // over the downloaded LOCALAPPDATA copies.
      body: JSON.stringify({
        command_override: resolveBundledEngines()?.claudeExe ?? paths.claudeExe,
        env_override: env,
      }),
    });
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
  }
  return result;
}

/** The aionrs agent's availability snapshot caches its last probe; without
 *  this nudge it keeps a pre-provider "no_provider" offline state on its card
 *  even after the user added a usable model provider. */
async function reprobeAionrsAgent(port: number, rows: AgentManagementRow[]): Promise<void> {
  const row = rows.find((r) => r.agent_type === 'aionrs');
  if (!row) return;
  try {
    await api(port, `/api/agents/${encodeURIComponent(row.id)}/health-check`, { method: 'POST' });
  } catch (err) {
    console.error('[IsolatedRuntime] aionrs availability re-probe failed:', err);
  }
}

export async function syncAgentModelRuntimes(
  port: number,
  paths: IsolatedRuntimePaths
): Promise<ModelProviderSyncReport> {
  // Agent listing is shared by the claude override push and the aionrs
  // re-probe; a failed listing must not block the opencode config sync.
  const rows = await api<AgentManagementRow[]>(port, '/api/agents/management').catch((err): AgentManagementRow[] => {
    console.error('[IsolatedRuntime] agent management listing failed:', err);
    return [];
  });
  const [opencode, claude] = await Promise.all([syncOpenCode(port, paths), syncClaude(port, paths, rows)]);
  if (opencode.error || claude.error) {
    console.error('[IsolatedRuntime] model provider sync issues:', { opencode: opencode.error, claude: claude.error });
  }
  await reprobeAionrsAgent(port, rows);
  return { opencode, claude };
}
