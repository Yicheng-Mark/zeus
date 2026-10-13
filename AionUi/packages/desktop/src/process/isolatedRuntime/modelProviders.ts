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
 *    sync here.
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
  updated_at?: number;
};

type AgentManagementRow = { id: string; backend?: string };

type ApiResponse<T> = { success?: boolean; data?: T; message?: string };

export type ModelProviderSyncReport = {
  opencode: { configPath: string; providers: number; error?: string };
  claude: { providerId: string | null; error?: string };
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
        (p.models?.length ?? 0) > 0
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
    for (const p of scoped) {
      const providerId = `zeus-${p.id.replace(/[^A-Za-z0-9_-]/g, '-')}`;
      providerSection[providerId] = {
        npm: '@ai-sdk/openai-compatible',
        name: p.name || providerId,
        options: {
          baseURL: toBaseUrl(p),
          apiKey: firstApiKey(p.api_key),
        },
        models: Object.fromEntries(p.models.map((m) => [m, {}])),
      };
      result.providers += 1;
    }
    config.provider = providerSection;
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
    // when at least one model is routed via the anthropic protocol.
    if (p.platform === 'new-api') return Object.values(p.model_protocols ?? {}).includes('anthropic');
    return false;
  });

/**
 * Fill the neutralized ANTHROPIC_* slots with the active provider's endpoint,
 * credentials and model-slot mappings. Mutates and returns `env`.
 */
export const applyActiveProviderEnv = (env: AgentEnvEntry[], active: ProviderRow): AgentEnvEntry[] => {
  const baseUrl = active.platform === 'custom' ? active.anthropic_base_url!.trim() : toBaseUrl(active);
  const key = firstApiKey(active.api_key);
  const model = active.models[0] ?? '';
  const slots: Array<{ name: string; value: string }> = [
    { name: 'ANTHROPIC_API_KEY', value: key },
    { name: 'ANTHROPIC_BASE_URL', value: baseUrl },
    { name: 'ANTHROPIC_AUTH_TOKEN', value: key },
    ...(model ? [{ name: 'ANTHROPIC_MODEL', value: model }] : []),
    ...(model
      ? (['OPUS', 'SONNET', 'HAIKU', 'FABLE'] as const).flatMap((slot) => [
          { name: `ANTHROPIC_DEFAULT_${slot}_MODEL`, value: model },
          { name: `ANTHROPIC_DEFAULT_${slot}_MODEL_NAME`, value: model },
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

async function syncClaude(port: number, paths: IsolatedRuntimePaths): Promise<ModelProviderSyncReport['claude']> {
  const result: ModelProviderSyncReport['claude'] = { providerId: null };
  try {
    const rows = await api<AgentManagementRow[]>(port, '/api/agents/management');
    const claudeRow = rows.find((r) => r.backend === 'claude');
    if (!claudeRow) {
      result.error = 'preset claude agent not found in registry';
      return result;
    }

    const providers = await api<ProviderRow[]>(port, '/api/providers');
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
      body: JSON.stringify({ command_override: resolveBundledEngines()?.claudeExe ?? paths.claudeExe, env_override: env }),
    });
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
  }
  return result;
}

export async function syncAgentModelRuntimes(
  port: number,
  paths: IsolatedRuntimePaths
): Promise<ModelProviderSyncReport> {
  const [opencode, claude] = await Promise.all([syncOpenCode(port, paths), syncClaude(port, paths)]);
  if (opencode.error || claude.error) {
    console.error('[IsolatedRuntime] model provider sync issues:', { opencode: opencode.error, claude: claude.error });
  }
  return { opencode, claude };
}
