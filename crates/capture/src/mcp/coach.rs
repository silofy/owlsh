//! `coach` tool: instruction block for the client's model + honest pull recording.

use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde_json::{json, Value};

use super::rules::COACHING_RULES;
use super::sanitize::{sanitize, ActiveSession};

fn directness(tier: u8) -> &'static str {
    match tier {
        1 => "kind \"process\": a nudge about how they are working, grounded only in their own output. Name no tool or service they have not already used.",
        2 => "kind \"area\": which service or phase deserves attention. No technique.",
        _ => "kind \"technique\": the general class of technique to consider, described in plain words.",
    }
}

/// Instruction block plus the SANITIZED session (never the raw report).
pub fn coach_payload(active: &ActiveSession, tier: u8) -> Value {
    let tier = tier.clamp(1, 3);
    json!({
        "instructions": format!("{}\nThis hint is tier {} - {}", COACHING_RULES, tier, directness(tier)),
        "session": sanitize(&active.value),
    })
}

fn hints_path(path: &Path) -> PathBuf {
    let mut s = path.as_os_str().to_owned();
    s.push(".hints");
    PathBuf::from(s)
}

fn read_pulls(path: &Path) -> Vec<Value> {
    std::fs::read_to_string(hints_path(path))
        .ok()
        .and_then(|t| serde_json::from_str::<Value>(&t).ok())
        .and_then(|v| match v {
            Value::Array(a) => Some(a),
            _ => None,
        })
        .unwrap_or_default()
}

/// Mirrors the widget's nextTier: min(3, max existing tier + 1), 1 when no pulls.
pub fn next_tier(path: &Path) -> u8 {
    read_pulls(path)
        .iter()
        .filter_map(|p| p.get("tier").and_then(Value::as_u64))
        .max()
        .map(|m| (m + 1).min(3) as u8)
        .unwrap_or(1)
}

/// Append `{ tier, atMs, phase, source: "mcp" }` to `<path>.hints`.
pub fn record_pull(path: &Path, tier: u8, phase: &str) -> std::io::Result<()> {
    let mut pulls = read_pulls(path);
    let at_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    pulls.push(json!({ "tier": tier, "atMs": at_ms, "phase": phase, "source": "mcp" }));
    let text = serde_json::to_string_pretty(&pulls).map_err(std::io::Error::other)?;
    std::fs::write(hints_path(path), text)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn full() -> Value {
        json!({
            "phase": "Discovery",
            "golden_dag": [{ "objective": "access_root" }],
            "hint_golden": { "golden": "the full answer" },
            "episodes": []
        })
    }

    fn tmp(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("owlsh-mcp-{}-{}", name, std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn coach_payload_carries_rules_and_the_sanitized_session_only() {
        let active = ActiveSession { path: "/x/s.json".into(), value: full() };
        let p = coach_payload(&active, 2);
        let dump = serde_json::to_string(&p).unwrap();
        assert!(dump.contains("coach, not a solver"));
        assert!(dump.contains("tier 2"));
        assert!(!dump.contains("golden_dag"));
        assert!(!dump.contains("the full answer"));
    }

    #[test]
    fn record_pull_appends_one_mcp_pull() {
        let dir = tmp("pull");
        let rep = dir.join("s.json");
        std::fs::write(&rep, "{}").unwrap();
        record_pull(&rep, 1, "Discovery").unwrap();
        record_pull(&rep, 2, "Discovery").unwrap();
        let pulls: Value = serde_json::from_str(&std::fs::read_to_string(dir.join("s.json.hints")).unwrap()).unwrap();
        assert_eq!(pulls.as_array().unwrap().len(), 2);
        assert_eq!(pulls[0]["source"], "mcp");
        assert_eq!(pulls[1]["tier"], 2);
        assert!(pulls[0]["atMs"].as_u64().unwrap() > 0);
    }

    #[test]
    fn record_pull_tolerates_a_non_array_sidecar() {
        let dir = tmp("bad");
        let rep = dir.join("s.json");
        std::fs::write(dir.join("s.json.hints"), "{\"oops\":1}").unwrap();
        record_pull(&rep, 1, "unknown").unwrap();
        let pulls: Value = serde_json::from_str(&std::fs::read_to_string(dir.join("s.json.hints")).unwrap()).unwrap();
        assert_eq!(pulls.as_array().unwrap().len(), 1);
    }

    #[test]
    fn next_tier_escalates_and_caps_at_three() {
        let dir = tmp("next");
        let rep = dir.join("s.json");
        assert_eq!(next_tier(&rep), 1);
        record_pull(&rep, 1, "x").unwrap();
        assert_eq!(next_tier(&rep), 2);
        record_pull(&rep, 3, "x").unwrap();
        assert_eq!(next_tier(&rep), 3);
    }
}
