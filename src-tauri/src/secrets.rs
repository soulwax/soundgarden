// Gemini key resolution — the ONLY place a key is read. Order:
//   1. OS keychain (recommended, encrypted at rest): service "soundgarden",
//      account "GEMINI_API_KEY".
//   2. Env var GEMINI_API_KEY.
//   3. Gitignored fallback: <app-data>/soundgarden/secrets.toml with
//      `GEMINI_API_KEY = "..."`.
// The key is never logged, printed, or returned to the web UI.

use std::path::PathBuf;

const SERVICE: &str = "soundgarden";
const ACCOUNT: &str = "GEMINI_API_KEY";

pub fn gemini_key() -> Option<String> {
    if let Ok(entry) = keyring::Entry::new(SERVICE, ACCOUNT) {
        if let Ok(secret) = entry.get_password() {
            if !secret.trim().is_empty() {
                return Some(secret);
            }
        }
    }
    if let Ok(env) = std::env::var("GEMINI_API_KEY") {
        if !env.trim().is_empty() {
            return Some(env);
        }
    }
    read_secrets_toml()
}

fn secrets_path() -> Option<PathBuf> {
    // %APPDATA%/soundgarden on Windows; XDG/App-Support equivalents elsewhere.
    let base = dirs_next_config()?;
    Some(base.join("soundgarden").join("secrets.toml"))
}

/// Minimal per-platform config dir without pulling a crate: use env vars.
fn dirs_next_config() -> Option<PathBuf> {
    if let Ok(appdata) = std::env::var("APPDATA") {
        return Some(PathBuf::from(appdata));
    }
    if let Ok(xdg) = std::env::var("XDG_CONFIG_HOME") {
        return Some(PathBuf::from(xdg));
    }
    if let Ok(home) = std::env::var("HOME") {
        return Some(PathBuf::from(home).join(".config"));
    }
    None
}

fn read_secrets_toml() -> Option<String> {
    let path = secrets_path()?;
    let text = std::fs::read_to_string(&path).ok()?;
    // Parse only the one key we need; ignore everything else.
    for line in text.lines() {
        let line = line.trim();
        if let Some(rest) = line.strip_prefix("GEMINI_API_KEY") {
            if let Some(eq) = rest.trim_start().strip_prefix('=') {
                let val = eq.trim().trim_matches('"').trim();
                if !val.is_empty() {
                    return Some(val.to_string());
                }
            }
        }
    }
    None
}
