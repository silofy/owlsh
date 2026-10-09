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
                    out.push(with_sidecars(&p, s));
                }
            }
        }
    }
    out
}

fn merge_sidecar(v: &mut serde_json::Value, report_path: &std::path::Path, ext: &str, key: &str, want_array: bool) {
    let side = PathBuf::from(format!("{}.{ext}", report_path.display()));
    let Ok(s) = fs::read_to_string(&side) else { return };
    let Ok(val) = serde_json::from_str::<serde_json::Value>(&s) else { return };
    if want_array != val.is_array() || (!want_array && !val.is_object()) { return; }
    if let Some(obj) = v.as_object_mut() { obj.insert(key.to_string(), val); }
}

/// Merge the widget's sidecars into the report: `.hints` -> `hints`, `.golden` -> `hint_golden`.
/// The sidecars are deliberately not `.json`, so `list_sessions` never mistakes them for reports.
/// Any parse failure skips that sidecar only.
fn with_sidecars(report_path: &std::path::Path, raw: String) -> String {
    let Ok(mut v) = serde_json::from_str::<serde_json::Value>(&raw) else { return raw };
    merge_sidecar(&mut v, report_path, "hints", "hints", true);
    merge_sidecar(&mut v, report_path, "golden", "hint_golden", false);
    serde_json::to_string(&v).unwrap_or(raw)
}

/// Resolve `path` to a `.json` report inside the sessions folder, or refuse.
fn session_report(path: &str) -> Result<PathBuf, String> {
    let dir = fs::canonicalize(sessions_dir()).map_err(|e| e.to_string())?;
    let report = fs::canonicalize(path).map_err(|e| e.to_string())?;
    if !report.starts_with(&dir) || report.extension().and_then(|x| x.to_str()) != Some("json") {
        return Err("not a session report".into());
    }
    Ok(report)
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
    Some(LatestSession { path: p.display().to_string(), json: with_sidecars(&p, raw) })
}

/// Append one hint pull to `<report>.hints`. The path must resolve to a `.json` report inside the
/// sessions folder, so the webview can't point this command at an arbitrary file.
#[tauri::command]
pub fn record_hint(path: String, tier: u8, at_ms: f64, phase: String, source: Option<String>) -> Result<(), String> {
    if !(1..=3).contains(&tier) {
        return Err("tier must be 1, 2 or 3".into());
    }
    let report = session_report(&path)?;
    let side = PathBuf::from(format!("{}.hints", report.display()));
    let mut pulls: Vec<serde_json::Value> =
        fs::read_to_string(&side).ok().and_then(|s| serde_json::from_str(&s).ok()).unwrap_or_default();
    let mut pull = serde_json::json!({ "tier": tier, "atMs": at_ms, "phase": phase });
    if let Some(src) = source.filter(|s| matches!(s.as_str(), "static" | "ai:golden" | "ai:knowledge")) {
        pull["source"] = serde_json::Value::String(src);
    }
    pulls.push(pull);
    let body = serde_json::to_string_pretty(&pulls).map_err(|e| e.to_string())?;
    fs::write(&side, body).map_err(|e| e.to_string())
}

/// Cache the golden path resolved for live hints in `<report>.golden`. Body must be a JSON object.
#[tauri::command]
pub fn record_golden(path: String, body: String) -> Result<(), String> {
    let report = session_report(&path)?;
    let v: serde_json::Value = serde_json::from_str(&body).map_err(|e| e.to_string())?;
    if !v.is_object() { return Err("golden must be an object".into()); }
    fs::write(PathBuf::from(format!("{}.golden", report.display())), body).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn merges_hints_and_golden_sidecars() {
        let dir = std::env::temp_dir().join(format!("owlsh-side-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let rep = dir.join("r.json");
        fs::write(&rep, r#"{"episodes":[]}"#).unwrap();
        fs::write(dir.join("r.json.hints"), r#"[{"tier":1,"atMs":1,"phase":"x","source":"ai:golden"}]"#).unwrap();
        fs::write(dir.join("r.json.golden"), r#"{"source":"0xdf","confidence":0.8,"golden":[]}"#).unwrap();
        let v: serde_json::Value = serde_json::from_str(&with_sidecars(&rep, fs::read_to_string(&rep).unwrap())).unwrap();
        assert_eq!(v["hints"][0]["source"], "ai:golden");
        assert_eq!(v["hint_golden"]["source"], "0xdf");
    }

    #[test]
    fn a_broken_golden_sidecar_leaves_the_report_untouched() {
        let dir = std::env::temp_dir().join(format!("owlsh-bad-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let rep = dir.join("r.json");
        fs::write(&rep, r#"{"episodes":[]}"#).unwrap();
        fs::write(dir.join("r.json.golden"), "not json").unwrap();
        let v: serde_json::Value = serde_json::from_str(&with_sidecars(&rep, fs::read_to_string(&rep).unwrap())).unwrap();
        assert!(v.get("hint_golden").is_none());
    }
}
