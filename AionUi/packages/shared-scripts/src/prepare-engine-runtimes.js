/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Prepare the bundled engine runtimes (claude / opencode) for packaging.
 *
 * Output: <projectRoot>/resources/engines/<platform>-<arch>/
 *   claude/claude.exe + opencode/opencode.exe + manifest.json
 *
 * Version pins come from package.json "aionuiEngines" (overridable via
 * AIONUI_ENGINE_CLAUDE_VERSION / AIONUI_ENGINE_OPENCODE_VERSION env; unset
 * fields default to "latest"). Sources, in order:
 *   1. AIONUI_ENGINES_LOCAL_DIR — a directory already containing
 *      claude/claude.exe + opencode/opencode.exe (offline builds; e.g. point
 *      it at %LOCALAPPDATA%\AionUiAgent\runtime).
 *   2. Download with a per-version cache: claude from the npm registry
 *      (@anthropic-ai/claude-agent-sdk-win32-x64 tarball), opencode from the
 *      anomalyco/opencode GitHub release (opencode-windows-x64.zip).
 *
 * Non-win32-x64 targets get a manifest with binariesBundled=false so the
 * extraResources source dir always exists; the runtime then falls back to
 * download-on-first-boot for those platforms.
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const NPM_PLATFORM_PACKAGE = '@anthropic-ai/claude-agent-sdk-win32-x64';
const OPENCODE_REPO = 'anomalyco/opencode';
const OPENCODE_ASSET_NAME = 'opencode-windows-x64.zip';
const DOWNLOAD_TIMEOUT_MS = 15 * 60 * 1000;
const META_TIMEOUT_MS = 30 * 100;

function ensureDirectory(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function fileSizeMb(filePath) {
  return (fs.statSync(filePath).size / (1024 * 1024)).toFixed(1);
}

function downloadFile(url, outputPath, label) {
  console.log(`  Downloading ${label} from ${url}`);
  // --retry covers flaky links (CDN resets mid-body leave a truncated tarball
  // that only surfaces as a tar/gzip error at extraction); --retry-all-errors
  // because curl does not retry HTTP-level failures by default.
  execFileSync(
    'curl',
    ['-L', '--fail', '--silent', '--show-error', '--retry', '3', '--retry-all-errors', '--retry-delay', '2', '-o', outputPath, url],
    {
      timeout: DOWNLOAD_TIMEOUT_MS,
    }
  );
}

/**
 * npm registry tarball URLs, registry first then mirrors — same mirror-first
 * pattern as prepareHubResources/officecli installs: registry.npmjs.org is
 * unreachable-truncated from some networks (mainland China included), while
 * npmmirror serves the identical artifacts.
 */
function npmTarballDownloadUrls(registryTarball) {
  const urls = [registryTarball];
  const mirror = registryTarball.replace('https://registry.npmjs.org/', 'https://registry.npmmirror.com/');
  if (mirror !== registryTarball) urls.push(mirror);
  return urls;
}

function downloadFirstAvailable(urls, outputPath, label) {
  let lastError;
  for (const url of urls) {
    try {
      downloadFile(url, outputPath, label);
      return url;
    } catch (error) {
      lastError = error;
      console.warn(`  Download failed from ${url}: ${error.message}`);
    }
  }
  throw lastError ?? new Error(`no download URLs for ${label}`);
}

function fetchJson(url) {
  const out = execFileSync('curl', ['-fsSL', url], { encoding: 'utf-8', timeout: META_TIMEOUT_MS });
  return JSON.parse(out);
}

function npmTarball(pin) {
  const meta = fetchJson(`https://registry.npmjs.org/${NPM_PLATFORM_PACKAGE}/${pin}`);
  const tarball = meta.dist && meta.dist.tarball;
  if (!tarball || !meta.version) {
    throw new Error(`npm metadata for ${NPM_PLATFORM_PACKAGE}@${pin} missing dist.tarball/version`);
  }
  return { tarball, version: meta.version };
}

function opencodeAsset(pin) {
  const api = pin === 'latest' ? `repos/${OPENCODE_REPO}/releases/latest` : `repos/${OPENCODE_REPO}/releases/tags/${pin}`;
  const meta = fetchJson(`https://api.github.com/${api}`);
  const asset = (meta.assets || []).find((entry) => entry.name === OPENCODE_ASSET_NAME);
  if (!asset || !meta.tag_name) {
    throw new Error(`release asset ${OPENCODE_ASSET_NAME} not found for ${OPENCODE_REPO}@${pin}`);
  }
  return { url: asset.browser_download_url, version: meta.tag_name };
}

function extractTar(tgz, dir) {
  ensureDirectory(dir);
  // Windows: resolve tar explicitly from System32. A bare 'tar' on PATH can
  // pick up Git Bash's GNU tar, which reads `C:\...` as host `C` ("Cannot
  // connect to C: resolve failed") — the bsdtar in System32 is what
  // ensureRuntime.ts relies on at runtime, so use the same one here.
  const tarCommand =
    process.platform === 'win32' ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
  execFileSync(tarCommand, ['-xzf', tgz, '-C', dir], { timeout: DOWNLOAD_TIMEOUT_MS });
}

function extractZip(zip, dir) {
  ensureDirectory(dir);
  if (process.platform === 'win32') {
    const ps = `Expand-Archive -LiteralPath '${zip.replace(/'/g, "''")}' -DestinationPath '${dir
      .replace(/'/g, "''")}' -Force`;
    execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { timeout: DOWNLOAD_TIMEOUT_MS });
  } else {
    execFileSync('unzip', ['-o', zip, '-d', dir], { timeout: DOWNLOAD_TIMEOUT_MS });
  }
}

function cacheRoot() {
  return process.env.AIONUI_ENGINES_CACHE_DIR || path.join(require('os').tmpdir(), 'aionui-engines-prepare');
}

/** Claude from npm: returns the extracted claude.exe path (cached per version). */
function fetchClaude(pin) {
  const { tarball, version } = npmTarball(pin);
  const dest = path.join(cacheRoot(), 'claude', version);
  const exe = path.join(dest, process.platform === 'win32' ? 'claude.exe' : 'claude');
  if (fs.existsSync(exe)) return { exe, version, source: 'npm-cache' };

  const work = path.join(dest, 'extract');
  fs.rmSync(dest, { recursive: true, force: true });
  const tgz = path.join(dest, 'sdk-platform.tgz');
  ensureDirectory(dest);
  downloadFirstAvailable(npmTarballDownloadUrls(tarball), tgz, `${NPM_PLATFORM_PACKAGE}@${version}`);
  extractTar(tgz, work);
  const extracted = findFile(work, path.basename(exe));
  if (!extracted) throw new Error(`tarball for ${NPM_PLATFORM_PACKAGE}@${version} contains no claude binary`);
  fs.copyFileSync(extracted, exe);
  fs.rmSync(work, { recursive: true, force: true });
  fs.rmSync(tgz, { force: true });
  return { exe, version, source: 'npm-registry' };
}

/** OpenCode from GitHub releases: returns the extracted opencode.exe path (cached per tag). */
function fetchOpencode(pin) {
  const { url, version } = opencodeAsset(pin);
  const dest = path.join(cacheRoot(), 'opencode', version);
  const exe = path.join(dest, process.platform === 'win32' ? 'opencode.exe' : 'opencode');
  if (fs.existsSync(exe)) return { exe, version, source: 'github-cache' };

  const work = path.join(dest, 'extract');
  fs.rmSync(dest, { recursive: true, force: true });
  const zip = path.join(dest, OPENCODE_ASSET_NAME);
  ensureDirectory(dest);
  downloadFile(url, zip, `opencode ${version}`);
  extractZip(zip, work);
  const extracted = findFile(work, path.basename(exe));
  if (!extracted) throw new Error(`zip for opencode ${version} contains no opencode binary`);
  fs.copyFileSync(extracted, exe);
  fs.rmSync(work, { recursive: true, force: true });
  fs.rmSync(zip, { force: true });
  return { exe, version, source: 'github-release' };
}

function findFile(dir, name) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isFile() && entry.name === name) return fullPath;
    if (entry.isDirectory()) {
      const found = findFile(fullPath, name);
      if (found) return found;
    }
  }
  return null;
}

function hasLocalEngines(dir) {
  const exe = (name) => fs.existsSync(path.join(dir, name, process.platform === 'win32' ? `${name}.exe` : name));
  return exe('claude') && exe('opencode');
}

/** Best-effort version read from a VERSIONS.txt next to a local engine dir. */
function readLocalVersions(dir) {
  const versions = {};
  try {
    const text = fs.readFileSync(path.join(dir, 'VERSIONS.txt'), 'utf-8');
    for (const line of text.split('\n')) {
      const match = /^(\w+):\s*(\S+)/.exec(line.trim());
      if (match) versions[match[1]] = match[2];
    }
  } catch {
    // informational only
  }
  return versions;
}

function resolvePins(projectRoot) {
  let pins = { claudeSdk: 'latest', opencode: 'latest' };
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf-8'));
    if (pkg.aionuiEngines) pins = { ...pins, ...pkg.aionuiEngines };
  } catch {
    throw new Error(`cannot read package.json under ${projectRoot} for aionuiEngines pins`);
  }
  if (process.env.AIONUI_ENGINE_CLAUDE_VERSION) pins.claudeSdk = process.env.AIONUI_ENGINE_CLAUDE_VERSION;
  if (process.env.AIONUI_ENGINE_OPENCODE_VERSION) pins.opencode = process.env.AIONUI_ENGINE_OPENCODE_VERSION;
  return pins;
}

function writeJson(filePath, payload) {
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8');
}

function prepareEngineRuntimes({ projectRoot, platform, arch }) {
  const runtimeKey = `${platform}-${arch}`;
  const enginesRoot = path.join(projectRoot, 'resources', 'engines');
  const outDir = path.join(enginesRoot, runtimeKey);
  ensureDirectory(enginesRoot);
  fs.rmSync(outDir, { recursive: true, force: true });
  ensureDirectory(outDir);

  if (!(platform === 'win32' && arch === 'x64')) {
    writeJson(path.join(outDir, 'manifest.json'), {
      platform,
      arch,
      runtimeKey,
      binariesBundled: false,
      generatedAt: new Date().toISOString(),
    });
    console.log(`  Engines not bundled for ${runtimeKey} (runtime falls back to first-boot download)`);
    return;
  }

  const pins = resolvePins(projectRoot);
  const local = process.env.AIONUI_ENGINES_LOCAL_DIR;
  let claude;
  let opencode;
  if (local && hasLocalEngines(local)) {
    const localVersions = readLocalVersions(local);
    claude = {
      exe: path.join(local, 'claude', 'claude.exe'),
      version: localVersions.claude || pins.claudeSdk,
      source: `local-dir (${local})`,
    };
    opencode = {
      exe: path.join(local, 'opencode', 'opencode.exe'),
      version: localVersions.opencode || pins.opencode,
      source: `local-dir (${local})`,
    };
    console.log(`  Using local engine copies from ${local}`);
  } else {
    if (local) console.warn(`  AIONUI_ENGINES_LOCAL_DIR=${local} has no claude/claude.exe + opencode/opencode.exe; downloading`);
    claude = fetchClaude(pins.claudeSdk);
    opencode = fetchOpencode(pins.opencode);
  }

  ensureDirectory(path.join(outDir, 'claude'));
  ensureDirectory(path.join(outDir, 'opencode'));
  fs.copyFileSync(claude.exe, path.join(outDir, 'claude', 'claude.exe'));
  fs.copyFileSync(opencode.exe, path.join(outDir, 'opencode', 'opencode.exe'));
  writeJson(path.join(outDir, 'manifest.json'), {
    platform,
    arch,
    runtimeKey,
    binariesBundled: true,
    claude: { version: claude.version, source: claude.source },
    opencode: { version: opencode.version, source: opencode.source },
    generatedAt: new Date().toISOString(),
  });
  console.log(
    `  Bundled engines: claude ${claude.version} (${fileSizeMb(path.join(outDir, 'claude', 'claude.exe'))} MB)` +
      ` + opencode ${opencode.version} (${fileSizeMb(path.join(outDir, 'opencode', 'opencode.exe'))} MB)`
  );
}

module.exports = { prepareEngineRuntimes };

// CLI entry: node prepare-engine-runtimes.js [--project-root <dir>] [--platform <p>] [--arch <a>]
if (require.main === module) {
  const argv = process.argv.slice(2);
  const arg = (name, fallback) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : fallback;
  };
  prepareEngineRuntimes({
    projectRoot: arg('--project-root', path.resolve(__dirname, '..', '..', '..')),
    platform: arg('--platform', process.platform),
    arch: arg('--arch', process.arch),
  });
}
