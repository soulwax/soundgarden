# soundgarden

> A *sound garden* is a place where sounds are planted, tended, and grown.
> This is the audio studio for **EchoWarrior** — a desktop app for browsing,
> auditioning, and wiring the game's sounds, music, and dialogue voices, then
> exporting the manifests the game plays verbatim.

soundgarden is a **Tauri + web** app, built parallel to
[Leitmotif](https://github.com/soulwax/Leitmotif) (the scene-director). It
authors the game's *audio manifests* and never touches game code — the game's
own data model stays the single source of truth. The app talks to the game only
through one shipped artifact:

- **`audio` CLI** — `validate | convert | schema | assets | scan` (in the
  EchoWarrior repo, `src/bin/audio.rs`). Manifest parsing, validation, and the
  JSON Schema all live next to the game's serde structs
  (`SfxDef` / `TrackDef` / `VoiceDef`), so soundgarden can never drift from
  what the game actually reads.

See the design spec in the game repo:
`Docs/superpowers/specs/2026-07-02-soundgarden-audio-studio-design.md`.

## What it does (Phase 1 — the manifest studio)

- **Open** `sfx.toml` / `music.toml` / `voices.toml` through the `audio convert`
  lossless TOML↔JSON path (top-level `schema` headers survive the round-trip).
- **Browse + edit** entries in a library/inspector layout; every mutation routes
  through the `AudioDoc` document model (single owner of edit state, dirty
  tracking, undo/redo with `Ctrl+Z` / `Ctrl+Y`).
- **Unregistered clips**: `audio scan` lists audio files on disk that no
  manifest references; one click registers a clip with a suggested
  `<pack>-<filename>` kebab-case id.
- **Validation ribbon**: findings from `audio validate --json` render as a
  green/amber/red chip.
- **Export to game**: validates first and refuses to write an invalid manifest,
  so the editor can never break the running game.
- **Gemini assist (optional)**: with a key configured, "✦ Sort unregistered"
  asks Gemini to propose ids/categories for unregistered clips; proposals are
  apply/discard rows that commit through the same undoable edit seam. With no
  key, the button is absent and everything else works fully.

## The Gemini key (never in git)

The key is resolved at runtime, in order:

1. **OS keychain** (recommended): service `soundgarden`, account
   `GEMINI_API_KEY`.
2. Env var `GEMINI_API_KEY`.
3. Gitignored fallback: `%APPDATA%/soundgarden/secrets.toml` (XDG config dir on
   Linux) containing `GEMINI_API_KEY = "..."`.

The key is never committed, logged, printed, bundled, or sent to the web UI —
only the Tauri process reads it, and only to call the Gemini REST endpoint.

## Build & run

```bash
# 1. Build the game's audio CLI (from the EchoWarrior repo root):
cargo build --bin audio

# 2. Run soundgarden in dev mode (from tools/soundgarden):
npm install
AUDIO_BIN=../../target/debug/audio npm run tauri:dev
```

On Windows/VS Code, the shipped `.vscode/tasks.json` wires all of this up —
"soundgarden: dev (debug)" builds the `audio` CLI and launches the app with
`AUDIO_BIN` set.

```bash
npm test            # vitest (id + AudioDoc units)
npx tsc --noEmit    # type gate
npm run build       # frontend production build
npm run tauri:build # NSIS Windows installer
```

## Status (roadmap S0–S14, Phase 1 = S0–S8)

- **S0 (done):** `Serialize` + `JsonSchema` on the game's audio structs; schema
  headers preserved through round-trips.
- **S1 (done):** `audio convert` + `schema` (kind detected from the real
  top-level key, never a substring).
- **S2 (done):** `audio assets` + `scan`.
- **S3 (done):** `audio validate` (human report + `--json` findings).
- **S4 (done):** Tauri + Vite + TS shell scaffolded from Leitmotif;
  `AUDIO_BIN` env; placeholder icon.
- **S5 (done):** pure logic — `suggestId`/`isKebab` and the `AudioDoc`
  undo/redo document model, both unit-tested.
- **S6 (done):** the bridge — `validate/schema/assets/scan/load/save/export`
  Tauri commands + typed TS wrappers; export = validate-then-write.
- **S7 (done):** the manifest studio UI — library, inspector, save/export
  ribbon, unregistered-clips panel, validation chip.
- **S8 (done):** Gemini tier — key resolution (keychain → env → secrets.toml),
  `llm_suggest`, and the proposal panel.
- **S9 (open):** studio identity pass (dark-fantasy skin, real icon).
- **S10 (open):** NSIS packaging polish + installer signing.
- **S11+ (open):** waveform previews, voice-profile tuning aids, Phase 2
  procedural synthesis (own spec).

## Status — Phase 1.5 (mod authoring + audition)

- **Engine overlays via new `audio` CLI subcommands (done):** the game-side
  `audio` CLI grew `mods` (list installed mod ids), `effective --kind <kind>
  [--mod <id>]` (merged base+overlay view with per-entry `"origin"` tags),
  `init-mod <id> --name <name>` (scaffold a `Mods/<id>/mod.toml`), and overlay
  awareness in `validate` (`--mod-root`) and `scan --mod`. Overlay files add or
  override entries and can `remove = [...]` vanilla ids by string id.
- **Mod authoring mode (done):** the studio adds a mod switcher (vanilla ↔
  installed mods), provenance badges (vanilla / mod / overlay) on every row,
  copy-on-write edits — editing a vanilla row while a mod is active forks it
  into that mod's overlay instead of touching the vanilla manifest — hide /
  restore of vanilla entries through the overlay's `remove` list, and
  overlay-file export to `Mods/<id>/Assets/Data/<kind>.d/<id>.toml` (one
  overlay file per mod per kind; hand-authored extras in the same directory
  stay read-only to the studio).
- **Audition playback (done):** a shared per-row ▶ control plays clips
  in-studio through the new `read_clip` bridge command, so a modder can hear a
  cue before exporting it.
- **`GAME_ROOT` cwd fix (done):** the Tauri bridge resolves the game repo root
  explicitly instead of trusting the process working directory, so commands
  run correctly regardless of how the app was launched.
