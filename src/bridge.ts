// Typed wrappers over the Tauri bridge commands (src-tauri/src/main.rs).
// The app talks to the game ONLY through the `audio` CLI. When running web-only
// (no Tauri), calls report a friendly message instead of crashing.

type Invoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

async function getInvoke(): Promise<Invoke | null> {
  try {
    const mod = await import("@tauri-apps/api/core");
    return mod.invoke as Invoke;
  } catch {
    return null;
  }
}

export interface BridgeResult {
  ok: boolean;
  output: string;
}

async function call(cmd: string, args: Record<string, unknown>): Promise<BridgeResult> {
  const invoke = await getInvoke();
  if (!invoke) {
    return {
      ok: false,
      output:
        "Not running inside Tauri — bridge commands need the desktop shell.\n" +
        "Run `npm run tauri:dev` (with the audio binary on PATH or AUDIO_BIN set).",
    };
  }
  try {
    return { ok: true, output: await invoke<string>(cmd, args) };
  } catch (e) {
    return { ok: false, output: String(e) };
  }
}

/** Validate a manifest; returns a JSON findings array (as a string). */
export function validate(path: string): Promise<BridgeResult> {
  return call("audio_validate", { path });
}
/** JSON Schema for a manifest kind (drives inspector forms). */
export function schema(kind: "sfx" | "music" | "voices"): Promise<BridgeResult> {
  return call("audio_schema", { kind });
}
/** Known ids + categories + durations (JSON) for the pickers. */
export function assets(): Promise<BridgeResult> {
  return call("audio_assets", {});
}
/** Audio files on disk not in any manifest (JSON array). */
export function scan(dir?: string, modId?: string): Promise<BridgeResult> {
  return call("audio_scan", { dir: dir ?? null, modId: modId ?? null });
}
/** Installed mods (id/name/version/description) as JSON. */
export function mods(): Promise<BridgeResult> {
  return call("audio_mods", {});
}
/** Effective (merged) manifest with origin tags; modId scopes to one mod. */
export function effective(kind: "sfx" | "music" | "voices", modId?: string): Promise<BridgeResult> {
  return call("audio_effective", { kind, modId: modId ?? null });
}
/** Scaffold a new mod (kebab-case id). */
export function initMod(id: string, name?: string): Promise<BridgeResult> {
  return call("audio_init_mod", { id, name: name ?? null });
}
/** Audio clip bytes as base64 for audition. */
export function readClip(path: string, modId?: string): Promise<BridgeResult> {
  return call("read_clip", { path, modId: modId ?? null });
}
/** Load a manifest file as a JSON string (editor in-memory form). */
export function loadManifest(path: string, kind?: string): Promise<BridgeResult> {
  return call("load_manifest", { path, kind: kind ?? null });
}
/** Save an editor manifest (JSON string) to `path` (.toml converts). */
export function saveManifest(path: string, json: string, kind?: string): Promise<BridgeResult> {
  return call("save_manifest", { path, json, kind: kind ?? null });
}
/** Export to the game: validates first, refuses invalid. */
export function exportManifest(
  path: string,
  json: string,
  kind?: string,
  modRoot?: string,
): Promise<BridgeResult> {
  return call("export_manifest", { path, json, kind: kind ?? null, modRoot: modRoot ?? null });
}

/** Whether a Gemini key is configured (keychain / env / secrets.toml). */
export async function llmAvailable(): Promise<boolean> {
  const invoke = await getInvoke();
  if (!invoke) return false;
  try {
    return await invoke<boolean>("llm_available");
  } catch {
    return false;
  }
}
/** Ask Gemini for structured help; returns the model's (JSON) text. */
export function llmSuggest(task: string, context: string): Promise<BridgeResult> {
  return call("llm_suggest", { task, context });
}

const FILTERS = [{ name: "Audio manifest", extensions: ["toml", "json"] }];

export async function openManifestDialog(): Promise<string | null> {
  try {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const picked = await open({ multiple: false, filters: FILTERS });
    return typeof picked === "string" ? picked : null;
  } catch {
    return null;
  }
}
export async function saveManifestDialog(defaultPath?: string): Promise<string | null> {
  try {
    const { save } = await import("@tauri-apps/plugin-dialog");
    return (await save({ filters: FILTERS, defaultPath })) ?? null;
  } catch {
    return null;
  }
}
