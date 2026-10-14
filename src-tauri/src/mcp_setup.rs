//! Native helpers for the "Use your Claude plan" setup: register owlsh with Claude Code and reveal
//! the Claude Desktop config folder. Spawned via std::process (not ACL-gated by Tauri capabilities).

use std::path::{Path, PathBuf};
use std::process::Command;

/// The absolute path to the owlsh MCP binary, so registrations don't depend on `owlsh` being on the
/// user's PATH. Searches PATH for `owlsh` (skipping this app's own executable, which shares the name),
/// and falls back to the bare name when it can't be located — the one case where PATH is still relied
/// on. A future bundled sidecar would be resolved here first.
#[tauri::command]
pub fn owlsh_bin_path() -> String {
    let name = if cfg!(target_os = "windows") { "owlsh.exe" } else { "owlsh" };
    let myself = std::env::current_exe().ok().and_then(|p| p.canonicalize().ok());
    if let Some(paths) = std::env::var_os("PATH") {
        for dir in std::env::split_paths(&paths) {
            let cand = dir.join(name);
            if cand.exists() && cand.canonicalize().ok() != myself {
                if let Some(s) = cand.to_str() {
                    return s.to_string();
                }
            }
        }
    }
    "owlsh".to_string()
}

/// Register owlsh with Claude Code at user scope, pointing at its resolved absolute path (not the bare
/// `owlsh`), so it connects regardless of the client's PATH. Best-effort: returns the CLI's output.
#[tauri::command]
pub fn mcp_add() -> Result<String, String> {
    let bin = owlsh_bin_path();
    // On Windows `claude` is typically a .cmd shim, so go through cmd.
    #[cfg(target_os = "windows")]
    let out = Command::new("cmd").args(["/C", "claude", "mcp", "add", "owlsh", "--scope", "user", "--", &bin, "mcp"]).output();
    #[cfg(not(target_os = "windows"))]
    let out = Command::new("claude").args(["mcp", "add", "owlsh", "--scope", "user", "--", &bin, "mcp"]).output();

    let out = out.map_err(|e| format!("could not run the claude CLI (is Claude Code installed?): {e}"))?;
    let text = format!(
        "{}{}",
        String::from_utf8_lossy(&out.stdout),
        String::from_utf8_lossy(&out.stderr)
    );
    let text = text.trim().to_string();
    if out.status.success() {
        Ok(if text.is_empty() { "Added owlsh to Claude Code.".into() } else { text })
    } else {
        Err(if text.is_empty() { "claude mcp add failed".into() } else { text })
    }
}

/// Whether owlsh is registered with the user's Claude client and the client can reach it.
#[derive(serde::Serialize)]
pub struct McpStatus {
    pub registered: bool,
    pub connected: bool,
}

fn claude_json_path() -> Option<PathBuf> {
    let home = std::env::var_os("USERPROFILE").or_else(|| std::env::var_os("HOME"))?;
    Some(PathBuf::from(home).join(".claude.json"))
}

/// The `command` of the preferred owlsh MCP entry in a parsed `~/.claude.json`, or None if owlsh
/// isn't registered. User scope (top-level `mcpServers`) wins over any project-local entry, because
/// it's the one available in every Claude session — and the one owlsh registers with a full path.
/// Pure, so the lookup is unit-testable without a real config file.
fn owlsh_command(config: &serde_json::Value) -> Option<String> {
    let pick = |m: &serde_json::Value| {
        m.get("mcpServers")?.get("owlsh")?.get("command")?.as_str().map(str::to_string)
    };
    if let Some(cmd) = pick(config) {
        return Some(cmd);
    }
    for (_dir, proj) in config.get("projects")?.as_object()? {
        if let Some(cmd) = pick(proj) {
            return Some(cmd);
        }
    }
    None
}

/// Whether a registered server's `command` can actually be launched: an absolute path must exist on
/// disk; a bare name must resolve on PATH. This is why owlsh prefers registering with a full path —
/// it's verifiable regardless of the client's PATH.
fn command_runnable(cmd: &str) -> bool {
    let p = Path::new(cmd);
    if p.is_absolute() || cmd.contains(['/', '\\']) {
        return p.exists() || Path::new(&format!("{cmd}.exe")).exists();
    }
    let Some(paths) = std::env::var_os("PATH") else { return false };
    std::env::split_paths(&paths).any(|dir| {
        ["", ".exe", ".cmd", ".bat"].iter().any(|ext| dir.join(format!("{cmd}{ext}")).exists())
    })
}

/// Detect whether owlsh is wired into the user's Claude client by reading `~/.claude.json` directly
/// — not by shelling the `claude` CLI, which a GUI app often can't find on PATH (its env differs from
/// the shell that installed Claude). `connected` means the registered command is launchable on disk.
/// Reads only the owlsh entry; nothing else in the config is parsed out, logged, or returned.
#[tauri::command]
pub fn mcp_status() -> McpStatus {
    let not_connected = McpStatus { registered: false, connected: false };
    let Some(path) = claude_json_path() else { return not_connected };
    let Ok(text) = std::fs::read_to_string(&path) else { return not_connected };
    let Ok(config) = serde_json::from_str::<serde_json::Value>(&text) else { return not_connected };
    match owlsh_command(&config) {
        Some(cmd) => McpStatus { registered: true, connected: command_runnable(&cmd) },
        None => not_connected,
    }
}

fn claude_config_dir() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    return std::env::var_os("APPDATA").map(|p| PathBuf::from(p).join("Claude"));
    #[cfg(target_os = "macos")]
    return std::env::var_os("HOME").map(|p| PathBuf::from(p).join("Library/Application Support/Claude"));
    #[cfg(all(unix, not(target_os = "macos")))]
    return std::env::var_os("HOME").map(|p| PathBuf::from(p).join(".config/Claude"));
}

/// Open the Claude Desktop config folder (where `claude_desktop_config.json` lives) in the file manager.
#[tauri::command]
pub fn reveal_claude_config() -> Result<String, String> {
    let dir = claude_config_dir().ok_or("could not locate the home directory")?;
    if !dir.is_dir() {
        return Err(format!("Claude Desktop config folder not found at {} (is Claude Desktop installed?)", dir.display()));
    }
    #[cfg(target_os = "windows")]
    let spawned = Command::new("explorer").arg(&dir).spawn();
    #[cfg(target_os = "macos")]
    let spawned = Command::new("open").arg(&dir).spawn();
    #[cfg(all(unix, not(target_os = "macos")))]
    let spawned = Command::new("xdg-open").arg(&dir).spawn();
    spawned.map(|_| format!("Opened {}", dir.display())).map_err(|e| format!("could not open the folder: {e}"))
}

#[cfg(test)]
mod tests {
    use super::{command_runnable, owlsh_command};
    use serde_json::json;

    #[test]
    fn prefers_the_user_scope_entry_over_a_project_one() {
        let cfg = json!({
            "mcpServers": { "owlsh": { "command": "C:/abs/owlsh.exe", "args": ["mcp"] } },
            "projects": { "C:/somewhere": { "mcpServers": { "owlsh": { "command": "owlsh" } } } },
        });
        assert_eq!(owlsh_command(&cfg).as_deref(), Some("C:/abs/owlsh.exe"));
    }

    #[test]
    fn falls_back_to_a_project_scoped_entry() {
        let cfg = json!({
            "projects": { "C:/home": { "mcpServers": { "owlsh": { "command": "owlsh", "args": ["mcp"] } } } },
        });
        assert_eq!(owlsh_command(&cfg).as_deref(), Some("owlsh"));
    }

    #[test]
    fn none_when_owlsh_is_absent() {
        let cfg = json!({ "mcpServers": { "pencil": { "command": "pencil" } }, "projects": {} });
        assert!(owlsh_command(&cfg).is_none());
    }

    #[test]
    fn absolute_command_is_runnable_only_when_the_file_exists() {
        // The test binary itself is a path that exists; a sibling bogus path does not.
        let me = std::env::current_exe().unwrap();
        assert!(command_runnable(me.to_str().unwrap()));
        assert!(!command_runnable("C:/definitely/not/here/owlsh.exe"));
        assert!(!command_runnable("/definitely/not/here/owlsh"));
    }
}
