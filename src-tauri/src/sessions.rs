//! Live-session bridge (the read side). The daemon writes per-spawn report JSON into
//! ~/.owlsh/sessions/; the webview polls this command and merges new/updated sessions into the
//! report — so a box you spawn in the browser appears in the window without a manual step.

use std::fs;
use std::path::PathBuf;

fn sessions_dir() -> PathBuf {
    let home = std::env::var("USERPROFILE").or_else(|_| std::env::var("HOME")).unwrap_or_default();
    PathBuf::from(home).join(".owlsh").join("sessions")
}

fn ssh_dir() -> PathBuf {
    let home = std::env::var("USERPROFILE").or_else(|_| std::env::var("HOME")).unwrap_or_default();
    PathBuf::from(home).join(".owlsh").join("ssh")
}

/// One file the SSH capture tap wrote — an `<id>.in` transcript or its `<id>.meta` sidecar.
#[derive(serde::Serialize)]
pub struct SshLogFile {
    pub name: String,
    pub content: String,
}

/// Return the tap's captured SSH session files (input transcripts + meta), for the frontend to fold
/// into the matching report as on-target commands. Named `<session-uuid>-<ts>.in|.meta`.
#[tauri::command]
pub fn list_ssh_logs() -> Vec<SshLogFile> {
    let mut out = Vec::new();
    if let Ok(entries) = fs::read_dir(ssh_dir()) {
        for e in entries.flatten() {
            let p = e.path();
            let ext = p.extension().and_then(|x| x.to_str());
            if matches!(ext, Some("in") | Some("out") | Some("tm") | Some("meta")) {
                if let (Some(name), Ok(content)) = (p.file_name().and_then(|n| n.to_str()), fs::read_to_string(&p)) {
                    out.push(SshLogFile { name: name.to_string(), content });
                }
            }
        }
    }
    out
}

/// Return the raw JSON of every session report the daemon has written (the frontend parses them).
#[tauri::command]
pub fn list_sessions() -> Vec<String> {
    let mut out = Vec::new();
    if let Ok(entries) = fs::read_dir(sessions_dir()) {
        for e in entries.flatten() {
            let p = e.path();
            if p.extension().and_then(|x| x.to_str()) == Some("json") {
                if let Ok(s) = fs::read_to_string(&p) {
                    out.push(with_hints(&p, s));
                }
            }
        }
    }
    out
}

/// Merge the live widget's hint pulls (`<report>.json.hints`, a JSON array) into the report as
/// `hints`, so the grade sees them. The sidecar is deliberately not `.json`, so `list_sessions`
/// never mistakes it for a report. Any parse failure leaves the report untouched.
fn with_hints(report_path: &std::path::Path, raw: String) -> String {
    let side = std::path::PathBuf::from(format!("{}.hints", report_path.display()));
    let Ok(h) = fs::read_to_string(&side) else { return raw };
    let (Ok(mut v), Ok(pulls)) = (serde_json::from_str::<serde_json::Value>(&raw), serde_json::from_str::<serde_json::Value>(&h)) else { return raw };
    if !pulls.is_array() { return raw; }
    match v.as_object_mut() {
        Some(obj) => { obj.insert("hints".to_string(), pulls); serde_json::to_string(&v).unwrap_or(raw) }
        None => raw,
    }
}

/// The most recently written session report (with its hint pulls merged) — what the floating widget
/// window follows. `None` until a capture has written anything.
#[derive(serde::Serialize)]
pub struct LatestSession {
    path: String,
    json: String,
}

#[tauri::command]
pub fn latest_session() -> Option<LatestSession> {
    let entries = fs::read_dir(sessions_dir()).ok()?;
    let mut best: Option<(std::time::SystemTime, PathBuf)> = None;
    for e in entries.flatten() {
        let p = e.path();
        if p.extension().and_then(|x| x.to_str()) != Some("json") {
            continue;
        }
        let Ok(t) = e.metadata().and_then(|m| m.modified()) else { continue };
        if best.as_ref().map_or(true, |(bt, _)| t > *bt) {
            best = Some((t, p));
        }
    }
    let (_, p) = best?;
    let raw = fs::read_to_string(&p).ok()?;
    Some(LatestSession { path: p.display().to_string(), json: with_hints(&p, raw) })
}

/// Append one hint pull to `<report>.hints`. The path must resolve to a `.json` report inside the
/// sessions folder, so the webview can't point this command at an arbitrary file.
#[tauri::command]
pub fn record_hint(path: String, tier: u8, at_ms: f64, phase: String) -> Result<(), String> {
    if !(1..=3).contains(&tier) {
        return Err("tier must be 1, 2 or 3".into());
    }
    let dir = fs::canonicalize(sessions_dir()).map_err(|e| e.to_string())?;
    let report = fs::canonicalize(&path).map_err(|e| e.to_string())?;
    if !report.starts_with(&dir) || report.extension().and_then(|x| x.to_str()) != Some("json") {
        return Err("not a session report".into());
    }
    let side = PathBuf::from(format!("{}.hints", report.display()));
    let mut pulls: Vec<serde_json::Value> =
        fs::read_to_string(&side).ok().and_then(|s| serde_json::from_str(&s).ok()).unwrap_or_default();
    pulls.push(serde_json::json!({ "tier": tier, "atMs": at_ms, "phase": phase }));
    let body = serde_json::to_string_pretty(&pulls).map_err(|e| e.to_string())?;
    fs::write(&side, body).map_err(|e| e.to_string())
}
