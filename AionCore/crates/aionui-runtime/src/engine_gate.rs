//! Isolation gate for the builtin agent engines (claude / opencode).
//!
//! Zeus ships its own engine binaries and never runs the user's globally
//! installed CLIs: no PATH fallback at spawn, probe or hydrate time, and no
//! access to the host's `~/.claude` / `~/.config/opencode`. Callers that used
//! to fall back to a PATH lookup consult [`path_agent_fallback_allowed`] so a
//! development or test environment can opt back into the legacy behavior with
//! `AIONUI_ALLOW_PATH_AGENT=1`.

/// Whether the legacy "resolve builtin engines from the user's PATH" behavior
/// is explicitly re-enabled for this process.
pub fn path_agent_fallback_allowed() -> bool {
    is_affirmative(std::env::var("AIONUI_ALLOW_PATH_AGENT").ok().as_deref())
}

/// `1` / `true` (case-insensitive, whitespace-tolerant) count as affirmative;
/// unset, empty, `0`, `false` and arbitrary text do not. Kept as a free
/// function so tests can exercise the parsing without racing on process env.
fn is_affirmative(value: Option<&str>) -> bool {
    value.is_some_and(|value| {
        let value = value.trim().to_ascii_lowercase();
        value == "1" || value == "true"
    })
}

#[cfg(test)]
mod tests {
    use super::is_affirmative;

    #[test]
    fn affirmative_values() {
        assert!(is_affirmative(Some("1")));
        assert!(is_affirmative(Some("true")));
        assert!(is_affirmative(Some("TRUE")));
        assert!(is_affirmative(Some(" True ")));
    }

    #[test]
    fn everything_else_is_closed() {
        assert!(!is_affirmative(None));
        assert!(!is_affirmative(Some("")));
        assert!(!is_affirmative(Some("0")));
        assert!(!is_affirmative(Some("false")));
        assert!(!is_affirmative(Some("yes")));
        assert!(!is_affirmative(Some("11")));
    }
}
