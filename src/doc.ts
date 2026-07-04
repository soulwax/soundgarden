// AudioDoc — the sole owner of edit state, dirty tracking, and undo/redo.
// Every mutation (manual or AI-applied) routes through `edit()`, so history and
// validation cover both uniformly. Mirrors leitmotif's SceneDoc.

export type ManifestKind = "sfx" | "music" | "voices";

export interface SfxEntry {
  id: string;
  asset: string;
  category: string;
  duration: number;
}
export interface TrackEntry {
  id: string;
  asset: string;
  loop: boolean;
  duration: number;
}
export interface VoiceEntry {
  id: string;
  speaker: string;
  profile: string;
  enabled: boolean;
  pitch: number;
  muffle: number;
  roughness: number;
  talk_speed: number;
  volume: number;
}

export type Manifest =
  | { kind: "sfx"; entries: SfxEntry[]; remove: string[] }
  | { kind: "music"; entries: TrackEntry[]; remove: string[] }
  | { kind: "voices"; entries: VoiceEntry[]; remove: string[] };

// The wire shape uses the game's array keys: sfx / track / voice.
const WIRE_KEY: Record<ManifestKind, string> = {
  sfx: "sfx",
  music: "track",
  voices: "voice",
};

function fromWire(kind: ManifestKind, json: string): { manifest: Manifest; extras: Record<string, unknown> } {
  const obj = JSON.parse(json) as Record<string, unknown>;
  const key = WIRE_KEY[kind];
  // Keep every top-level key that is not the entries array (e.g. the
  // schema / schema_version headers mod_check reads) so a load → save
  // round-trip through the editor is lossless.
  const remove = Array.isArray(obj.remove) ? (obj.remove as string[]) : [];
  const extras: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k !== key && k !== "remove") extras[k] = v;
  }
  const entries = (obj[key] ?? []) as never[];
  return { manifest: { kind, entries, remove } as Manifest, extras };
}

function toWire(m: Manifest, extras: Record<string, unknown>): string {
  const doc: Record<string, unknown> = { ...extras };
  if (m.remove.length > 0) doc.remove = m.remove;
  doc[WIRE_KEY[m.kind]] = m.entries;
  return JSON.stringify(doc, null, 2);
}

function clone(m: Manifest): Manifest {
  return JSON.parse(JSON.stringify(m)) as Manifest;
}

export class AudioDoc {
  private current: Manifest;
  private past: Manifest[] = [];
  private future: Manifest[] = [];
  private savedSnapshot: string;
  private readonly extras: Record<string, unknown>;

  private constructor(m: Manifest, extras: Record<string, unknown>) {
    this.current = m;
    this.extras = extras;
    this.savedSnapshot = toWire(m, extras);
  }

  static fromJson(kind: ManifestKind, json: string): AudioDoc {
    const { manifest, extras } = fromWire(kind, json);
    return new AudioDoc(manifest, extras);
  }

  get kind(): ManifestKind {
    return this.current.kind;
  }
  get entries(): Manifest["entries"] {
    return this.current.entries;
  }
  get remove(): string[] {
    return this.current.remove;
  }
  get manifest(): Manifest {
    return this.current;
  }
  get dirty(): boolean {
    return toWire(this.current, this.extras) !== this.savedSnapshot;
  }
  get canUndo(): boolean {
    return this.past.length > 0;
  }
  get canRedo(): boolean {
    return this.future.length > 0;
  }

  /** The single mutation seam. Records history, then applies the mutator to a
   *  fresh copy. Both manual edits and applied AI proposals go through here. */
  edit(mutator: (m: Manifest) => void): void {
    this.past.push(clone(this.current));
    this.future = [];
    const next = clone(this.current);
    mutator(next);
    this.current = next;
  }

  undo(): void {
    const prev = this.past.pop();
    if (!prev) return;
    this.future.push(this.current);
    this.current = prev;
  }

  redo(): void {
    const next = this.future.pop();
    if (!next) return;
    this.past.push(this.current);
    this.current = next;
  }

  toJson(): string {
    return toWire(this.current, this.extras);
  }

  markSaved(): void {
    this.savedSnapshot = toWire(this.current, this.extras);
  }
}
