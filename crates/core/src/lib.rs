//! Shared core for owlsh daemon. The session lifecycle controller and the re-redaction
//! pass live here so both the capture agent and the daemon use one implementation.

pub mod redact;
pub mod session;

pub use redact::{redact, redact_body, redact_headers};
pub use session::{EndReason, SessionConfig, SessionController, SessionEvent};

/// One-time move of the pre-rename data folder: `~/.watcher` → `~/.owlsh` (sessions, ssh taps).
/// Runs at startup of every binary; a no-op once `~/.owlsh` exists or when there's nothing to move.
pub fn migrate_legacy_home() {
    let Some(home) = std::env::var_os("USERPROFILE").or_else(|| std::env::var_os("HOME")) else { return };
    let home = std::path::PathBuf::from(home);
    let (old, new) = (home.join(".watcher"), home.join(".owlsh"));
    if old.is_dir() && !new.exists() {
        let _ = std::fs::rename(&old, &new);
    }
}
