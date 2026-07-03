// Deriving manifest ids from asset paths, matching the game's
// `<pack>-<filename>` kebab-case convention (see Assets/Data/sfx.toml).

function kebab(s: string): string {
  return s
    .trim()
    .replace(/[_\s]+/g, "-")
    .replace(/[^a-zA-Z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

/** A kebab-case `<pack>-<filename>` id from an asset path. When `pack` is
 *  omitted, infer it from the first folder under `Audio/`. */
export function suggestId(assetPath: string, pack?: string): string {
  const parts = assetPath.replace(/\\/g, "/").split("/").filter(Boolean);
  const file = parts[parts.length - 1] ?? "";
  const stem = file.replace(/\.[^.]+$/, "");

  let inferredPack = pack;
  if (!inferredPack) {
    const audioIdx = parts.findIndex((p) => p.toLowerCase() === "audio");
    inferredPack = audioIdx >= 0 && parts[audioIdx + 1] ? parts[audioIdx + 1] : "";
  }
  const packK = kebab(inferredPack ?? "");
  const stemK = kebab(stem);
  return packK ? `${packK}-${stemK}` : stemK;
}

export function isKebab(id: string): boolean {
  return id.length > 0 && /^[a-z0-9-]+$/.test(id);
}
