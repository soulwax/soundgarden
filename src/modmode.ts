// Mod-authoring mode orchestration: overlay path resolution for a mod's
// per-kind manifest layer. Pure helper — no DOM, kept alongside overlay.ts's
// pure merge/mutator logic so main.ts's mode-switching stays thin.

import type { ManifestKind } from "./doc";

/** Directory name for a kind's additive overlay layer, matching the game's
 *  `Assets/Data/<kind>.d/` mod convention (see CLAUDE.md asset-pack rule). */
function overlayDir(kind: ManifestKind): string {
  if (kind === "sfx") return "sfx.d";
  if (kind === "music") return "music.d";
  return "voices.d";
}

/** Path to a mod's overlay manifest for a given kind, e.g.
 *  `Mods/my-pack/Assets/Data/sfx.d/my-pack.toml`. */
export function overlayPath(kind: ManifestKind, id: string): string {
  return `Mods/${id}/Assets/Data/${overlayDir(kind)}/${id}.toml`;
}

/** The wire array key for a fresh, empty overlay doc of this kind. */
export function wireKey(kind: ManifestKind): string {
  if (kind === "sfx") return "sfx";
  if (kind === "music") return "track";
  return "voice";
}
