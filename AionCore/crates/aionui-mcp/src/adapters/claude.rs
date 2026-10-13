use std::collections::HashMap;
use std::path::Path;

use aionui_common::McpSource;

use super::cli_helpers::{
    DETECT_TIMEOUT, MUTATE_TIMEOUT, is_cli_installed, normalize_detection_status, run_cli_with_env, strip_ansi,
};
use super::engine_isolation::EngineIsolation;
use crate::adapter::{DetectedServer, McpAgentAdapter};
use crate::error::McpError;
use crate::types::McpServerTransport;

const CLI_NAME: &str = "claude";

/// Scopes to try when removing a server (user → local → project).
const REMOVE_SCOPES: &[&str] = &["user", "local", "project"];

/// MCP Agent adapter for Claude CLI.
///
/// # CLI Commands
///
/// - **detect**: `claude mcp list`
/// - **install (stdio)**: `claude mcp add-json -s user <name> <json>`
/// - **install (http/sse)**: `claude mcp add -s user --transport <type> <name> <url> [--header ...]`
/// - **remove**: `claude mcp remove -s <scope> <name>` (tries user → local → project)
///
/// Claude's list output uses a custom format:
/// `name: command args - ✓ Connected` or `name: command args - ✗ Failed`
///
/// Zeus isolation: every command runs the app-managed claude.exe (injected by
/// the desktop bootstrap) with `CLAUDE_CONFIG_DIR` pointed at the isolated
/// config tree, so `user`-scope writes land in the app's own config and the
/// user's global `~/.claude` is never read or written. The bare PATH name is
/// only reachable behind the `AIONUI_ALLOW_PATH_AGENT=1` dev escape; without
/// either, the adapter reports "not installed".
pub struct ClaudeAdapter {
    isolation: EngineIsolation,
}

impl ClaudeAdapter {
    pub fn new() -> Self {
        Self { isolation: EngineIsolation::from_process_env() }
    }

    /// Test constructor with an explicit isolation set.
    pub fn with_isolation(isolation: EngineIsolation) -> Self {
        Self { isolation }
    }

    /// Program to run: the app-managed exe when injected, the bare name only
    /// behind the dev escape, `None` = not installed.
    fn cli_program(&self) -> Option<String> {
        if let Some(exe) = &self.isolation.claude_exe {
            return Some(exe.to_string_lossy().into_owned());
        }
        if aionui_runtime::path_agent_fallback_allowed() {
            return Some(CLI_NAME.to_owned());
        }
        None
    }

    /// Spawn env mirroring the session spawn's isolation baseline: config
    /// redirect plus no self-update / telemetry. Empty in the dev-escape case
    /// (bare name keeps the host environment, legacy behavior).
    fn cli_env(&self) -> Vec<(String, String)> {
        self.isolation
            .claude_config_dir
            .as_ref()
            .map(|dir| {
                vec![
                    ("CLAUDE_CONFIG_DIR".to_owned(), dir.to_string_lossy().into_owned()),
                    ("DISABLE_AUTOUPDATER".to_owned(), "1".to_owned()),
                    ("DISABLE_TELEMETRY".to_owned(), "1".to_owned()),
                ]
            })
            .unwrap_or_default()
    }

    fn require_program(&self) -> Result<(String, Vec<(String, String)>), McpError> {
        let program = self.cli_program().ok_or_else(|| McpError::AgentNotInstalled(CLI_NAME.into()))?;
        Ok((program, self.cli_env()))
    }
}

impl Default for ClaudeAdapter {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait::async_trait]
impl McpAgentAdapter for ClaudeAdapter {
    fn source(&self) -> McpSource {
        McpSource::Claude
    }

    async fn is_installed(&self) -> Result<bool, McpError> {
        let Some(program) = self.cli_program() else {
            return Ok(false);
        };
        let path = Path::new(&program);
        if path.is_absolute() {
            return Ok(path.is_file());
        }
        is_cli_installed(CLI_NAME).await
    }

    async fn detect_existing(&self, _user_id: &str) -> Result<Vec<DetectedServer>, McpError> {
        let (program, env) = self.require_program()?;
        if !self.is_installed().await? {
            return Err(McpError::AgentNotInstalled(CLI_NAME.into()));
        }

        let (stdout, _stderr) = run_cli_with_env(&program, &["mcp", "list"], &env, DETECT_TIMEOUT).await?;
        Ok(parse_claude_list_output(&stdout))
    }

    async fn install_server(&self, name: &str, transport: &McpServerTransport) -> Result<(), McpError> {
        let (program, env) = self.require_program()?;
        if !self.is_installed().await? {
            return Err(McpError::AgentNotInstalled(CLI_NAME.into()));
        }

        match transport {
            McpServerTransport::Stdio { command, args, env: transport_env } => {
                let config = build_stdio_json(command, args, transport_env);
                let config_str =
                    serde_json::to_string(&config).map_err(|e| McpError::AgentOperationFailed(e.to_string()))?;
                run_cli_with_env(
                    &program,
                    &["mcp", "add-json", "-s", "user", name, &config_str],
                    &env,
                    MUTATE_TIMEOUT,
                )
                .await?;
            }
            McpServerTransport::Sse { url, headers } => {
                self.install_http_like(&program, &env, name, "sse", url, headers).await?;
            }
            McpServerTransport::Http { url, headers } => {
                self.install_http_like(&program, &env, name, "http", url, headers).await?;
            }
        }

        Ok(())
    }

    async fn remove_server(&self, name: &str) -> Result<(), McpError> {
        let (program, env) = self.require_program()?;
        if !self.is_installed().await? {
            return Err(McpError::AgentNotInstalled(CLI_NAME.into()));
        }

        // Try each scope; stop on first success or "not found".
        for scope in REMOVE_SCOPES {
            let (stdout, _stderr) =
                run_cli_with_env(&program, &["mcp", "remove", "-s", scope, name], &env, MUTATE_TIMEOUT).await?;
            let lower = stdout.to_lowercase();
            if lower.contains("removed") || lower.contains("not found") {
                return Ok(());
            }
        }

        // If none of the scopes reported "removed" or "not found", treat as
        // idempotent success (server may simply not exist).
        Ok(())
    }
}

impl ClaudeAdapter {
    /// Install an HTTP-like (sse/http) server via `claude mcp add`.
    async fn install_http_like(
        &self,
        program: &str,
        env: &[(String, String)],
        name: &str,
        transport_type: &str,
        url: &str,
        headers: &HashMap<String, String>,
    ) -> Result<(), McpError> {
        let mut args = vec![
            "mcp".to_owned(),
            "add".to_owned(),
            "-s".to_owned(),
            "user".to_owned(),
            "--transport".to_owned(),
            transport_type.to_owned(),
            name.to_owned(),
            url.to_owned(),
        ];

        for (key, value) in headers {
            args.push("--header".to_owned());
            args.push(format!("{key}: {value}"));
        }

        let arg_refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
        run_cli_with_env(program, &arg_refs, env, MUTATE_TIMEOUT).await?;
        Ok(())
    }
}

/// Build the JSON config for `claude mcp add-json`.
fn build_stdio_json(command: &str, args: &[String], env: &HashMap<String, String>) -> serde_json::Value {
    let mut config = serde_json::json!({
        "command": command,
        "args": args,
    });
    if !env.is_empty() {
        config["env"] = serde_json::json!(env);
    }
    config
}

// ---------------------------------------------------------------------------
// Output parsing
// ---------------------------------------------------------------------------

/// Parse Claude CLI `mcp list` output.
///
/// Claude uses a custom format (not the standard Gemini/Qwen pattern):
/// ```text
/// name: command args - ✓ Connected
/// name: command args - ✗ Failed to connect
/// ```
fn parse_claude_list_output(output: &str) -> Vec<DetectedServer> {
    let cleaned = strip_ansi(output);
    let mut servers = Vec::new();

    for line in cleaned.lines() {
        let trimmed = line.trim();
        if let Some(server) = parse_claude_list_line(trimmed) {
            servers.push(server);
        }
    }

    servers
}

/// Parse a single line of Claude list output.
///
/// Pattern: `<name>: <command_or_url> - [✓|✗] <status>`
fn parse_claude_list_line(line: &str) -> Option<DetectedServer> {
    // Split on " - " to separate "name: command" from status
    let dash_pos = line.rfind(" - ")?;
    let status = normalize_detection_status(&line[dash_pos + 3..]);

    let name_cmd_part = &line[..dash_pos];

    // Claude separates the name from command/URL with ": ". Names
    // themselves may contain ":" (for example plugin-scoped MCP entries).
    let separator_pos = name_cmd_part.find(": ")?;
    let name = name_cmd_part[..separator_pos].trim();
    if name.is_empty() {
        return None;
    }

    let command_or_url = name_cmd_part[separator_pos + 2..].trim();
    if command_or_url.is_empty() {
        return None;
    }

    let normalized_command_or_url = command_or_url
        .strip_suffix(" (HTTP)")
        .or_else(|| command_or_url.strip_suffix(" (SSE)"))
        .unwrap_or(command_or_url)
        .trim();

    // Heuristic: if it looks like a URL, treat as HTTP; otherwise stdio.
    let transport =
        if normalized_command_or_url.starts_with("http://") || normalized_command_or_url.starts_with("https://") {
            // SSE heuristic: URL ending with /sse
            if normalized_command_or_url.ends_with("/sse") {
                McpServerTransport::Sse {
                    url: normalized_command_or_url.to_owned(),
                    headers: HashMap::new(),
                }
            } else {
                McpServerTransport::Http {
                    url: normalized_command_or_url.to_owned(),
                    headers: HashMap::new(),
                }
            }
        } else {
            McpServerTransport::Stdio {
                command: normalized_command_or_url.to_owned(),
                args: Vec::new(),
                env: HashMap::new(),
            }
        };

    Some(DetectedServer {
        name: name.to_owned(),
        transport,
        importable: status.eq_ignore_ascii_case("Connected") && !name.starts_with("plugin:"),
        import_skip_reason: if name.starts_with("plugin:") {
            Some("Plugin-managed MCP".to_owned())
        } else if status.eq_ignore_ascii_case("Connected") {
            None
        } else {
            Some(status)
        },
    })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_claude_stdio_connected() {
        let output = "my-server: npx -y @test/server - ✓ Connected";
        let servers = parse_claude_list_output(output);
        assert_eq!(servers.len(), 1);
        assert_eq!(servers[0].name, "my-server");
        match &servers[0].transport {
            McpServerTransport::Stdio { command, .. } => {
                assert_eq!(command, "npx -y @test/server");
            }
            _ => panic!("expected Stdio"),
        }
    }

    #[test]
    fn parse_claude_stdio_failed() {
        let output = "broken-srv: node index.js - ✗ Failed to connect";
        let servers = parse_claude_list_output(output);
        assert_eq!(servers.len(), 1);
        assert!(!servers[0].importable);
        assert_eq!(servers[0].import_skip_reason.as_deref(), Some("Failed to connect"));
    }

    #[test]
    fn parse_claude_http_server() {
        let output = "remote: https://example.com/mcp - ✓ Connected";
        let servers = parse_claude_list_output(output);
        assert_eq!(servers.len(), 1);
        match &servers[0].transport {
            McpServerTransport::Http { url, .. } => {
                assert_eq!(url, "https://example.com/mcp");
            }
            _ => panic!("expected Http"),
        }
    }

    #[test]
    fn parse_claude_sse_heuristic() {
        let output = "sse-srv: https://example.com/sse - ✓ Connected";
        let servers = parse_claude_list_output(output);
        assert_eq!(servers.len(), 1);
        match &servers[0].transport {
            McpServerTransport::Sse { url, .. } => {
                assert_eq!(url, "https://example.com/sse");
            }
            _ => panic!("expected Sse"),
        }
    }

    #[test]
    fn parse_claude_plugin_http_server_needing_auth() {
        let output = "plugin:slack:slack: https://mcp.slack.com/mcp (HTTP) - ! Needs authentication";
        let servers = parse_claude_list_output(output);
        assert_eq!(servers.len(), 1);
        assert!(!servers[0].importable);
        assert_eq!(servers[0].import_skip_reason.as_deref(), Some("Plugin-managed MCP"));
    }

    #[test]
    fn parse_claude_multiple_servers() {
        let output = "\
my-mcp: npx -y @test/mcp - ✓ Connected
broken: node bad.js - ✗ Failed to connect
web: https://example.com/api - ✓ Connected";
        let servers = parse_claude_list_output(output);
        assert_eq!(servers.len(), 3);
        assert_eq!(servers[0].name, "my-mcp");
        assert_eq!(servers[1].name, "broken");
        assert!(!servers[1].importable);
        assert_eq!(servers[2].name, "web");
    }

    #[test]
    fn parse_claude_with_ansi() {
        let output = "\x1b[32m✓\x1b[0m test: npx srv - \x1b[32mConnected\x1b[0m";
        let servers = parse_claude_list_output(output);
        // After ANSI strip: "✓ test: npx srv - Connected"
        // The ✓ is at the beginning of the line, not in the "name: cmd" pattern
        // but it contains "Connected" so it should be parseable
        assert_eq!(servers.len(), 1);
    }

    #[test]
    fn parse_claude_no_servers() {
        let output = "No MCP servers configured.\nTry `claude mcp add` to get started.";
        let servers = parse_claude_list_output(output);
        assert!(servers.is_empty());
    }

    #[test]
    fn parse_claude_empty_output() {
        let servers = parse_claude_list_output("");
        assert!(servers.is_empty());
    }

    #[test]
    fn build_stdio_json_without_env() {
        let json = build_stdio_json("npx", &["-y".into(), "srv".into()], &HashMap::new());
        assert_eq!(json["command"], "npx");
        assert_eq!(json["args"], serde_json::json!(["-y", "srv"]));
        assert!(json.get("env").is_none());
    }

    #[test]
    fn build_stdio_json_with_env() {
        let mut env = HashMap::new();
        env.insert("KEY".into(), "VALUE".into());
        let json = build_stdio_json("node", &[], &env);
        assert_eq!(json["command"], "node");
        assert_eq!(json["env"]["KEY"], "VALUE");
    }

    // -- Zeus isolation -------------------------------------------------------

    #[tokio::test]
    async fn without_injection_claude_adapter_reports_not_installed() {
        if aionui_runtime::path_agent_fallback_allowed() {
            return; // developer machine running tests with the escape set
        }
        let adapter = ClaudeAdapter::with_isolation(Default::default());
        assert!(!adapter.is_installed().await.unwrap());
        assert!(matches!(
            adapter.detect_existing("u1").await.unwrap_err(),
            McpError::AgentNotInstalled(_)
        ));
    }

    #[tokio::test]
    async fn injected_exe_path_drives_availability() {
        let missing = ClaudeAdapter::with_isolation(EngineIsolation {
            claude_exe: Some(std::path::PathBuf::from("Z:/definitely/not/claude.exe")),
            ..Default::default()
        });
        assert!(!missing.is_installed().await.unwrap());

        let real = ClaudeAdapter::with_isolation(EngineIsolation {
            claude_exe: Some(std::env::current_exe().unwrap()),
            ..Default::default()
        });
        assert!(real.is_installed().await.unwrap());
    }
}
