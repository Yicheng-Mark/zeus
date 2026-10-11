/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Register the locally-installed Open Design MCP server (stdio) in aioncore's
 * unified MCP registry, so every agent session gets design tools injected via
 * the app's normal --mcp-config plumbing.
 *
 * The MCP server ships inside the Open Design desktop app: running
 * `Open Design.exe` with ELECTRON_RUN_AS_NODE=1 turns the bundled Electron
 * binary into a plain node runtime that executes daemon-cli.mjs — no external
 * node install needed, and cwd-independent (the CLI resolves itself via
 * import.meta.url).
 *
 * Idempotent: upsert by name, then enable. Absent installs are skipped
 * silently so the bootstrap never fails on machines without Open Design.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';

const MCP_NAME = 'open-design';

type McpServerRow = { id: string; name: string; enabled: boolean };

type ApiResponse<T> = {
  success: boolean;
  data?: T;
  message?: string;
};

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

function findOpenDesignInstall(): { exe: string; cli: string } | null {
  const localAppData = process.env.LOCALAPPDATA;
  const candidates = localAppData
    ? [join(localAppData, 'Programs', 'Open Design')]
    : [];
  for (const dir of candidates) {
    const exe = join(dir, 'Open Design.exe');
    const cli = join(dir, 'resources', 'app', 'prebundled', 'daemon', 'daemon-cli.mjs');
    if (existsSync(exe) && existsSync(cli)) return { exe, cli };
  }
  return null;
}

export async function registerOpenDesignMcp(backendPort: number): Promise<string> {
  const install = findOpenDesignInstall();
  if (!install) return 'Open Design not found under %LOCALAPPDATA%\\Programs — skipped';

  await api(backendPort, '/api/mcp/servers', {
    method: 'POST',
    body: JSON.stringify({
      name: MCP_NAME,
      description: 'Open Design local-first design workspace (design systems / prototypes / landing pages)',
      transport: {
        type: 'stdio',
        command: install.exe,
        args: [install.cli, 'mcp'],
        env: { ELECTRON_RUN_AS_NODE: '1' },
      },
      builtin: false,
    }),
  });

  // Create/upsert leaves enabled=false; flip it on if needed.
  const res = await api<McpServerRow[]>(backendPort, '/api/mcp/servers');
  const row = (res.data ?? []).find((s) => s.name === MCP_NAME);
  if (row && !row.enabled) {
    await api(backendPort, `/api/mcp/servers/${encodeURIComponent(row.id)}/toggle`, { method: 'POST' });
  }
  return `Open Design MCP registered (${install.exe})`;
}
