/**
 * Assistant User-Data Migration — E2E suite (legacy-import contract).
 *
 * Originally 10 scenarios; Zeus removed the custom-assistant product surface
 * (fixed three-engine catalog, no creation UI), so the UI-driven scenarios
 * (1-7) and the builtin-collision scenario (10) were deleted with that
 * surface. What remains exercises the legacy `/api/assistants/import`
 * contract — still live for one-shot upgrades from the pre-backend era —
 * against a sibling backend process bound to a throw-away data dir. The
 * Electron fixture is a singleton per worker, so seeding a legacy config
 * before launch is not possible from within a single spec file; the
 * renderer-side glue is covered by `tests/unit/migrateAssistants.test.ts`.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { test, expect } from '../../fixtures';

// ── Shared constants ─────────────────────────────────────────────────────────

/** Port used by the sibling backend for migration scenarios. */
const MIGRATION_BACKEND_PORT = 25902;

/**
 * Query the sibling backend's SQLite database via the `sqlite3` CLI.
 * We avoid better-sqlite3 because its native binding is ABI-pinned to the
 * Node version used at install time (Electron vs. Playwright worker mismatch).
 */
function querySqliteIds(dataDir: string, sql: string): string[] {
  const dbPath = path.join(dataDir, 'aionui.db');
  const out = execFileSync('sqlite3', ['-readonly', dbPath, sql], { encoding: 'utf8' });
  return out
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Backend binary resolved from PATH / cargo bin. */
function resolveBackendBinary(): string {
  const candidates = [process.env.AIONUI_BACKEND_BINARY, path.join(os.homedir(), '.cargo', 'bin', 'aioncore')].filter(
    (x): x is string => typeof x === 'string' && x.length > 0
  );
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  throw new Error(`aioncore binary not found. Set AIONUI_BACKEND_BINARY or install to ~/.cargo/bin/aioncore.`);
}

// ── Backend HTTP contract (shared with renderer httpBridge) ──────────────────

interface Assistant {
  id: string;
  source: string;
  name: string;
  enabled: boolean;
}

interface ImportResult {
  imported: number;
  skipped: number;
  failed: number;
  errors: Array<{ id: string; error: string }>;
}

// ── Suite ────────────────────────────────────────────────────────────────────

test.describe('Assistant User Data Migration (legacy import contract)', () => {
  test.setTimeout(120_000);

  test.describe('Migration contract (sibling backend)', () => {
    let backend: ChildProcess | null = null;
    let dataDir: string = '';

    const baseUrl = `http://127.0.0.1:${MIGRATION_BACKEND_PORT}`;

    async function waitForHealthy(): Promise<void> {
      const deadline = Date.now() + 10_000;
      while (Date.now() < deadline) {
        try {
          // eslint-disable-next-line no-await-in-loop -- sequential polling by design
          const r = await fetch(`${baseUrl}/api/system/info`);
          if (r.ok) return;
        } catch {
          // keep polling
        }
        // eslint-disable-next-line no-await-in-loop -- sequential polling by design
        await new Promise((res) => setTimeout(res, 250));
      }
      throw new Error('Sibling backend did not become healthy in 10s');
    }

    async function httpJson<T>(method: string, route: string, body?: unknown): Promise<T> {
      const res = await fetch(`${baseUrl}${route}`, {
        method,
        headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Sibling backend ${method} ${route} -> ${res.status}: ${text}`);
      }
      const json = (await res.json()) as { success: boolean; data: T };
      return json.data;
    }

    async function stopBackend(): Promise<void> {
      if (!backend) return;
      const p = backend;
      backend = null;
      p.kill('SIGTERM');
      await new Promise<void>((resolve) => {
        const t = setTimeout(() => {
          p.kill('SIGKILL');
          resolve();
        }, 3_000);
        p.once('exit', () => {
          clearTimeout(t);
          resolve();
        });
      });
    }

    async function startBackend(): Promise<void> {
      const bin = resolveBackendBinary();
      const logPath = path.join(dataDir, 'sibling-aioncore.log');
      const logFd = fs.openSync(logPath, 'a');
      // Scrub env vars that would drag the main Electron's backend state in.
      const parentEnv = { ...process.env };
      delete parentEnv.AIONUI_EXTENSIONS_PATH;
      delete parentEnv.AIONUI_EXTENSION_STATES_FILE;
      delete parentEnv.AIONUI_E2E_TEST;
      delete parentEnv.AIONUI_CDP_PORT;
      backend = spawn(bin, ['--local', '--port', String(MIGRATION_BACKEND_PORT), '--data-dir', dataDir], {
        stdio: ['ignore', logFd, logFd],
        env: { ...parentEnv, RUST_LOG: 'warn' },
      });
      try {
        await waitForHealthy();
      } catch (err) {
        const tail = fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8').slice(-2000) : '(no log)';
        throw new Error(`${(err as Error).message}\n--- sibling backend log tail ---\n${tail}`, { cause: err });
      }
    }

    test.beforeEach(async () => {
      dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aionui-e2e-migrate-'));
      await startBackend();
    });

    test.afterEach(async () => {
      await stopBackend();
      if (dataDir && fs.existsSync(dataDir)) {
        fs.rmSync(dataDir, { recursive: true, force: true });
      }
    });

    // ── Scenario 8 — Happy path ────────────────────────────────────────────

    test('S8: legacy import happy path — user rows land', async () => {
      // The Electron migration hook filters built-ins (prefix + whitelist)
      // *before* calling /api/assistants/import. We replay the same
      // filtering that migrateAssistants.ts does.
      const legacyPayload = {
        assistants: [
          { id: 'custom-s8-alpha', name: 'Alpha' },
          { id: 'custom-s8-beta', name: 'Beta' },
          { id: 'custom-s8-gamma', name: 'Gamma' },
        ],
      };
      const result = await httpJson<ImportResult>('POST', '/api/assistants/import', legacyPayload);
      expect(result.imported).toBe(3);
      expect(result.failed).toBe(0);

      const list = await httpJson<Assistant[]>('GET', '/api/assistants');
      const userIds = list
        .filter((a) => a.source === 'user')
        .map((a) => a.id)
        .toSorted();
      expect(userIds).toEqual(['custom-s8-alpha', 'custom-s8-beta', 'custom-s8-gamma']);

      // SQLite row verification via the sqlite3 CLI (no native bindings required).
      const ids = querySqliteIds(dataDir, 'SELECT id FROM assistants ORDER BY id');
      expect(ids).toEqual(['custom-s8-alpha', 'custom-s8-beta', 'custom-s8-gamma']);
    });

    // ── Scenario 9 — Retry idempotency ────────────────────────────────────

    test('S9: retry import is idempotent (skips existing, no duplicates)', async () => {
      const payload = {
        assistants: [
          { id: 'custom-s9-retry', name: 'Retry' },
          { id: 'custom-s9-other', name: 'Other' },
        ],
      };
      const first = await httpJson<ImportResult>('POST', '/api/assistants/import', payload);
      expect(first.imported).toBe(2);
      expect(first.skipped).toBe(0);

      const second = await httpJson<ImportResult>('POST', '/api/assistants/import', payload);
      expect(second.imported).toBe(0);
      expect(second.skipped).toBe(2);
      expect(second.failed).toBe(0);

      // SQLite row count must not grow.
      const ids = querySqliteIds(dataDir, "SELECT id FROM assistants WHERE id LIKE 'custom-s9-%'");
      expect(ids.length).toBe(2);
    });
  });
});
