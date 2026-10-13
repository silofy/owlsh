//! Native helpers for the "Use your Claude plan" setup: register owlsh with Claude Code and reveal
//! the Claude Desktop config folder. Spawned via std::process (not ACL-gated by Tauri capabilities).

use std::path::PathBuf;
use std::process::Command;

/// Run `claude mcp add owlsh -- owlsh mcp`. Best-effort: returns the CLI's output, or an error string.
#[tauri::command]
pub fn mcp_add() -> Result<String, String> {
    // On Windows `claude` is typically a .cmd shim, so go through cmd.
    #[cfg(target_os = "windows")]
    let out = Command::new("cmd").args(["/C", "claude", "mcp", "add", "owlsh", "--", "owlsh", "mcp"]).output();
    #[cfg(not(target_os = "windows"))]
    let out = Command::new("claude").args(["mcp", "add", "owlsh", "--", "owlsh", "mcp"]).output();

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
