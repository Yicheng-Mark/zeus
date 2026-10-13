//! Isolated engine paths for the claude / opencode MCP adapters (Zeus
//! isolation boundary).
//!
//! The desktop app injects the app-managed engine locations as process env
//! when it spawns aioncore (the same seam as `AIONUI_CACHE_DIR`). Adapters
//! consult them so MCP config detection and sync only ever touch the app's
//! own isolated config tree — the user's global `~/.claude` and
//! `~/.config/opencode` are never read or written. Without injection
//! (web-host standalone deploy) the adapters report "not installed" instead
//! of touching anything on the host.

use std::path::PathBuf;

/// App-managed claude.exe location (injected by the desktop bootstrap).
pub const ENV_CLAUDE_EXE: &str = "AIONUI_ENGINE_CLAUDE_EXE";
/// Isolated `CLAUDE_CONFIG_DIR` target (injected by the desktop bootstrap).
pub const ENV_CLAUDE_CONFIG_DIR: &str = "AIONUI_ENGINE_CLAUDE_CONFIG_DIR";
/// App-managed opencode.exe location (injected by the desktop bootstrap).
pub const ENV_OPENCODE_EXE: &str = "AIONUI_ENGINE_OPENCODE_EXE";
/// Isolated `OPENCODE_CONFIG_DIR` target (injected by the desktop bootstrap).
pub const ENV_OPENCODE_CONFIG_DIR: &str = "AIONUI_ENGINE_OPENCODE_CONFIG_DIR";

/// Engine locations injected by the desktop process. Every field is optional:
/// a missing field means "unknown here" and the adapter treats the engine as
/// not installed for that surface.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct EngineIsolation {
    pub claude_exe: Option<PathBuf>,
    pub claude_config_dir: Option<PathBuf>,
    pub opencode_exe: Option<PathBuf>,
    pub opencode_config_dir: Option<PathBuf>,
}

impl EngineIsolation {
    /// Pure constructor from a lookup closure — production passes the process
    /// env, tests inject a fixed map without touching global state.
    pub fn from_lookup(lookup: impl Fn(&str) -> Option<String>) -> Self {
        fn non_empty(lookup: impl Fn(&str) -> Option<String>, key: &str) -> Option<PathBuf> {
            lookup(key)
                .filter(|value| !value.trim().is_empty())
                .map(PathBuf::from)
        }
        Self {
            claude_exe: non_empty(&lookup, ENV_CLAUDE_EXE),
            claude_config_dir: non_empty(&lookup, ENV_CLAUDE_CONFIG_DIR),
            opencode_exe: non_empty(&lookup, ENV_OPENCODE_EXE),
            opencode_config_dir: non_empty(&lookup, ENV_OPENCODE_CONFIG_DIR),
        }
    }

    /// Read the injected locations from this process's environment.
    pub fn from_process_env() -> Self {
        Self::from_lookup(|key| std::env::var(key).ok())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn from_pairs(pairs: &[(&'static str, &'static str)]) -> EngineIsolation {
        EngineIsolation::from_lookup(|key| {
            pairs.iter().find(|(k, _)| *k == key).map(|(_, v)| v.to_string())
        })
    }

    #[test]
    fn from_lookup_parses_all_four_locations() {
        let iso = from_pairs(&[
            (ENV_CLAUDE_EXE, "C:/app/engines/claude.exe"),
            (ENV_CLAUDE_CONFIG_DIR, "C:/isolated/agents/claude"),
            (ENV_OPENCODE_EXE, "C:/app/engines/opencode.exe"),
            (ENV_OPENCODE_CONFIG_DIR, "C:/isolated/agents/opencode/config"),
        ]);
        assert_eq!(iso.claude_exe, Some(PathBuf::from("C:/app/engines/claude.exe")));
        assert_eq!(iso.claude_config_dir, Some(PathBuf::from("C:/isolated/agents/claude")));
        assert_eq!(iso.opencode_exe, Some(PathBuf::from("C:/app/engines/opencode.exe")));
        assert_eq!(
            iso.opencode_config_dir,
            Some(PathBuf::from("C:/isolated/agents/opencode/config"))
        );
    }

    #[test]
    fn from_lookup_defaults_to_empty() {
        let iso = EngineIsolation::from_lookup(|_| None);
        assert_eq!(iso, EngineIsolation::default());
    }

    #[test]
    fn from_lookup_ignores_blank_values() {
        let iso = from_pairs(&[(ENV_CLAUDE_EXE, "  ")]);
        assert_eq!(iso.claude_exe, None);
    }

    #[test]
    fn from_lookup_reads_partial_sets() {
        let iso = from_pairs(&[(ENV_OPENCODE_CONFIG_DIR, "C:/cfg")]);
        assert_eq!(iso.opencode_config_dir, Some(PathBuf::from("C:/cfg")));
        assert_eq!(iso.claude_exe, None);
        assert_eq!(iso.claude_config_dir, None);
    }
}
