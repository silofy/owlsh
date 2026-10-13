//! Security boundary for the MCP connector: turns a raw session report into the
//! only shape owlsh ever exposes. Built as an allow-list (fields are copied out
//! one by one), so an unknown future key in the report can never leak. The golden
//! path (`golden_dag`, `hint_golden`) and any write-up are never copied.

use serde_json::{json, Map, Value};
use std::path::{Path, PathBuf};

const OUTPUT_MAX_CHARS: usize = 180;

pub struct ActiveSession {
    pub path: PathBuf,
    /// RAW, UNSANITIZED report (contains golden_dag / hint_golden). Must only
    /// ever be passed through `sanitize()`; never serialize or log it directly.
    pub value: Value,
}

fn truncate_chars(s: &str, max: usize) -> String {
    s.chars().take(max).collect()
}

fn scalar(v: Option<&Value>) -> Value {
    match v {
        Some(x @ (Value::String(_) | Value::Number(_) | Value::Bool(_))) => x.clone(),
        _ => Value::Null,
    }
}

pub fn sanitize(report: &Value) -> Value {
    let session = &report["session"];
    let target = &session["target"];

    let steps: Vec<Value> = report["episodes"]
        .as_array()
        .map(|eps| {
            eps.iter()
                .map(|e| {
                    json!({
                        "seq": scalar(e.get("seq")),
                        "cmd": scalar(e.get("cmd")),
                        "output": e.get("output_digest").and_then(Value::as_str)
                            .map(|s| Value::String(truncate_chars(s, OUTPUT_MAX_CHARS)))
                            .unwrap_or(Value::Null),
                    })
                })
                .collect()
        })
        .unwrap_or_default();

    let mut out = Map::new();
    out.insert("uuid".into(), scalar(session.get("uuid")));
    out.insert("platform".into(), scalar(target.get("platform")));
    out.insert(
        "machine".into(),
        json!({
            "name": scalar(target.get("name")),
            "os": scalar(target.get("os")),
            "difficulty": scalar(target.get("difficulty")),
        }),
    );
    out.insert("recording".into(), scalar(report.get("recording")));
    out.insert("phase".into(), scalar(report.get("phase")));
    out.insert("tier".into(), scalar(report.get("tier")));
    // flags: user-captured state; keep only scalar entries (no nested blobs).
    let flags: Map<String, Value> = report
        .get("flags")
        .and_then(Value::as_object)
        .map(|m| {
            m.iter()
                .filter(|(k, _)| {
                    let k = k.to_lowercase();
                    !(k.contains("writeup") || k.contains("write_up") || k.contains("golden"))
                })
                .filter(|(_, v)| matches!(v, Value::String(_) | Value::Number(_) | Value::Bool(_)))
                .map(|(k, v)| (k.clone(), v.clone()))
                .collect()
        })
        .unwrap_or_default();
    out.insert("flags".into(), Value::Object(flags));
    out.insert("steps".into(), Value::Array(steps));
    Value::Object(out)
}

/// Newest parseable `*.json` in `dir` with `recording == true`; else the newest
/// parseable one; else None. Unparseable files are skipped.
pub fn find_active(dir: &Path) -> Option<ActiveSession> {
    let mut found: Vec<(std::time::SystemTime, ActiveSession)> = std::fs::read_dir(dir)
        .ok()?
        .filter_map(|e| e.ok())
        .filter_map(|e| {
            let path = e.path();
            if path.extension().and_then(|x| x.to_str()) != Some("json") {
                return None;
            }
            let modified = e.metadata().ok()?.modified().ok()?;
            let value: Value = serde_json::from_str(&std::fs::read_to_string(&path).ok()?).ok()?;
            Some((modified, ActiveSession { path, value }))
        })
        .collect();
    found.sort_by(|a, b| b.0.cmp(&a.0));
    let pos = found
        .iter()
        .position(|(_, s)| s.value["recording"] == true)
        .unwrap_or(0);
    if found.is_empty() {
        return None;
    }
    Some(found.swap_remove(pos).1)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn full() -> serde_json::Value {
        json!({
            "session": { "uuid": "u1", "target": { "platform": "htb", "name": "Demo", "os": "Linux", "difficulty": "Easy" } },
            "recording": true,
            "episodes": [{ "seq": 1, "cmd": "nmap -sV 10.0.0.1", "output_digest": "x".repeat(400) }],
            "golden_dag": [{ "objective": "access_root", "satisfied_by": ["secrettool"] }],
            "hint_golden": { "source": "0xdf", "golden": [{ "objective": "access_root" }] },
            "writeup_text": "the full answer",
            "flags": {}
        })
    }

    #[test]
    fn sanitize_strips_the_answer() {
        let s = sanitize(&full());
        let dump = serde_json::to_string(&s).unwrap();
        assert!(!dump.contains("golden_dag"));
        assert!(!dump.contains("hint_golden"));
        assert!(!dump.contains("secrettool"));
        assert!(!dump.contains("the full answer"));
        assert!(!dump.contains("access_root"));
    }

    #[test]
    fn sanitize_keeps_the_session_and_truncates_output() {
        let s = sanitize(&full());
        assert_eq!(s["uuid"], "u1");
        assert_eq!(s["platform"], "htb");
        assert_eq!(s["steps"][0]["cmd"], "nmap -sV 10.0.0.1");
        assert!(s["steps"][0]["output"].as_str().unwrap().len() <= 180);
    }

    #[test]
    fn sanitize_unknown_and_writeup_keys_never_leak() {
        let mut r = full();
        r["write_up"] = json!("SECRETWU");
        r["future_key"] = json!("FUTUREVAL");
        r["session"]["target"]["writeup_url"] = json!("SECRETURL");
        r["episodes"][0]["golden_hint"] = json!("EPLEAK");
        let dump = serde_json::to_string(&sanitize(&r)).unwrap();
        for bad in ["SECRETWU", "FUTUREVAL", "SECRETURL", "EPLEAK", "writeup", "write_up"] {
            assert!(!dump.contains(bad), "{bad}");
        }
    }

    #[test]
    fn truncation_is_char_safe() {
        let mut r = full();
        r["episodes"][0]["output_digest"] = json!("é".repeat(300));
        let s = sanitize(&r);
        assert_eq!(s["steps"][0]["output"].as_str().unwrap().chars().count(), 180);
    }

    #[test]
    fn find_active_prefers_recording_and_skips_garbage() {
        let d = std::env::temp_dir().join(format!("owlsh-sani-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        std::fs::write(d.join("a.json"), r#"{"recording":true,"session":{"uuid":"rec"}}"#).unwrap();
        std::thread::sleep(std::time::Duration::from_millis(30));
        std::fs::write(d.join("b.json"), r#"{"recording":false,"session":{"uuid":"new"}}"#).unwrap();
        std::thread::sleep(std::time::Duration::from_millis(30));
        std::fs::write(d.join("c.json"), "not json").unwrap();
        let a = find_active(&d).unwrap();
        assert_eq!(a.value["session"]["uuid"], "rec");
        std::fs::remove_file(d.join("a.json")).unwrap();
        assert_eq!(find_active(&d).unwrap().value["session"]["uuid"], "new");
        std::fs::remove_file(d.join("b.json")).unwrap();
        assert!(find_active(&d).is_none());
        let _ = std::fs::remove_dir_all(&d);
    }

    #[test]
    fn flags_skip_golden_and_writeup_keys() {
        let mut r = full();
        r["flags"] = json!({ "golden_hint": "the answer", "writeup_note": "x", "Write_Up2": "y", "found_user_flag": true });
        let s = sanitize(&r);
        let dump = serde_json::to_string(&s).unwrap();
        assert_eq!(s["flags"]["found_user_flag"], true);
        assert!(!dump.contains("golden_hint"));
        assert!(!dump.contains("writeup_note"));
        assert!(!dump.contains("Write_Up2"));
        assert!(!dump.contains("the answer"));
    }
}
