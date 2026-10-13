/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Isolated agent runtime bootstrap.
 *
 * Runs once per app launch after aioncore reports ready:
 *   1. ensure %LOCALAPPDATA%\AionUiAgent directory tree exists
 *   2. ensure the app-managed claude / opencode binaries exist (download once)
 *   3. point the preset claude / opencode agents at those binaries with
 *      isolation env via /api/agents/{id}/overrides
 *
 * Failure policy mirrors ensureAdminUser: log and swallow, retry next boot,
 * never block app startup. The last report is kept for the settings UI.
 */

import { getIsolatedRuntimePaths, ensureIsolatedDirs } from './paths';
import { ensureRuntimeBinaries, type RuntimeStatus } from './ensureRuntime';
import { applyIsolatedAgentOverrides, type OverrideResult } from './agentOverrides';
import { registerOpenDesignMcp } from './openDesignMcp';
import { installIsolatedPlugins, type PluginInstallReport } from './plugins';
import { syncAgentModelRuntimes, type ModelProviderSyncReport } from './modelProviders';
import { syncSubAgentDefinitions, type AgentDefsSyncReport } from './agentDefs';

export type IsolatedBootstrapReport = {
  runtime: RuntimeStatus;
  overrides?: OverrideResult;
  modelProviders?: ModelProviderSyncReport;
  agentDefs?: AgentDefsSyncReport;
  openDesign?: string;
  error?: string;
};

export type IsolatedRuntimeStatus = {
  paths: ReturnType<typeof getIsolatedRuntimePaths>;
  lastReport: IsolatedBootstrapReport | null;
};

let bootstrapPromise: Promise<IsolatedBootstrapReport> | null = null;
let lastReport: IsolatedBootstrapReport | null = null;

async function runBootstrap(backendPort: number): Promise<IsolatedBootstrapReport> {
  const paths = getIsolatedRuntimePaths();
  ensureIsolatedDirs(paths);
  const runtime = await ensureRuntimeBinaries(paths);
  const report: IsolatedBootstrapReport = { runtime };
  // Overrides only make sense when both binaries are present; a half-applied
  // override would send one agent to a missing exe and break the picker.
  if (runtime.claude.present && runtime.opencode.present) {
    report.overrides = await applyIsolatedAgentOverrides(backendPort, paths);
    report.modelProviders = await syncAgentModelRuntimes(backendPort, paths);
    report.agentDefs = await syncSubAgentDefinitions(paths).catch((err): AgentDefsSyncReport | undefined => {
      console.error('[IsolatedRuntime] sub-agent definition sync failed:', err);
      return undefined;
    });
    report.openDesign = await registerOpenDesignMcp(backendPort).catch((err) => {
      console.error('[IsolatedRuntime] Open Design MCP registration failed:', err);
      return `registration failed: ${err instanceof Error ? err.message : String(err)}`;
    });
  } else {
    report.error = 'runtime binaries incomplete; overrides deferred to next boot';
  }
  lastReport = report;
  return report;
}

export function bootstrapIsolatedRuntimeOnce(backendPort: number): Promise<IsolatedBootstrapReport> {
  if (!bootstrapPromise) {
    bootstrapPromise = runBootstrap(backendPort).catch((err) => {
      console.error('[IsolatedRuntime] bootstrap failed:', err);
      lastReport = {
        runtime: { claude: { present: false }, opencode: { present: false } },
        error: err instanceof Error ? err.message : String(err),
      };
      // Allow a retry on the next explicit status request instead of caching
      // the failure for the whole process lifetime.
      bootstrapPromise = null;
      return lastReport;
    });
  }
  return bootstrapPromise;
}

export async function getIsolatedRuntimeStatus(port: number): Promise<IsolatedRuntimeStatus> {
  const paths = getIsolatedRuntimePaths();
  // If a bootstrap already ran, refresh only what is cheap to re-check so the
  // health page reflects reality (e.g. user dropped a binary in manually).
  if (lastReport) {
    await bootstrapIsolatedRuntimeOnce(port).catch((): undefined => undefined);
  }
  return { paths, lastReport };
}

export async function installPluginsNow(): Promise<PluginInstallReport> {
  return installIsolatedPlugins(getIsolatedRuntimePaths());
}

/** Re-push agent-scoped model providers into the isolated CLI runtime configs.
 *  Called from the settings UI after a provider was created/updated/deleted. */
export async function syncAgentModelRuntimesNow(port: number): Promise<ModelProviderSyncReport> {
  return syncAgentModelRuntimes(port, getIsolatedRuntimePaths());
}

export { getIsolatedRuntimePaths };
