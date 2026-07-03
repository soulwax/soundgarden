// soundgarden — the thin Tauri shell.
//
// The app's coupling to the game is the `audio` CLI. The single `ping` command
// here proves the bridge; real commands (validate/convert/schema/assets/scan and
// llm_suggest) are added in later tasks.

#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

#[tauri::command]
fn ping() -> String {
    "soundgarden bridge alive".to_string()
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![ping])
        .run(tauri::generate_context!())
        .expect("error while running soundgarden");
}
