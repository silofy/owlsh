// owlsh desktop shell. A thin window around the React report, plus commands the webview
// invokes — here, managing the offline LLM (Ollama) sidecar (brief §5.1).

mod cloud;
mod htb;
mod llm;
mod net;
mod pwnbox;
mod secrets;
mod sessions;

/// Open (or focus) the floating live-widget window: small, frameless, always on top, so it can sit
/// beside a terminal while you work. It renders the same widget view, routed by `?widget=1`.
#[tauri::command]
fn open_widget(app: tauri::AppHandle) -> Result<(), String> {
    use tauri::Manager;
    if let Some(w) = app.get_webview_window("widget") {
        let _ = w.show();
        let _ = w.set_focus();
        return Ok(());
    }
    tauri::WebviewWindowBuilder::new(&app, "widget", tauri::WebviewUrl::App("index.html?widget=1".into()))
        .title("owlsh — widget")
        .inner_size(360.0, 330.0)
        .min_inner_size(300.0, 240.0)
        .always_on_top(true)
        .decorations(false)
        .resizable(true)
        .build()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
/// One-time move of the pre-rename data folder `~/.watcher` → `~/.owlsh` (same as owlsh_core's).
fn migrate_legacy_home() {
    let Some(home) = std::env::var_os("USERPROFILE").or_else(|| std::env::var_os("HOME")) else { return };
    let home = std::path::PathBuf::from(home);
    let (old, new) = (home.join(".watcher"), home.join(".owlsh"));
    if old.is_dir() && !new.exists() {
        let _ = std::fs::rename(&old, &new);
    }
}

pub fn run() {
    migrate_legacy_home();
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            llm::ollama_status,
            llm::start_ollama,
            llm::pull_model,
            sessions::list_sessions,
            sessions::latest_session,
            sessions::record_hint,
            open_widget,
            sessions::list_ssh_logs,
            net::fetch_writeup,
            net::open_url,
            htb::set_htb_token,
            htb::has_htb_token,
            htb::clear_htb_token,
            htb::fetch_htb_writeup,
            secrets::set_api_key,
            secrets::has_api_key,
            secrets::clear_api_key,
            cloud::cloud_generate,
            pwnbox::pull_pwnbox
        ])
        .run(tauri::generate_context!())
        .expect("error while running owlsh");
}
