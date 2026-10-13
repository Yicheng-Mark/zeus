/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Stage auxiliary managed resources into the bundled aioncore
 * managed-resources tree so packaged builds work on clean machines with no
 * node / python / git / officecli installed and no first-use downloads:
 *
 *   python/<dir>    embeddable CPython + pip + pinned site-packages
 *   git/<dir>       MinGit (GPLv2 — source offer included in the tree)
 *   officecli/<dir> OfficeCli release binary (sha256-verified)
 *   mcp/chrome-devtools-mcp/  vendored chrome-devtools-mcp (offline browser MCP)
 *
 * Also extends managed-resources/manifest.json with a `tools` array consumed
 * by aionui-runtime (managed_resources_contract.rs, schema v2 additive field).
 *
 * Run AFTER prepare-aioncore.js — that step creates the managed-resources
 * directory and writes the base manifest via `aioncore prepare-managed-resources`.
 *
 * win32-x64 only; other targets keep the manifest untouched (runtime falls
 * back to download / PATH behavior there, same as bundled engines).
 *
 * Environment:
 *   AIONUI_MANAGED_EXTRAS_SKIP=1                  skip entirely
 *   AIONUI_MANAGED_EXTRAS_CACHE_DIR               override cache root
 *   AIONUI_MANAGED_PYTHON_VERSION                 default 3.12.15
 *   AIONUI_MANAGED_GIT_VERSION                    MinGit version ('latest')
 *   AIONUI_MANAGED_OFFICECLI_VERSION              release tag ('latest')
 *   AIONUI_MCP_CHROME_DEVTOOLS_VERSION            default 0.16.0
 */

const { execFileSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DOWNLOAD_TIMEOUT_MS = 15 * 60 * 1000;
const META_TIMEOUT_MS = 30 * 1000;

// 3.12.10 is the last 3.12.x with Windows binaries on python.org — later
// security releases (3.12.11+) are source-only, their ftp dirs have no
// embed-amd64.zip (verified 2026-10).
const PY_VERSION_DEFAULT = '3.12.10';
const CHROME_DEVTOOLS_MCP_VERSION_DEFAULT = '0.16.0';
const GIT_REPO = 'git-for-windows/git';
const OFFICECLI_REPO = 'iOfficeAI/OfficeCLI';

function ensureDirectory(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function removeDirectorySafe(dirPath) {
  fs.rmSync(dirPath, { recursive: true, force: true });
}

function downloadFile(url, outputPath, label) {
  console.log(`  Downloading ${label} from ${url}`);
  execFileSync('curl', ['-L', '--fail', '--silent', '--show-error', '-o', outputPath, url], {
    timeout: DOWNLOAD_TIMEOUT_MS,
  });
}

function fetchJson(url) {
  const out = execFileSync('curl', ['-fsSL', url], { encoding: 'utf8', timeout: META_TIMEOUT_MS });
  return JSON.parse(out);
}

/**
 * npm is npm.cmd on Windows and Node refuses to spawn .cmd batch files
 * directly (CVE-2024-27980 hardening, EINVAL) — route through cmd.exe /c,
 * the same shape builtinMcp/browserServerPort.ts relies on.
 */
function runNpm(args, cwd) {
  const command = process.platform === 'win32' ? 'cmd.exe' : 'npm';
  const argv = process.platform === 'win32' ? ['/c', 'npm', ...args] : args;
  execFileSync(command, argv, { cwd, timeout: DOWNLOAD_TIMEOUT_MS, stdio: 'inherit' });
}

function extractZip(zipPath, dirPath) {
  ensureDirectory(dirPath);
  if (process.platform === 'win32') {
    const ps = `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${dirPath
      .replace(/'/g, "''")}' -Force`;
    execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { timeout: DOWNLOAD_TIMEOUT_MS });
  } else {
    execFileSync('unzip', ['-o', zipPath, '-d', dirPath], { timeout: DOWNLOAD_TIMEOUT_MS });
  }
}

function copyDirectory(sourcePath, targetPath) {
  ensureDirectory(path.dirname(targetPath));
  removeDirectorySafe(targetPath);
  fs.cpSync(sourcePath, targetPath, { recursive: true, force: true });
}

function sha256File(filePath) {
  const contents = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(contents).digest('hex').toLowerCase();
}

function fileSizeMb(targetPath) {
  return (fs.statSync(targetPath).size / (1024 * 1024)).toFixed(1);
}

function dirSizeMb(dirPath) {
  let total = 0;
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = path.join(dirPath, entry.name);
    total += entry.isDirectory() ? dirSizeMb(fullPath) : fs.statSync(fullPath).size;
  }
  return total / (1024 * 1024);
}

function cacheRoot() {
  return process.env.AIONUI_MANAGED_EXTRAS_CACHE_DIR || path.join(os.tmpdir(), 'aionui-managed-extras');
}

function fileHash(tag, filePath) {
  const hash = crypto.createHash('sha1').update(fs.readFileSync(filePath)).digest('hex');
  return `${tag}-${hash.slice(0, 8)}`;
}

// ---------------------------------------------------------------------------
// Python embeddable + pip + pinned site-packages
// ---------------------------------------------------------------------------

/**
 * Enable site-packages in an embeddable distribution. The stock `._pth` keeps
 * the interpreter isolated (no site, no site-packages); pip-installed packages
 * need both the path entry and the site machinery (for .dist-info/.pth).
 */
function enableSitePackages(pythonRoot, version) {
  const pthName = `python${version.split('.').slice(0, 2).join('')}._pth`;
  const pthPath = path.join(pythonRoot, pthName);
  if (!fs.existsSync(pthPath)) {
    throw new Error(`expected embeddable path config missing: ${pthPath}`);
  }
  let contents = fs.readFileSync(pthPath, 'utf8');
  contents = contents.replace(/^#\s*import site\s*$/m, 'import site');
  if (!contents.split(/\r?\n/).includes('Lib/site-packages')) {
    contents += `${contents.endsWith('\n') ? '' : '\n'}Lib/site-packages\n`;
  }
  fs.writeFileSync(pthPath, contents, 'utf8');
}

/** Build once under <cache>/root; the .pip-ready marker (written only after
 * pip + pinned packages installed) marks the cache hit — python.exe alone is
 * not enough, a mid-bootstrap failure would otherwise poison later runs. */
function preparePython(cacheBase, version, requirementsFile) {
  const cacheKey = fileHash(`python-${version}`, requirementsFile);
  const cacheDir = path.join(cacheBase, cacheKey);
  const root = path.join(cacheDir, 'root');
  if (fs.existsSync(path.join(cacheDir, '.pip-ready'))) {
    return { root, version, source: 'cache' };
  }

  removeDirectorySafe(cacheDir);
  ensureDirectory(root);

  const zipName = `python-${version}-embed-amd64.zip`;
  const zipPath = path.join(cacheDir, zipName);
  downloadFile(`https://www.python.org/ftp/python/${version}/${zipName}`, zipPath, `python ${version} embeddable`);
  extractZip(zipPath, root);
  fs.rmSync(zipPath, { force: true });

  enableSitePackages(root, version);

  // The embeddable distribution strips ensurepip from its stdlib zip (verified
  // 2026-10: `python -m ensurepip` → "No module named ensurepip"), so pip is
  // bootstrapped the canonical embeddable way via get-pip.py.
  console.log('  Bootstrapping pip (get-pip.py)');
  const getPipPath = path.join(cacheDir, 'get-pip.py');
  downloadFile('https://bootstrap.pypa.io/get-pip.py', getPipPath, 'get-pip.py');
  execFileSync(path.join(root, 'python.exe'), [getPipPath, '--no-warn-script-location'], {
    cwd: root,
    timeout: DOWNLOAD_TIMEOUT_MS,
    stdio: 'inherit',
  });
  fs.rmSync(getPipPath, { force: true });

  console.log('  Installing pinned site-packages');
  execFileSync(
    path.join(root, 'python.exe'),
    [
      '-m',
      'pip',
      'install',
      '--no-input',
      '--no-warn-script-location',
      '--no-cache-dir',
      '--only-binary',
      ':all:',
      '-r',
      requirementsFile,
      '--target',
      path.join(root, 'Lib', 'site-packages'),
    ],
    { cwd: root, timeout: DOWNLOAD_TIMEOUT_MS, stdio: 'inherit' }
  );

  fs.writeFileSync(path.join(cacheDir, '.pip-ready'), `${new Date().toISOString()}\n`, 'utf8');
  return { root, version, source: 'python.org' };
}

// ---------------------------------------------------------------------------
// MinGit
// ---------------------------------------------------------------------------

function findMinGitAsset(release) {
  const asset = (release.assets || []).find(
    (entry) => /^MinGit-\d+(\.\d+)*-64-bit\.zip$/.test(entry.name) && !entry.name.includes('busybox')
  );
  if (!asset || !release.tag_name) {
    throw new Error(`MinGit 64-bit asset not found for ${GIT_REPO}@${release.tag_name || 'latest'}`);
  }
  return { url: asset.browser_download_url, version: asset.name.replace(/^MinGit-/, '').replace(/-64-bit\.zip$/, '') };
}

function minGitVersionToTag(version) {
  const parts = version.split('.');
  // 2.56.0.2 -> v2.56.0.windows.2 ; 2.56.0 -> v2.56.0.windows.1
  const revision = parts.length > 3 ? parts[3] : '1';
  return `v${parts.slice(0, 3).join('.')}.windows.${revision}`;
}

function latestMinGitAsset(requestedVersion) {
  if (requestedVersion && requestedVersion !== 'latest') {
    const release = fetchJson(`https://api.github.com/repos/${GIT_REPO}/releases/tags/${minGitVersionToTag(requestedVersion)}`);
    return findMinGitAsset(release);
  }
  const release = fetchJson(`https://api.github.com/repos/${GIT_REPO}/releases/latest`);
  return findMinGitAsset(release);
}

/** Build once under <cache>/<version>/root; a cmd/git.exe there marks the hit. */
function prepareMinGit(cacheBase) {
  const requested = process.env.AIONUI_MANAGED_GIT_VERSION || 'latest';
  const asset = latestMinGitAsset(requested === 'latest' ? null : requested);
  const cacheDir = path.join(cacheBase, 'git', asset.version);
  const root = path.join(cacheDir, 'root');
  if (fs.existsSync(path.join(root, 'cmd', 'git.exe'))) {
    return { root, version: asset.version, source: 'cache' };
  }

  removeDirectorySafe(cacheDir);
  ensureDirectory(root);
  const zipPath = path.join(cacheDir, 'MinGit.zip');
  downloadFile(asset.url, zipPath, `MinGit ${asset.version}`);
  extractZip(zipPath, root);
  fs.rmSync(zipPath, { force: true });
  return { root, version: asset.version, source: 'github-release' };
}

// ---------------------------------------------------------------------------
// OfficeCli
// ---------------------------------------------------------------------------

function verifySha256Sums(base, workDir) {
  const sumsPath = path.join(workDir, 'SHA256SUMS');
  try {
    downloadFile(`${base}/SHA256SUMS`, sumsPath, 'SHA256SUMS');
  } catch {
    console.warn('  [officecli] SHA256SUMS unavailable; skipping checksum verification');
    return;
  }
  const expected = fs
    .readFileSync(sumsPath, 'utf8')
    .split(/\r?\n/)
    .find((line) => line.includes('officecli-win-x64.exe'))
    ?.trim()
    .split(/\s+/)[0];
  if (!expected) {
    console.warn('  [officecli] officecli-win-x64.exe not listed in SHA256SUMS; skipping verification');
    return;
  }
  const actual = sha256File(path.join(workDir, 'officecli.exe'));
  if (actual !== expected.toLowerCase()) {
    throw new Error(`officecli sha256 mismatch: expected ${expected}, got ${actual}`);
  }
  console.log('  officecli sha256 verified');
}

/** Minimal private package.json so npm treats `dir` as the install root. */
function writeFileSyncEmptyPackage(dir) {
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    `${JSON.stringify({ name: 'aionui-vendored-mcp', version: '0.0.0', private: true }, null, 2)}\n`,
    'utf8'
  );
}

function prepareOfficeCli(cacheBase) {  const requested = process.env.AIONUI_MANAGED_OFFICECLI_VERSION || 'latest';
  const tag =
    requested === 'latest'
      ? fetchJson(`https://api.github.com/repos/${OFFICECLI_REPO}/releases/latest`).tag_name
      : requested;
  if (!tag) throw new Error(`cannot resolve OfficeCli release tag (${requested})`);

  const cacheDir = path.join(cacheBase, 'officecli', tag);
  const exePath = path.join(cacheDir, 'officecli.exe');
  if (fs.existsSync(exePath)) {
    return { exe: exePath, version: tag, source: 'cache' };
  }

  removeDirectorySafe(cacheDir);
  ensureDirectory(cacheDir);
  const base = `https://github.com/${OFFICECLI_REPO}/releases/download/${tag}`;
  downloadFile(`${base}/officecli-win-x64.exe`, exePath, `officecli ${tag}`);
  verifySha256Sums(base, cacheDir);
  return { exe: exePath, version: tag, source: 'github-release' };
}

// ---------------------------------------------------------------------------
// Vendored chrome-devtools-mcp
// ---------------------------------------------------------------------------

/** Build once under <cache>/<version>; vendor-manifest.json marks the hit. */
function prepareVendoredMcp(cacheBase, version) {
  const cacheDir = path.join(cacheBase, 'mcp', 'chrome-devtools-mcp', version);
  if (fs.existsSync(path.join(cacheDir, 'vendor-manifest.json'))) {
    return { root: cacheDir, version, source: 'cache' };
  }

  removeDirectorySafe(cacheDir);
  ensureDirectory(cacheDir);
  // Anchor the install to this directory: without a local package.json npm
  // walks up to the nearest one (a stray file in the user's home directory
  // silently captures the tree) and the packages land outside the cache.
  writeFileSyncEmptyPackage(cacheDir);
  console.log(`  Installing chrome-devtools-mcp@${version} (npm)`);
  runNpm(['install', `chrome-devtools-mcp@${version}`, '--no-audit', '--no-fund'], cacheDir);

  const pkg = JSON.parse(
    fs.readFileSync(path.join(cacheDir, 'node_modules', 'chrome-devtools-mcp', 'package.json'), 'utf8')
  );
  const bin = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin && pkg.bin['chrome-devtools-mcp'];
  if (!bin) throw new Error(`chrome-devtools-mcp@${version} exposes no bin entry`);
  // Forward slashes only: the manifest is consumed cross-platform and the
  // managed-resources contract forbids backslashes in relative paths.
  const entry = path.join('node_modules', 'chrome-devtools-mcp', bin).split(path.sep).join('/');
  if (!fs.existsSync(path.join(cacheDir, entry))) {
    throw new Error(`chrome-devtools-mcp@${version} bin entry missing at ${entry}`);
  }

  fs.writeFileSync(
    path.join(cacheDir, 'vendor-manifest.json'),
    `${JSON.stringify({ name: 'chrome-devtools-mcp', version: pkg.version, entry }, null, 2)}\n`,
    'utf8'
  );
  return { root: cacheDir, version: pkg.version, source: 'npm-registry' };
}

// ---------------------------------------------------------------------------
// Manifest extension + main
// ---------------------------------------------------------------------------

function updateContractTools(managedRoot, entries) {
  const manifestPath = path.join(managedRoot, 'manifest.json');
  const contract = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const others = (contract.tools || []).filter((tool) => !entries.some((entry) => entry.name === tool.name));
  contract.tools = [...others, ...entries];
  fs.writeFileSync(manifestPath, `${JSON.stringify(contract, null, 2)}\n`, 'utf8');
}

/**
 * Git for Windows is GPLv2. Redistributing the binaries requires offering the
 * corresponding source; the release tag makes that a stable, resolvable URL.
 * MinGit's zip already carries the license text (COPYING) — this adds the
 * pointer to source and to where these notes live.
 */
function writeGitLicenseNotes(gitRoot, version) {
  const tag = minGitVersionToTag(version);
  const contents = [
    '# Git for Windows (MinGit) — redistribution notice',
    '',
    'Bundled binary distribution of Git for Windows, licensed under GPLv2.',
    'The license text ships inside this tree (see COPYING).',
    `Corresponding source: https://github.com/git-for-windows/git/tree/${tag}`,
    '',
  ].join('\n');
  fs.writeFileSync(path.join(gitRoot, 'SOURCE-OFFER.md'), contents, 'utf8');
}

function prepareManagedExtras({ projectRoot, platform, arch }) {
  if (process.env.AIONUI_MANAGED_EXTRAS_SKIP === '1') {
    console.log('[managed-extras] Skipping (AIONUI_MANAGED_EXTRAS_SKIP=1)');
    return { skipped: true };
  }
  if (!(platform === 'win32' && arch === 'x64')) {
    console.log(`[managed-extras] Not staged for ${platform}-${arch} (runtime falls back to first-use flows)`);
    return { skipped: true };
  }

  const managedRoot = path.join(projectRoot, 'resources', 'bundled-aioncore', `${platform}-${arch}`, 'managed-resources');
  if (!fs.existsSync(path.join(managedRoot, 'manifest.json'))) {
    throw new Error(
      `managed-resources contract missing under ${managedRoot} — run prepare-aioncore first (prepare-managed-resources)`
    );
  }

  console.log('[managed-extras] Staging python / git / officecli / vendored MCP');
  const cacheBase = path.join(cacheRoot(), `${platform}-${arch}`);
  ensureDirectory(cacheBase);

  const pythonVersion = process.env.AIONUI_MANAGED_PYTHON_VERSION || PY_VERSION_DEFAULT;
  const requirementsFile = path.join(__dirname, 'prepare-managed-extras.python-requirements.txt');

  const python = preparePython(cacheBase, pythonVersion, requirementsFile);
  const pythonDir = `python-${python.version}-win-x64`;
  copyDirectory(python.root, path.join(managedRoot, 'python', pythonDir));
  console.log(`  python ${python.version} (${dirSizeMb(path.join(managedRoot, 'python', pythonDir)).toFixed(1)} MB, ${python.source})`);

  const git = prepareMinGit(cacheBase);
  const gitDir = `mingit-${git.version}-win-x64`;
  copyDirectory(git.root, path.join(managedRoot, 'git', gitDir));
  writeGitLicenseNotes(path.join(managedRoot, 'git', gitDir), git.version);
  console.log(`  MinGit ${git.version} (${dirSizeMb(path.join(managedRoot, 'git', gitDir)).toFixed(1)} MB, ${git.source})`);

  const officecli = prepareOfficeCli(cacheBase);
  const officecliDir = `officecli-${officecli.version}`;
  const officecliTarget = path.join(managedRoot, 'officecli', officecliDir);
  ensureDirectory(officecliTarget);
  fs.copyFileSync(officecli.exe, path.join(officecliTarget, 'officecli.exe'));
  console.log(`  officecli ${officecli.version} (${fileSizeMb(path.join(officecliTarget, 'officecli.exe'))} MB, ${officecli.source})`);

  const mcpVersion = process.env.AIONUI_MCP_CHROME_DEVTOOLS_VERSION || CHROME_DEVTOOLS_MCP_VERSION_DEFAULT;
  const mcp = prepareVendoredMcp(cacheBase, mcpVersion);
  copyDirectory(mcp.root, path.join(managedRoot, 'mcp', 'chrome-devtools-mcp'));
  console.log(
    `  chrome-devtools-mcp ${mcp.version} (${dirSizeMb(path.join(managedRoot, 'mcp', 'chrome-devtools-mcp')).toFixed(1)} MB, ${mcp.source})`
  );

  updateContractTools(managedRoot, [
    { name: 'python', version: python.version, root: `python/${pythonDir}`, executables: ['python.exe'] },
    { name: 'git', version: git.version, root: `git/${gitDir}`, executables: ['cmd/git.exe'] },
    { name: 'officecli', version: officecli.version, root: `officecli/${officecliDir}`, executables: ['officecli.exe'] },
  ]);

  // Re-run the bundle verifier so a truncated staging fails the build here,
  // instead of surfacing on a clean machine as a broken install.
  const { verifyBundledAioncoreResources } = require('./verify-bundled-aioncore-resources.js');
  const verification = verifyBundledAioncoreResources({
    resourcesDir: path.join(projectRoot, 'resources'),
    electronPlatformName: platform,
    targetArch: arch,
  });
  if (verification.missing.length > 0 || verification.failures.length > 0) {
    const summary =
      verification.missing.length > 0 ? verification.missing.join(', ') : JSON.stringify(verification.failures);
    throw new Error(`staged managed extras failed bundle verification: ${summary}`);
  }

  console.log('[managed-extras] Done — manifest.json tools entries updated');
  return { skipped: false };
}

module.exports = { prepareManagedExtras };

// CLI entry: node prepare-managed-extras.js [--project-root <dir>] [--platform <p>] [--arch <a>]
if (require.main === module) {
  const argv = process.argv.slice(2);
  const arg = (name, fallback) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : fallback;
  };
  prepareManagedExtras({
    projectRoot: arg('--project-root', path.resolve(__dirname, '..', '..', '..')),
    platform: arg('--platform', process.platform),
    arch: arg('--arch', process.arch),
  });
}
