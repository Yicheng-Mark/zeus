/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Point the preset claude / opencode agents at the isolated runtime binaries
 * via aioncore's per-agent override API:
 *
 *   PUT /api/agents/{id}/overrides
 *   { "command_override": "<abs path to app-managed exe>",
 *     "env_override":   [{ "name": "...", "value": "..." }] }
 *
 * The override mechanism is the registry's own supported seam
 * (`resolve_session_cli_program` / `assemble_spawn_env` in AionCore): a
 * command override wins over the PATH lookup, and env entries are injected
 * into every spawn of that agent. `CLAUDE_CONFIG_DIR` / `OPENCODE_CONFIG_DIR`
 * / `XDG_*` / `DISABLE_*` are not on the registry's blocked-key list, so this
 * needs zero changes to the Rust backend.
 *
 * Idempotent: re-applying the same overrides on every boot is a no-op write.
 */

import type { IsolatedRuntimePaths } from './paths';

export type AgentEnvEntry = { name: string; value: string };

export type OverrideResult = {
  applied: Array<{ id: string; backend: string; command: string }>;
  skipped: Array<{ backend: string; reason: string }>;
};

type AgentManagementRow = {
  id: string;
  name: string;
  backend?: string;
  agent_source: string;
  enabled: boolean;
};

type ApiResponse<T> = {
  success: boolean;
  data?: T;
  message?: string;
};

export function claudeEnv(paths: IsolatedRuntimePaths): AgentEnvEntry[] {
  return [
    { name: 'CLAUDE_CONFIG_DIR', value: paths.claudeConfigDir },
    // Keep the app-internal copy from self-updating out from under the user's
    // global install and from phoning home.
    { name: 'DISABLE_AUTOUPDATER', value: '1' },
    { name: 'DISABLE_TELEMETRY', value: '1' },
    // Env isolation: env_override entries are merged ON TOP of the process
    // environment the app itself was launched with. If Zeus is launched from
    // a terminal that carries the user's own Claude Code credentials
    // (ANTHROPIC_* from ~/.claude/settings.json or a VS Code extension
    // session), the embedded CLI would silently authenticate with them.
    // Explicitly neutralizing every credential/model-routing variable makes
    // the isolation hold regardless of how Zeus was started; an active
    // provider re-fills BASE_URL/AUTH_TOKEN/MODEL in modelProviders.ts.
    // Empty-string values were verified to make the CLI report a clean
    // "Not logged in" instead of falling back to inherited values.
    ...ANTHROPIC_NEUTRALIZED_KEYS.map((name) => ({ name, value: '' })),
  ];
}

/**
 * ANTHROPIC_* family that must never leak from the host environment into the
 * embedded Claude Code: credentials, endpoint, and every model-slot mapping.
 */
export const ANTHROPIC_NEUTRALIZED_KEYS = [
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_MODEL',
  'ANTHROPIC_SMALL_FAST_MODEL',
  'ANTHROPIC_DEFAULT_OPUS_MODEL',
  'ANTHROPIC_DEFAULT_OPUS_MODEL_NAME',
  'ANTHROPIC_DEFAULT_SONNET_MODEL',
  'ANTHROPIC_DEFAULT_SONNET_MODEL_NAME',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL_NAME',
  'ANTHROPIC_DEFAULT_FABLE_MODEL',
  'ANTHROPIC_DEFAULT_FABLE_MODEL_NAME',
  'CLAUDE_CODE_SUBAGENT_MODEL',
] as const;

function opencodeEnv(paths: IsolatedRuntimePaths): AgentEnvEntry[] {
  return [
    // Config (opencode.json, plugins, agents) moves off ~/.config/opencode.
    { name: 'OPENCODE_CONFIG_DIR', value: paths.opencodeConfigDir },
    // Auth (auth.json) and caches move off ~/.local/share/opencode and
    // ~/.cache/opencode. OpenCode honors the XDG variables on native Windows.
    { name: 'XDG_CONFIG_HOME', value: paths.opencodeXdgConfig },
    { name: 'XDG_DATA_HOME', value: paths.opencodeXdgData },
    { name: 'XDG_CACHE_HOME', value: paths.opencodeXdgCache },
  ];
}

async function api<T>(port: number, path: string, init?: RequestInit): Promise<ApiResponse<T>> {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  const body = (await res.json().catch(() => ({}))) as ApiResponse<T>;
  if (!res.ok || body.success === false) {
    throw new Error(`${init?.method ?? 'GET'} ${path} -> ${res.status}: ${body.message ?? 'request failed'}`);
  }
  return body;
}

export async function applyIsolatedAgentOverrides(
  backendPort: number,
  paths: IsolatedRuntimePaths
): Promise<OverrideResult> {
  const result: OverrideResult = { applied: [], skipped: [] };
  const res = await api<AgentManagementRow[]>(backendPort, '/api/agents/management');
  const rows = res.data ?? [];

  const targets: Array<{ backend: string; exe: string; env: AgentEnvEntry[] }> = [
    { backend: 'claude', exe: paths.claudeExe, env: claudeEnv(paths) },
    { backend: 'opencode', exe: paths.opencodeExe, env: opencodeEnv(paths) },
  ];

  for (const target of targets) {
    const row = rows.find((r) => r.backend === target.backend);
    if (!row) {
      result.skipped.push({ backend: target.backend, reason: 'preset agent not found in registry' });
      continue;
    }
    // Sequential on purpose: both PUTs hit the same registry.
    // eslint-disable-next-line no-await-in-loop
    await api(backendPort, `/api/agents/${encodeURIComponent(row.id)}/overrides`, {
      method: 'PUT',
      body: JSON.stringify({ command_override: target.exe, env_override: target.env }),
    });
    result.applied.push({ id: row.id, backend: target.backend, command: target.exe });
  }
  return result;
}
