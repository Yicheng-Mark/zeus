/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Resolve the app-vendored chrome-devtools-mcp entry shipped inside the
 * bundled aioncore managed-resources tree.
 *
 * Staged at build time by packages/shared-scripts/src/prepare-managed-extras.js
 * into resources/bundled-aioncore/{runtimeKey}/managed-resources/mcp/
 * chrome-devtools-mcp/ (the package tree plus a vendor-manifest.json recording
 * the bin entry), so the in-app browser MCP works offline on machines with no
 * node/npm on PATH.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

type VendorManifest = {
  name?: string;
  version?: string;
  /** Entry file relative to the package directory (from package.json bin). */
  entry?: string;
};

export type VendoredMcpPackage = {
  /** Package root directory. */
  dir: string;
  /** Absolute entry file (a node script spawned via `node <entry>`). */
  entry: string;
  version: string | undefined;
};

function resolveVendoredPackage(
  managedResourcesRoot: string,
  packageName: 'chrome-devtools-mcp'
): VendoredMcpPackage | null {
  const dir = join(managedResourcesRoot, 'mcp', packageName);
  let manifest: VendorManifest;
  try {
    manifest = JSON.parse(readFileSync(join(dir, 'vendor-manifest.json'), 'utf8')) as VendorManifest;
  } catch {
    return null;
  }
  if (!manifest.entry) return null;
  const entry = join(dir, manifest.entry);
  if (!existsSync(entry)) return null;
  return { dir, entry, version: manifest.version };
}

/**
 * Resolve the vendored chrome-devtools-mcp for this platform, or `null` when
 * not staged (dev checkouts, corrupted install). Candidates: packaged app
 * resources first, repo checkout (dev builds that ran the staging script)
 * second — mirroring bundledEngineRootCandidates.
 */
export function resolveVendoredChromeDevtoolsMcp(): VendoredMcpPackage | null {
  const runtimeKey = `${process.platform}-${process.arch}`;
  const candidates: string[] = [];
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  if (resourcesPath) candidates.push(join(resourcesPath, 'bundled-aioncore', runtimeKey, 'managed-resources'));
  candidates.push(join(process.cwd(), 'resources', 'bundled-aioncore', runtimeKey, 'managed-resources'));

  for (const managedResourcesRoot of candidates) {
    const pkg = resolveVendoredPackage(managedResourcesRoot, 'chrome-devtools-mcp');
    if (pkg) return pkg;
  }
  return null;
}
