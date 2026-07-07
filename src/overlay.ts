// Pure mod-overlay logic: the effective view (base + overlay with provenance)
// and the copy-on-write mutators. No DOM, no bridge — fully unit-testable.
// Mutators are written to run inside AudioDoc.edit(), so undo/redo and dirty
// tracking cover mod authoring exactly like vanilla editing.

import type { Manifest } from "./doc";

export type Origin = "vanilla" | "mod" | "override";

export interface EffectiveRow {
  entry: Record<string, unknown>;
  origin: Origin;
  /** true when the overlay's remove list hides this vanilla entry */
  hidden: boolean;
}

/** Base entries in base order (overridden in place), then mod additions —
 *  the same shape the engine's merge produces, plus provenance. Removed
 *  vanilla entries stay visible as hidden rows so the author can undo. */
export function computeEffective(
  base: Array<Record<string, unknown>>,
  overlay: Manifest,
): EffectiveRow[] {
  const overlayById = new Map<string, Record<string, unknown>>();
  for (const e of overlay.entries as unknown as Array<Record<string, unknown>>) {
    overlayById.set(String(e.id), e);
  }
  const removed = new Set(overlay.remove);
  const rows: EffectiveRow[] = [];
  const baseIds = new Set<string>();
  for (const entry of base) {
    const id = String(entry.id);
    baseIds.add(id);
    const shadow = overlayById.get(id);
    rows.push({
      entry: shadow ?? entry,
      origin: shadow ? "override" : "vanilla",
      hidden: removed.has(id) && !shadow,
    });
  }
  for (const e of overlay.entries as unknown as Array<Record<string, unknown>>) {
    if (!baseIds.has(String(e.id))) {
      rows.push({ entry: e, origin: "mod", hidden: false });
    }
  }
  return rows;
}

/** Copy-on-write: copy `entry` into the overlay (or reuse its existing copy)
 *  and apply `patch`. An override supersedes a `remove` entry (the engine's
 *  merge applies remove first, then upsert), so editing a hidden vanilla row
 *  also clears its stale remove entry — otherwise it would linger forever
 *  with no way to see or clear it once the row is visibly un-hidden. */
export function forkEntry(
  m: Manifest,
  entry: Record<string, unknown>,
  patch: Record<string, unknown>,
): void {
  const entries = m.entries as unknown as Array<Record<string, unknown>>;
  const id = String(entry.id);
  const existing = entries.find((e) => String(e.id) === id);
  if (existing) {
    Object.assign(existing, patch);
  } else {
    entries.push({ ...entry, ...patch });
  }
  unhideEntry(m, id);
}

export function hideEntry(m: Manifest, id: string): void {
  if (!m.remove.includes(id)) m.remove.push(id);
}

export function unhideEntry(m: Manifest, id: string): void {
  const i = m.remove.indexOf(id);
  if (i >= 0) m.remove.splice(i, 1);
}
