// soundgarden — the thin Tauri shell.
//
// The app's only coupling to the game is the `audio` CLI. These commands are the
// single place the app runs it; the web UI calls them via `invoke` and never
// spawns processes or knows the CLI's argument shape.
//
// Finding the binary: `AUDIO_BIN` env var if set, else `audio` on PATH.

#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

mod secrets;

use std::process::Command;

fn audio_bin() -> String {
    std::env::var("AUDIO_BIN").unwrap_or_else(|_| "audio".to_string())
}

fn run_audio(args: &[&str]) -> Result<String, String> {
    let output = Command::new(audio_bin())
        .args(args)
        .output()
        .map_err(|e| format!("could not run `audio` (set AUDIO_BIN or add it to PATH): {e}"))?;
    let stdout = String::from_utf8_lossy(&output.stdout).into_owned();
    let stderr = String::from_utf8_lossy(&output.stderr).into_owned();
    if output.status.success() {
        if stdout.trim().is_empty() {
            Ok(stderr)
        } else {
            Ok(stdout)
        }
    } else {
        let mut msg = stderr;
        if !stdout.trim().is_empty() {
            msg.push_str(&stdout);
        }
        if msg.trim().is_empty() {
            msg = format!("`audio` exited with {}", output.status);
        }
        Err(msg)
    }
}

fn temp_path(ext: &str) -> std::path::PathBuf {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    std::env::temp_dir().join(format!("soundgarden-{nanos}.{ext}"))
}

#[tauri::command]
fn audio_validate(path: String) -> Result<String, String> {
    // Prefer machine-readable findings for the UI ribbon.
    run_audio(&["validate", &path, "--json"])
}

#[tauri::command]
fn audio_schema(kind: String) -> Result<String, String> {
    run_audio(&["schema", "--kind", &kind])
}

#[tauri::command]
fn audio_assets() -> Result<String, String> {
    run_audio(&["assets"])
}

#[tauri::command]
fn audio_scan(dir: Option<String>) -> Result<String, String> {
    match dir {
        Some(d) => run_audio(&["scan", "--dir", &d]),
        None => run_audio(&["scan"]),
    }
}

/// Load a manifest (.toml/.json) as a JSON string (the editor's in-memory form),
/// via `audio convert` so it uses the same validated, lossless path the game trusts.
#[tauri::command]
fn load_manifest(path: String) -> Result<String, String> {
    let tmp = temp_path("json");
    let tmp_str = tmp.to_string_lossy().into_owned();
    run_audio(&["convert", &path, &tmp_str])?;
    let json = std::fs::read_to_string(&tmp).map_err(|e| format!("read converted manifest: {e}"));
    let _ = std::fs::remove_file(&tmp);
    json
}

/// Save an editor manifest (JSON string) to `path` (.toml converts for the game).
#[tauri::command]
fn save_manifest(path: String, json: String) -> Result<String, String> {
    let tmp = temp_path("json");
    let tmp_str = tmp.to_string_lossy().into_owned();
    std::fs::write(&tmp, &json).map_err(|e| format!("stage manifest: {e}"))?;
    let result = run_audio(&["convert", &tmp_str, &path]);
    let _ = std::fs::remove_file(&tmp);
    result.map(|_| format!("saved {path}"))
}

/// Export to the game: validate first, then write. Refuses to write an invalid
/// manifest, so the editor can never break the running game.
#[tauri::command]
fn export_manifest(path: String, json: String) -> Result<String, String> {
    let tmp = temp_path("json");
    let tmp_str = tmp.to_string_lossy().into_owned();
    std::fs::write(&tmp, &json).map_err(|e| format!("stage manifest for export: {e}"))?;
    // validate exits non-zero (-> Err) on errors.
    if let Err(findings) = run_audio(&["validate", &tmp_str]) {
        let _ = std::fs::remove_file(&tmp);
        return Err(format!("Not exported — the manifest has problems:\n{findings}"));
    }
    let result = run_audio(&["convert", &tmp_str, &path]);
    let _ = std::fs::remove_file(&tmp);
    result.map(|_| format!("Exported to the game: {path}"))
}

#[tauri::command]
fn llm_available() -> bool {
    secrets::gemini_key().is_some()
}

/// Ask Gemini for structured help. `task` names the assist kind (e.g.
/// "categorize", "voice_profile"); `context` is a JSON string the UI builds. The
/// returned string is the model's text — expected to be JSON the UI parses. The
/// key never leaves this process.
#[tauri::command]
async fn llm_suggest(task: String, context: String) -> Result<String, String> {
    let key = secrets::gemini_key().ok_or(
        "No Gemini key found. Add one to the OS keychain, set GEMINI_API_KEY, or create secrets.toml.",
    )?;

    let prompt = format!(
        "You are an audio-manifest assistant for a game. Task: {task}.\n\
         Respond with ONLY compact JSON, no prose. Context:\n{context}"
    );
    let body = serde_json::json!({
        "contents": [{ "parts": [{ "text": prompt }] }]
    });
    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={key}"
    );

    let client = reqwest::Client::new();
    let resp = client
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Gemini request failed: {e}"))?;
    let status = resp.status();
    let text = resp
        .text()
        .await
        .map_err(|e| format!("read Gemini response: {e}"))?;
    if !status.is_success() {
        // Do not echo the URL (it carries the key); report status + body only.
        return Err(format!("Gemini returned {status}: {text}"));
    }
    // Extract the model text from the response envelope.
    let v: serde_json::Value =
        serde_json::from_str(&text).map_err(|e| format!("parse Gemini JSON: {e}"))?;
    let out = v["candidates"][0]["content"]["parts"][0]["text"]
        .as_str()
        .unwrap_or("")
        .to_string();
    Ok(out)
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            audio_validate,
            audio_schema,
            audio_assets,
            audio_scan,
            load_manifest,
            save_manifest,
            export_manifest,
            llm_available,
            llm_suggest,
        ])
        .run(tauri::generate_context!())
        .expect("error while running soundgarden");
}
