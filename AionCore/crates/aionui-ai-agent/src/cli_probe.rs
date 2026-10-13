use std::time::Duration;

use aionui_api_types::AgentMetadata;
use aionui_runtime::{Builder, resolve_command_path};
#[cfg(test)]
use std::path::PathBuf;

/// Inline (startup) `--version` budget. Bounds backend readiness; agents that
/// exceed it are NOT condemned — they go to the background recheck instead.
pub(crate) const CLI_VERSION_TIMEOUT: Duration = Duration::from_secs(5);
/// Background recheck `--version` budget for probes that exceeded the inline
/// budget. Sized to the session-handshake tolerance, not the startup path.
pub(crate) const CLI_VERSION_RECHECK_TIMEOUT: Duration = Duration::from_secs(30);

/// Successful probe evidence.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ProbeSuccess {
    /// Wall-clock cost of the `--version` run; 0 when the version step was skipped.
    pub(crate) duration_ms: u64,
    /// Whether `--version` actually ran (false for `skip_version_probe` agents).
    pub(crate) version_checked: bool,
    /// First non-empty line the CLI printed, when the probe ran and produced
    /// one. The probe already spends a process launch on `--version` and used
    /// to discard the output; a caller that cares which version is installed
    /// would otherwise have to run it a second time.
    pub(crate) reported_version: Option<String>,
}

/// Classified probe failure. The split matters: a corrupted install fails
/// `--version` fast and deterministically (exit != 0), while a timeout is
/// evidence of a healthy-but-large CLI on slow I/O — the two must not be
/// collapsed into one verdict.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum ProbeFailure {
    NoCommand,
    CommandNotFound { command: String },
    SkipLookup { detail: String },
    VersionFailed { detail: String, duration_ms: u64 },
    VersionTimeout { budget_ms: u64 },
    /// A builtin engine (claude/opencode) whose isolated runtime binary never
    /// got provisioned. Probing would resolve the bare name through the
    /// user's PATH and actually run the user's own global install, so the
    /// probe refuses instead (`AIONUI_ALLOW_PATH_AGENT=1` re-enables the
    /// legacy PATH resolution for dev/test).
    EngineNotReady { backend: String },
}

impl ProbeFailure {
    pub(crate) fn error_code(&self) -> &'static str {
        match self {
            Self::NoCommand | Self::CommandNotFound { .. } => "command_not_found",
            Self::SkipLookup { .. } => "package_lock_invalid",
            Self::VersionFailed { .. } => "version_probe_failed",
            Self::VersionTimeout { .. } => "version_probe_timeout",
            Self::EngineNotReady { .. } => "engine_not_ready",
        }
    }

    /// Human-readable detail carrying the classification and measured cost,
    /// suitable for `last_check_error_message`.
    pub(crate) fn detail(&self) -> String {
        match self {
            Self::NoCommand => "agent has no CLI command to probe".to_owned(),
            Self::CommandNotFound { command } => format!("`{command}` not found on PATH"),
            Self::SkipLookup { detail } => detail.clone(),
            Self::VersionFailed { detail, duration_ms } => {
                format!("version_probe_failed ({duration_ms}ms): {detail}")
            }
            Self::VersionTimeout { budget_ms } => {
                format!(
                    "version_probe_timeout@{budget_ms}ms: `--version` timed out (slow load, not proof of corruption)"
                )
            }
            Self::EngineNotReady { backend } => format!(
                "{backend} engine not ready: the isolated runtime binary is not configured; \
                 restart the app to re-run runtime setup (AIONUI_ALLOW_PATH_AGENT=1 for dev)"
            ),
        }
    }
}

/// Zeus isolation gate shared by every PATH-touching surface: `Some(backend)`
/// when `meta` is a builtin claude/opencode row without a command_override and
/// the dev fallback is closed — the caller must treat the engine as "not
/// ready" instead of resolving anything from PATH. `fallback_allowed` comes
/// from `aionui_runtime::path_agent_fallback_allowed()` (kept as a parameter
/// so tests stay pure).
pub(crate) fn builtin_engine_gated(meta: &AgentMetadata, fallback_allowed: bool) -> Option<&str> {
    if meta.agent_source == aionui_api_types::AgentSource::Builtin
        && matches!(meta.backend.as_deref(), Some("claude") | Some("opencode"))
        && !meta.has_command_override
        && !fallback_allowed
    {
        meta.backend.as_deref()
    } else {
        None
    }
}

pub(crate) fn command_name(meta: &AgentMetadata) -> Option<&str> {
    if meta.has_command_override
        && let Some(command) = meta.command.as_deref().filter(|command| !command.is_empty())
    {
        return Some(command);
    }

    meta.agent_source_info
        .binary_name
        .as_deref()
        .or(meta.command.as_deref())
}

pub(crate) async fn validate_with_budget(meta: &AgentMetadata, budget: Duration) -> Result<ProbeSuccess, ProbeFailure> {
    if let Some(backend) = builtin_engine_gated(meta, aionui_runtime::path_agent_fallback_allowed()) {
        return Err(ProbeFailure::EngineNotReady { backend: backend.to_owned() });
    }
    let command = command_name(meta).ok_or(ProbeFailure::NoCommand)?;
    let path = resolve_command_path(command).ok_or_else(|| ProbeFailure::CommandNotFound {
        command: command.to_owned(),
    })?;
    if meta.agent_source == aionui_api_types::AgentSource::Builtin
        && meta.agent_source_info.bridge_binary.as_deref() == Some("npx")
        && let Some(backend) = meta.backend.as_deref()
        && aionui_runtime::should_skip_registry_npx_version_probe(backend).map_err(|error| {
            ProbeFailure::SkipLookup {
                detail: error.to_string(),
            }
        })?
    {
        return Ok(ProbeSuccess {
            duration_ms: 0,
            version_checked: false,
            reported_version: None,
        });
    }
    // The probe runs the CLI as the session would, so it carries the agent's
    // env overrides (isolation redirects + credential neutralization) instead
    // of the bare host environment.
    let env: Vec<(String, String)> = meta
        .env
        .iter()
        .map(|entry| (entry.name.clone(), entry.value.clone()))
        .collect();
    validate_version_with_timeout(&path, budget, &env).await
}

#[cfg(test)]
async fn resolve_and_validate_command(command: &str) -> Result<PathBuf, ProbeFailure> {
    let path = resolve_command_path(command).ok_or_else(|| ProbeFailure::CommandNotFound {
        command: command.to_owned(),
    })?;
    validate_version_with_timeout(&path, CLI_VERSION_TIMEOUT, &[]).await?;
    Ok(path)
}

async fn validate_version_with_timeout(
    path: &std::path::Path,
    budget: Duration,
    env: &[(String, String)],
) -> Result<ProbeSuccess, ProbeFailure> {
    let mut command = Builder::clean_cli(path);
    command.envs(env.iter().cloned());
    command.arg("--version");

    let started = std::time::Instant::now();
    let output = tokio::time::timeout(budget, command.output())
        .await
        .map_err(|_| ProbeFailure::VersionTimeout {
            budget_ms: budget.as_millis() as u64,
        })?
        .map_err(|error| ProbeFailure::VersionFailed {
            detail: format!("failed to run `{} --version`: {error}", path.display()),
            duration_ms: started.elapsed().as_millis() as u64,
        })?;
    let duration_ms = started.elapsed().as_millis() as u64;

    if output.status.success() {
        return Ok(ProbeSuccess {
            duration_ms,
            version_checked: true,
            reported_version: first_nonempty_line(&output.stdout),
        });
    }

    let detail = first_nonempty_line(&output.stderr)
        .or_else(|| first_nonempty_line(&output.stdout))
        .unwrap_or_else(|| format!("exited with status {}", output.status));
    Err(ProbeFailure::VersionFailed {
        detail: format!("`{} --version` failed: {detail}", path.display()),
        duration_ms,
    })
}

fn first_nonempty_line(bytes: &[u8]) -> Option<String> {
    String::from_utf8_lossy(bytes)
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .map(|line| line.chars().take(500).collect())
}

#[cfg(all(test, unix))]
mod tests {
    use std::os::unix::fs::PermissionsExt;

    use super::*;

    fn executable_script(name: &str, contents: &str) -> (tempfile::TempDir, PathBuf) {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(name);
        std::fs::write(&path, contents).unwrap();
        let mut permissions = std::fs::metadata(&path).unwrap().permissions();
        permissions.set_mode(0o755);
        std::fs::set_permissions(&path, permissions).unwrap();
        (dir, path)
    }

    #[tokio::test]
    async fn version_probe_accepts_runnable_cli() {
        let (_dir, path) = executable_script("agent-cli", "#!/bin/sh\nprintf 'agent-cli 1.2.3\\n'\n");
        assert_eq!(
            resolve_and_validate_command(path.to_str().unwrap()).await.unwrap(),
            path
        );
    }

    #[tokio::test]
    async fn version_probe_carries_the_reported_version() {
        // The availability path decides agy drift from this. Discarding it
        // (as the probe used to) would mean a second `--version` launch, or —
        // as shipped — no drift warning at connection-test time at all.
        let (_dir, path) = executable_script("agent-cli", "#!/bin/sh\nprintf '1.1.8\\n'\n");
        let ok = validate_version_with_timeout(&path, Duration::from_secs(5), &[])
            .await
            .unwrap();
        assert_eq!(ok.reported_version.as_deref(), Some("1.1.8"));
    }

    #[tokio::test]
    async fn version_probe_carries_the_agent_env() {
        // The probe must run the CLI the way a session would: with the agent's
        // env overrides (isolation redirects + credential neutralization), not
        // the bare host environment.
        let (_dir, path) = executable_script("agent-cli", "#!/bin/sh\nprintf \"$PROBE_TEST_VAR\\n\"\n");
        let ok = validate_version_with_timeout(
            &path,
            Duration::from_secs(5),
            &[("PROBE_TEST_VAR".to_owned(), "carried".to_owned())],
        )
        .await
        .unwrap();
        assert_eq!(ok.reported_version.as_deref(), Some("carried"));
    }

    #[tokio::test]
    async fn a_silent_cli_reports_no_version_rather_than_an_empty_one() {
        // Some CLIs exit 0 without printing. `Some("")` would be read as a
        // parseable version and could produce a bogus drift verdict.
        let (_dir, path) = executable_script("agent-cli", "#!/bin/sh\nexit 0\n");
        let ok = validate_version_with_timeout(&path, Duration::from_secs(5), &[])
            .await
            .unwrap();
        assert_eq!(ok.reported_version, None);
    }

    #[tokio::test]
    async fn version_probe_success_reports_duration() {
        let (_dir, path) = executable_script("agent-cli", "#!/bin/sh\nprintf 'agent-cli 1.2.3\\n'\n");
        let ok = validate_version_with_timeout(&path, Duration::from_secs(5), &[])
            .await
            .unwrap();
        assert!(ok.version_checked);
        assert!(
            ok.duration_ms < 5_000,
            "duration should be measured, got {}",
            ok.duration_ms
        );
    }

    #[tokio::test]
    async fn version_probe_classifies_broken_install() {
        let (_dir, path) = executable_script(
            "agent-cli",
            "#!/bin/sh\nprintf 'native binary missing\\n' >&2\nexit 1\n",
        );
        let failure = validate_version_with_timeout(&path, Duration::from_secs(5), &[])
            .await
            .unwrap_err();
        assert_eq!(failure.error_code(), "version_probe_failed");
        match &failure {
            ProbeFailure::VersionFailed { detail, .. } => {
                assert!(detail.contains("native binary missing"), "{detail}");
            }
            other => panic!("expected VersionFailed, got {other:?}"),
        }
        assert!(
            failure.detail().contains("native binary missing"),
            "{}",
            failure.detail()
        );
    }

    #[tokio::test]
    async fn version_probe_classifies_timeout_without_condemning() {
        let (_dir, path) = executable_script("agent-cli", "#!/bin/sh\nsleep 10\n");
        let failure = validate_version_with_timeout(&path, Duration::from_millis(50), &[])
            .await
            .unwrap_err();
        assert_eq!(failure, ProbeFailure::VersionTimeout { budget_ms: 50 });
        assert_eq!(failure.error_code(), "version_probe_timeout");
        assert!(failure.detail().contains("timed out"), "{}", failure.detail());
    }
}

#[cfg(test)]
mod gate_tests {
    use super::builtin_engine_gated;
    use aionui_api_types::{AgentHandshake, AgentMetadata, AgentSource, AgentSourceInfo, BehaviorPolicy};
    use aionui_common::AgentType;

    fn builtin(backend: &str, has_command_override: bool) -> AgentMetadata {
        AgentMetadata {
            id: "gate00001".into(),
            icon: None,
            name: "Engine".into(),
            name_i18n: None,
            description: None,
            description_i18n: None,
            backend: Some(backend.into()),
            agent_type: AgentType::Acp,
            agent_source: AgentSource::Builtin,
            agent_source_info: AgentSourceInfo::default(),
            enabled: true,
            available: true,
            command: None,
            resolved_command: None,
            args: vec![],
            env: vec![],
            native_skills_dirs: None,
            skill_delivery: None,
            behavior_policy: BehaviorPolicy::default(),
            yolo_id: None,
            sort_order: 0,
            team_capable: false,
            last_check_status: None,
            last_check_kind: None,
            last_check_error_code: None,
            last_check_error_message: None,
            last_check_error_details: None,
            last_check_guidance: None,
            last_check_latency_ms: None,
            last_check_at: None,
            last_success_at: None,
            last_failure_at: None,
            handshake: AgentHandshake::default(),
            has_command_override,
            env_override_key_count: 0,
        }
    }

    #[test]
    fn builtin_claude_and_opencode_are_gated_without_override() {
        assert_eq!(builtin_engine_gated(&builtin("claude", false), false), Some("claude"));
        assert_eq!(builtin_engine_gated(&builtin("opencode", false), false), Some("opencode"));
    }

    #[test]
    fn override_dev_escape_and_other_backends_stay_open() {
        // A provisioned engine (override applied by the runtime bootstrap)
        // resolves its own absolute path and is never gated.
        assert_eq!(builtin_engine_gated(&builtin("claude", true), false), None);
        // The dev escape hatch re-enables PATH resolution everywhere.
        assert_eq!(builtin_engine_gated(&builtin("claude", false), true), None);
        // codex is not part of the Zeus engine lineup and keeps legacy behavior.
        assert_eq!(builtin_engine_gated(&builtin("codex", false), false), None);
    }
}
