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
import { claudeEnv, type AgentEnvEntry } from './agentOverrides';

type ProviderRow = {
  id: string;
  platform: string;
  name?: string;
  base_url: string;
  api_key: string;
  models: string[];
  enabled?: boolean;
  is_full_url?: boolean;
  agent_scopes?: string[];
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
  const result: ModelProviderSyncReport['opencode'] = { configPath: join(paths.opencodeConfigDir, 'opencode.json'), providers: 0 };
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
    const candidates = providers.filter(
      (p) => p.enabled !== false && servesAgent(p, 'claude') && p.platform === 'anthropic' && p.base_url && p.api_key
    );
    // One active endpoint at a time: latest-touched wins.
    const active = candidates.sort((a, b) => (b.updated_at ?? 0) - (a.updated_at ?? 0))[0];

    const env: AgentEnvEntry[] = [...claudeEnv(paths)];
    if (active) {
      env.push(
        { name: 'ANTHROPIC_BASE_URL', value: toBaseUrl(active) },
        { name: 'ANTHROPIC_AUTH_TOKEN', value: firstApiKey(active.api_key) }
      );
      result.providerId = active.id;
    }

    await api(port, `/api/agents/${encodeURIComponent(claudeRow.id)}/overrides`, {
      method: 'PUT',
      body: JSON.stringify({ command_override: paths.claudeExe, env_override: env }),
    });
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
  }
  return result;
}

export async function syncAgentModelRuntimes(port: number, paths: IsolatedRuntimePaths): Promise<ModelProviderSyncReport> {
  const [opencode, claude] = await Promise.all([syncOpenCode(port, paths), syncClaude(port, paths)]);
  if (opencode.error || claude.error) {
    console.error('[IsolatedRuntime] model provider sync issues:', { opencode: opencode.error, claude: claude.error });
  }
  return { opencode, claude };
}
