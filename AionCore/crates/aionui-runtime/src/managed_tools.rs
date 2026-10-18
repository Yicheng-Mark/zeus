//! Bundled auxiliary tools (python / git / officecli, …) staged under the
//! managed-resources root by the desktop build pipeline.
//!
//! The bundle layout is described by the managed-resources contract
//! (`manifest.json`, `tools` entries). Everything here is opportunistic: a
//! missing tool only disables that tool's PATH injection / command fallback —
//! it never blocks startup and never triggers a download.

use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use tracing::{debug, info};

use crate::cache;
use crate::managed_resources;
use crate::managed_resources_contract::{
    MANAGED_RESOURCES_CONTRACT_FILE, ManagedResourcesContract, ManagedToolResourceContract,
};

pub const TOOL_PYTHON: &str = "python";
pub const TOOL_GIT: &str = "git";
pub const TOOL_OFFICECLI: &str = "officecli";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BundledTool {
    pub name: String,
    pub version: String,
    /// Absolute tool root (managed-resources root + contract `root`).
    pub root: PathBuf,
    /// Executables declared by the contract, resolved absolute.
    pub executables: Vec<PathBuf>,
}

static BUNDLED_TOOLS: OnceLock<Vec<BundledTool>> = OnceLock::new();

/// Parse the tools section of the managed-resources contract at `root` and
/// resolve entries against it. Any malformed manifest yields an empty list
/// (logged) — staged tools are strictly best-effort.
fn bundled_tools_at(root: &Path) -> Vec<BundledTool> {
    let manifest_path = root.join(MANAGED_RESOURCES_CONTRACT_FILE);
    let parsed: Option<ManagedResourcesContract> = std::fs::read_to_string(&manifest_path)
        .ok()
        .and_then(|contents| serde_json::from_str(&contents).ok());
    let Some(contract) = parsed else {
        debug!(manifest = %manifest_path.display(), "no parsable managed-resources contract; no bundled tools");
        return Vec::new();
    };

    contract
        .tools
        .iter()
        .filter_map(|entry| tool_from_contract(root, entry))
        .filter(|tool| tool.root.is_dir())
        .collect()
}

fn tool_from_contract(base: &Path, entry: &ManagedToolResourceContract) -> Option<BundledTool> {
    let root = PathBuf::from(&entry.root);
    if root.is_absolute() {
        return None;
    }
    let root = base.join(root);
    let executables = entry.executables.iter().map(|relative| root.join(relative)).collect();
    Some(BundledTool {
        name: entry.name.clone(),
        version: entry.version.clone(),
        root,
        executables,
    })
}

/// All bundled auxiliary tools visible to this process. Honors the managed
/// resources mode: outside Bundled mode (dev, download flows) this is always
/// empty so host-installed tools keep their current precedence.
pub fn bundled_tools() -> &'static [BundledTool] {
    BUNDLED_TOOLS.get_or_init(|| {
        if !managed_resources::requires_bundled_resources() {
            return Vec::new();
        }
        let Some(root) = managed_resources::bundled_root_path() else {
            return Vec::new();
        };
        let tools = bundled_tools_at(&root);
        if !tools.is_empty() {
            info!(
                tool_count = tools.len(),
                names = ?tools.iter().map(|tool| tool.name.as_str()).collect::<Vec<_>>(),
                "bundled managed tools resolved"
            );
        }
        tools
    })
}

pub fn bundled_tool(name: &str) -> Option<&'static BundledTool> {
    bundled_tools().iter().find(|tool| tool.name == name)
}

/// Locate the `exe_name` executable of `tool` by preferring executables
/// declared in the contract, then the conventional layout slots.
fn find_tool_executable(tool: &BundledTool, exe_name: &str) -> Option<PathBuf> {
    let declared = tool
        .executables
        .iter()
        .find(|exe| exe.file_name().and_then(|name| name.to_str()) == Some(exe_name));
    if let Some(exe) = declared {
        return Some(exe.clone());
    }
    // Layout fallbacks: Windows distributions keep executables at the root
    // (python embeddable) or under `cmd` (MinGit); Unix uses `bin`.
    [tool.root.join("cmd"), tool.root.join("bin"), tool.root.clone()]
        .into_iter()
        .find(|dir| dir.join(exe_name).is_file())
        .map(|dir| dir.join(exe_name))
}

/// Absolute path of the bundled python executable, when staged and intact.
pub fn bundled_python_exe() -> Option<PathBuf> {
    bundled_tool(TOOL_PYTHON)
        .and_then(python_exe_for)
        .filter(|path| path.is_file())
}

fn python_exe_for(tool: &BundledTool) -> Option<PathBuf> {
    let exe_name = if cfg!(windows) { "python.exe" } else { "python" };
    find_tool_executable(tool, exe_name)
}

/// Directories to prepend to the PATH of agent subprocesses so engines and
/// their MCP children resolve the bundled tools ahead of host installs.
///
/// Node comes from the (bundled or already-activated) managed node runtime —
/// `probe_preferred_local_runtime` never downloads and never copies, so this
/// stays cheap on every spawn. Python and git are used in place from the
/// install directory: they need no writes to their own tree for the bundled
/// use cases (preinstalled packages / read-only git operations), and npm /
/// pip caches live under the user profile anyway.
pub fn agent_path_prefixes() -> Vec<PathBuf> {
    let node_bin = crate::node_runtime::probe_preferred_local_runtime()
        .and_then(|node| node.node_path.parent().map(Path::to_path_buf));
    path_prefixes_from(bundled_tools(), node_bin.as_deref())
}

/// Tool-directory half of [`agent_path_prefixes`], split out so it can be
/// exercised without the process-wide bundled-tools cache and node probe.
fn path_prefixes_from(tools: &[BundledTool], node_bin: Option<&Path>) -> Vec<PathBuf> {
    let mut prefixes = Vec::new();

    if let Some(bin_dir) = node_bin {
        prefixes.push(bin_dir.to_path_buf());
    }
    let tool_named = |name: &str| tools.iter().find(|tool| tool.name == name);
    if let Some(python) = tool_named(TOOL_PYTHON)
        && let Some(exe) = python_exe_for(python)
        && let Some(bin_dir) = exe.parent()
    {
        prefixes.push(bin_dir.to_path_buf());
    }
    // git, officecli and any future flat-root tool share the same lookup: the
    // contract's declared executable first, then the conventional slots.
    for (tool_name, exe_name) in [
        (TOOL_GIT, if cfg!(windows) { "git.exe" } else { "git" }),
        (TOOL_OFFICECLI, if cfg!(windows) { "officecli.exe" } else { "officecli" }),
    ] {
        if let Some(tool) = tool_named(tool_name)
            && let Some(exe) = find_tool_executable(tool, exe_name)
            && let Some(bin_dir) = exe.parent()
        {
            prefixes.push(bin_dir.to_path_buf());
        }
    }

    prefixes
}

/// Writable per-user site root for the bundled python. Set as PYTHONUSERBASE
/// on agent subprocesses so `pip install --user` lands in a writable location
/// even when the app is installed under a read-only directory.
pub fn python_user_base() -> Option<PathBuf> {
    bundled_tool(TOOL_PYTHON)?;
    cache::runtime_root().map(|root| root.join("python-user"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write_contract(root: &Path, tools: &[(&str, &str, &str, &[&str])]) {
        let contract = ManagedResourcesContract {
            schema_version: 2,
            runtime_key: "win32-x64".into(),
            node: crate::managed_resources_contract::ManagedNodeResourceContract {
                version: "24.11.0".into(),
                root: "node/node-v24.11.0-win-x64".into(),
                executable: "node.exe".into(),
            },
            clis: vec![],
            tools: tools
                .iter()
                .map(|(name, version, root, executables)| ManagedToolResourceContract {
                    name: (*name).into(),
                    version: (*version).into(),
                    root: (*root).into(),
                    executables: executables.iter().map(|exe| (*exe).to_string()).collect(),
                })
                .collect(),
        };
        std::fs::create_dir_all(root).unwrap();
        std::fs::write(
            root.join(MANAGED_RESOURCES_CONTRACT_FILE),
            serde_json::to_string_pretty(&contract).unwrap(),
        )
        .unwrap();
    }

    fn write_exe(path: &Path) {
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, b"").unwrap();
    }

    #[test]
    fn bundled_tools_at_reads_contract_and_filters_missing_roots() {
        let temp = tempfile::tempdir().unwrap();
        write_contract(
            temp.path(),
            &[
                ("python", "3.12.10", "python/python-3.12.10-win-x64", &["python.exe"]),
                ("git", "2.50.0", "git/mingit-2.50.0-win-x64", &["cmd/git.exe"]),
            ],
        );

        // Only python's tree exists.
        let python_root = temp.path().join("python").join("python-3.12.10-win-x64");
        write_exe(&python_root.join("python.exe"));

        let tools = bundled_tools_at(temp.path());
        assert_eq!(tools.len(), 1, "tool whose root is missing must be dropped");
        assert_eq!(tools[0].name, "python");
        assert_eq!(tools[0].root, python_root);
        assert_eq!(tools[0].executables, vec![python_root.join("python.exe")]);
    }

    #[test]
    fn bundled_tools_at_tolerates_absent_or_malformed_manifest() {
        let temp = tempfile::tempdir().unwrap();
        assert!(bundled_tools_at(temp.path()).is_empty());

        std::fs::write(temp.path().join(MANAGED_RESOURCES_CONTRACT_FILE), "not json").unwrap();
        assert!(bundled_tools_at(temp.path()).is_empty());
    }

    #[test]
    fn find_tool_executable_prefers_declared_then_layout_slots() {
        let temp = tempfile::tempdir().unwrap();
        // No declared executables: MinGit layout `cmd/git.exe` is discovered.
        let mingit_root = temp.path().join("git").join("mingit-2.50.0-win-x64");
        write_exe(&mingit_root.join("cmd").join("git.exe"));
        let tool = BundledTool {
            name: "git".into(),
            version: "2.50.0".into(),
            root: mingit_root.clone(),
            executables: vec![],
        };
        assert_eq!(
            find_tool_executable(&tool, "git.exe"),
            Some(mingit_root.join("cmd").join("git.exe"))
        );

        // Declared executables win over layout guessing.
        let python_root = temp.path().join("python").join("python-3.12.10-win-x64");
        write_exe(&python_root.join("python.exe"));
        let tool = BundledTool {
            name: "python".into(),
            version: "3.12.10".into(),
            root: python_root.clone(),
            executables: vec![python_root.join("python.exe")],
        };
        assert_eq!(
            find_tool_executable(&tool, "python.exe"),
            Some(python_root.join("python.exe"))
        );
    }

    #[test]
    fn path_prefixes_cover_every_agent_facing_tool() {
        let temp = tempfile::tempdir().unwrap();
        let node_bin = temp.path().join("node").join("node-v24.11.0-win-x64");
        let python_root = temp.path().join("python").join("python-3.12.10-win-x64");
        let git_root = temp.path().join("git").join("mingit-2.50.0-win-x64");
        let officecli_root = temp.path().join("officecli").join("officecli-1.0.0");
        write_exe(&python_root.join("python.exe"));
        write_exe(&git_root.join("cmd").join("git.exe"));
        // OfficeCLI ships at the tool root with no bin/cmd slot — the layout a
        // declared-executable-only lookup has to catch.
        write_exe(&officecli_root.join("officecli.exe"));

        let tools = vec![
            BundledTool {
                name: TOOL_PYTHON.into(),
                version: "3.12.10".into(),
                root: python_root.clone(),
                executables: vec![python_root.join("python.exe")],
            },
            BundledTool {
                name: TOOL_GIT.into(),
                version: "2.50.0".into(),
                root: git_root.clone(),
                executables: vec![],
            },
            BundledTool {
                name: TOOL_OFFICECLI.into(),
                version: "1.0.0".into(),
                root: officecli_root.clone(),
                executables: vec![officecli_root.join("officecli.exe")],
            },
        ];

        // node first (engines resolve it ahead of host installs), then the
        // tools in contract order; the office-mode document skills need the
        // officecli directory present here or they fall back to installing it.
        assert_eq!(
            path_prefixes_from(&tools, Some(&node_bin)),
            vec![
                node_bin,
                python_root.clone(),
                git_root.join("cmd"),
                officecli_root,
            ]
        );
        // A bundle without a tool simply contributes no entry.
        assert_eq!(path_prefixes_from(&tools[..1], None), vec![python_root]);
    }
}
