/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Ensure the app-managed CLI binaries exist under the isolated runtime root,
 * downloading them on first use. Missing binaries never block startup: the
 * bootstrap reports what is present and the UI health page can retry.
 *
 * Sources:
 *  - Claude Code: the `@anthropic-ai/claude-agent-sdk-win32-x64` npm platform
 *    package bundles the native claude.exe (same binary the official Agent
 *    SDK ships). Downloaded straight from the npm registry tarball.
 *  - OpenCode: the official `opencode-windows-x64.zip` GitHub release asset.
 *
 * curl + tar are used instead of node-fetch/zip libs because (a) Windows 10+
 * ships both in System32, and (b) curl honors the user's HTTP(S)_PROXY env,
 * which matters on proxied networks.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { IsolatedRuntimePaths } from './paths';

const execFileAsync = promisify(execFile);

const NPM_PLATFORM_PACKAGE = '@anthropic-ai/claude-agent-sdk-win32-x64';
const OPENCODE_REPO = 'anomalyco/opencode';
const OPENCODE_ASSET_NAME = 'opencode-windows-x64.zip';
const DOWNLOAD_TIMEOUT_MS = 15 * 60 * 1000;

export type RuntimeBinaryStatus = {
  present: boolean;
  version?: string;
  note?: string;
};

export type RuntimeStatus = {
  claude: RuntimeBinaryStatus;
  opencode: RuntimeBinaryStatus;
};

function run(cmd: string, args: string[], cwd?: string): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync(cmd, args, {
    cwd,
    timeout: DOWNLOAD_TIMEOUT_MS,
    windowsHide: true,
    maxBuffer: 32 * 1024 * 1024,
  });
}

async function claudeVersion(exe: string): Promise<string | undefined> {
  try {
    const { stdout } = await run(exe, ['--version']);
    return stdout.trim().split('\n')[0] || undefined;
  } catch {
    return undefined;
  }
}

async function opencodeVersion(exe: string): Promise<string | undefined> {
  try {
    const { stdout } = await run(exe, ['--version'], undefined);
    return stdout.trim().split('\n')[0] || undefined;
  } catch {
    return undefined;
  }
}

/** Query the npm registry for the latest SDK tarball URL. */
async function latestClaudeTarballUrl(): Promise<{ url: string; version: string }> {
  const { stdout } = await run('curl', ['-sSL', `https://registry.npmjs.org/${NPM_PLATFORM_PACKAGE}/latest`]);
  const meta = JSON.parse(stdout) as { version?: string; dist?: { tarball?: string } };
  const url = meta.dist?.tarball;
  const version = meta.version;
  if (!url || !version) throw new Error('npm registry response missing dist.tarball/version');
  return { url, version };
}

/** Query the GitHub API for the latest OpenCode Windows x64 zip asset. */
async function latestOpencodeAssetUrl(): Promise<{ url: string; version: string }> {
  const { stdout } = await run('curl', ['-sSL', `https://api.github.com/repos/${OPENCODE_REPO}/releases/latest`]);
  const meta = JSON.parse(stdout) as { tag_name?: string; assets?: Array<{ name: string; browser_download_url: string }> };
  const asset = meta.assets?.find((a) => a.name === OPENCODE_ASSET_NAME);
  if (!asset || !meta.tag_name) throw new Error(`release asset ${OPENCODE_ASSET_NAME} not found`);
  return { url: asset.browser_download_url, version: meta.tag_name };
}

async function downloadClaude(paths: IsolatedRuntimePaths): Promise<RuntimeBinaryStatus> {
  const { url, version } = await latestClaudeTarballUrl();
  const tgz = join(paths.claudeDir, 'sdk-platform.tgz');
  await run('curl', ['-sSL', '-o', tgz, url], paths.claudeDir);
  // bsdtar (System32 on Win10+) unpacks both tgz and zip.
  await run('tar', ['-xzf', tgz], paths.claudeDir);
  rmSync(join(paths.claudeDir, 'package', 'LICENSE.md'), { force: true });
  rmSync(join(paths.claudeDir, 'package', 'package.json'), { force: true });
  rmSync(join(paths.claudeDir, 'package', 'README.md'), { force: true });
  // Move package/claude.exe up, then drop the extracted package dir.
  const fs = await import('node:fs/promises');
  await fs.rename(join(paths.claudeDir, 'package', 'claude.exe'), paths.claudeExe).catch(async () => {
    await fs.copyFile(join(paths.claudeDir, 'package', 'claude.exe'), paths.claudeExe);
  });
  await fs.rm(join(paths.claudeDir, 'package'), { recursive: true, force: true });
  await fs.rm(tgz, { force: true });
  return { present: true, version, note: 'downloaded from npm registry' };
}

async function downloadOpencode(paths: IsolatedRuntimePaths): Promise<RuntimeBinaryStatus> {
  const { url, version } = await latestOpencodeAssetUrl();
  const zip = join(paths.opencodeDir, OPENCODE_ASSET_NAME);
  await run('curl', ['-sSL', '-o', zip, url], paths.opencodeDir);
  await run('tar', ['-xf', OPENCODE_ASSET_NAME], paths.opencodeDir);
  const fs = await import('node:fs/promises');
  await fs.rm(zip, { force: true });
  return { present: true, version, note: 'downloaded from GitHub release' };
}

/** Free-tier model that is alive as of 2026-10; the built-in default
 *  (exo-free) was deprecated upstream and makes every session fail with
 *  HTTP 410 ModelDeprecated. */
const OPENCODE_DEFAULT_MODEL = 'opencode/big-pickle';

/** Pin a non-deprecated default model for the isolated OpenCode config.
 *  Write-if-missing only: a user's later manual model choice sticks. */
function ensureDefaultOpencodeModel(paths: IsolatedRuntimePaths): void {
  const configPath = join(paths.opencodeConfigDir, 'opencode.json');
  if (existsSync(configPath)) return;
  try {
    writeFileSync(
      configPath,
      `${JSON.stringify({ $schema: 'https://opencode.ai/config.json', model: OPENCODE_DEFAULT_MODEL }, null, 2)}\n`,
      'utf-8'
    );
  } catch (err) {
    console.error('[IsolatedRuntime] failed to write default opencode model:', err);
  }
}

export async function ensureRuntimeBinaries(paths: IsolatedRuntimePaths): Promise<RuntimeStatus> {
  ensureDefaultOpencodeModel(paths);
  const status: RuntimeStatus = {
    claude: existsSync(paths.claudeExe)
      ? { present: true, version: await claudeVersion(paths.claudeExe) }
      : { present: false },
    opencode: existsSync(paths.opencodeExe)
      ? { present: true, version: await opencodeVersion(paths.opencodeExe) }
      : { present: false },
  };

  if (!status.claude.present) {
    try {
      status.claude = await downloadClaude(paths);
    } catch (err) {
      status.claude.note = `download failed: ${err instanceof Error ? err.message : String(err)}`;
    }
  }
  if (!status.opencode.present) {
    try {
      status.opencode = await downloadOpencode(paths);
    } catch (err) {
      status.opencode.note = `download failed: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  const versions = [
    `claude: ${status.claude.version ?? 'missing'}${status.claude.note ? ` (${status.claude.note})` : ''}`,
    `opencode: ${status.opencode.version ?? 'missing'}${status.opencode.note ? ` (${status.opencode.note})` : ''}`,
  ];
  try {
    writeFileSync(paths.versionsFile, `${versions.join('\n')}\n`, 'utf-8');
  } catch {
    // Non-fatal: the file is informational only.
  }
  return status;
}
