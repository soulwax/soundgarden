import { AudioDoc, type ManifestKind } from "./doc";
import * as bridge from "./bridge";
import { suggestId } from "./id";
import { computeEffective, forkEntry, hideEntry, unhideEntry } from "./overlay";
import { overlayPath, wireKey } from "./modmode";

const app = document.querySelector<HTMLDivElement>("#app")!;
let doc: AudioDoc | null = null;
let openPath: string | null = null;
let selected = 0;
let unregistered: Array<{ path: string; ext: string }> = [];
let findings: Array<{ level: string; message: string }> = [];
let aiEnabled = false;
let knownCategories: string[] = [];

// Mod-authoring mode: null modId is Vanilla; a non-null modId means `doc` IS
// the mod's overlay manifest, and `baseEntries` holds the vanilla effective
// view rendered behind it (see computeEffective in overlay.ts).
let modId: string | null = null;
let modList: Array<{ id: string; name: string }> = [];
let baseEntries: Array<Record<string, unknown>> | null = null;

// Audition playback: shared audio element and current playing URL for cleanup.
const player = new Audio();
let playingUrl: string | null = null;

const CLIP_MIME: Record<string, string> = {
  ogg: "audio/ogg", wav: "audio/wav", mp3: "audio/mpeg", flac: "audio/flac",
};

type Proposal = { path: string; id: string; category?: string; loop?: boolean };
let proposals: Proposal[] = [];

/** Play a clip from an asset path, managing the shared audio element and Blob URL. */
async function playClip(assetPath: string): Promise<void> {
  const res = await bridge.readClip(assetPath, modId ?? undefined);
  if (!res.ok) return setStatus(res.output);
  const ext = assetPath.split(".").pop()?.toLowerCase() ?? "";
  const bytes = Uint8Array.from(atob(res.output), (c) => c.charCodeAt(0));
  if (playingUrl) URL.revokeObjectURL(playingUrl);
  playingUrl = URL.createObjectURL(new Blob([bytes], { type: CLIP_MIME[ext] ?? "audio/ogg" }));
  player.src = playingUrl;
  player.play().catch(() => setStatus(`Cannot play .${ext} — codec not available in the webview.`));
}

/** Refresh the on-disk clips not present in any manifest (sfx/music only). */
async function refreshScan(): Promise<void> {
  if (!doc || doc.kind === "voices") {
    unregistered = [];
    return;
  }
  const res = await bridge.scan(undefined, modId ?? undefined);
  unregistered = res.ok ? (JSON.parse(res.output) as Array<{ path: string; ext: string }>) : [];
}

/** Live validation reflects the last saved state — a deliberate, simple
 *  contract; the export button always does a fresh validate-then-write. */
async function refreshValidation(): Promise<void> {
  if (!doc || !openPath) {
    findings = [];
    return;
  }
  const res = await bridge.validate(openPath);
  try {
    findings = JSON.parse(res.output) as Array<{ level: string; message: string }>;
  } catch {
    findings = [];
  }
}

function kindFromPath(path: string): ManifestKind {
  const p = path.toLowerCase();
  if (p.includes("voice")) return "voices";
  if (p.includes("music") || p.includes("track")) return "music";
  return "sfx";
}

/** Get the asset path for a library entry, or empty string if voices (no play button). */
function assetOf(entry: Record<string, unknown>): string {
  const asset = entry.asset;
  return typeof asset === "string" ? asset : "";
}

/** Options for the ribbon mod selector: Vanilla, each installed mod, then a
 *  trailing "New mod…" action entry. Shared by both render branches. */
function modOptions(): string {
  return [
    `<option value="">Vanilla</option>`,
    ...modList.map(
      (m) => `<option value="${m.id}" ${m.id === modId ? "selected" : ""}>${m.name || m.id}</option>`,
    ),
    `<option value="__new__">New mod…</option>`,
  ].join("");
}

function wireModSelect(): void {
  document.querySelector<HTMLSelectElement>("#mod-select")?.addEventListener("change", (e) => {
    const value = (e.target as HTMLSelectElement).value;
    if (value === "__new__") {
      void onNewMod();
      return;
    }
    void switchMod(value === "" ? null : value);
  });
}

function render(): void {
  if (!doc) {
    app.innerHTML = `
      <header class="ribbon"><h1>soundgarden</h1>
        <button id="open">Open manifest…</button>
        <label>Mod<select id="mod-select">${modOptions()}</select></label>
        <span id="status">Open sfx.toml / music.toml / voices.toml to begin.</span>
      </header>`;
    document.querySelector("#open")!.addEventListener("click", onOpen);
    wireModSelect();
    return;
  }
  const inModMode = Boolean(modId && baseEntries);
  const effectiveRows = inModMode ? computeEffective(baseEntries!, doc.manifest) : null;
  const entries = doc.entries as unknown as Array<Record<string, unknown>>;
  const rows = effectiveRows
    ? effectiveRows
        .map((r, i) => {
          const badge = r.origin === "vanilla" ? "" : `<span class="badge ${r.origin}">${r.origin}</span>`;
          const cls = [i === selected ? "sel" : "", r.hidden ? "hidden-row" : ""].join(" ").trim();
          const asset = assetOf(r.entry as Record<string, unknown>);
          const playBtn = asset ? `<button class="play" data-play="${asset}">▶</button>` : "";
          return `<li class="${cls}" data-i="${i}">${playBtn} ${String(r.entry.id)} ${badge}</li>`;
        })
        .join("")
    : entries
        .map((e, i) => {
          const asset = assetOf(e);
          const playBtn = asset ? `<button class="play" data-play="${asset}">▶</button>` : "";
          return `<li class="${i === selected ? "sel" : ""}" data-i="${i}">${playBtn} ${String(e.id)}</li>`;
        })
        .join("");
  const selectedRow = effectiveRows ? effectiveRows[selected] : null;
  const entry = (selectedRow ? selectedRow.entry : entries[selected]) ?? {};
  const fields = Object.keys(entry)
    .map((k) => fieldInput(k, (entry as Record<string, unknown>)[k]))
    .join("");
  // The engine's merge applies `remove` FIRST and then upserts overlay
  // entries, so an id that is both removed and overridden by the overlay is
  // still present in-game — hiding an "override" row would be a silent
  // no-op. Only offer "Hide from mod" for untouched vanilla rows.
  const hideRestoreButton = selectedRow
    ? selectedRow.hidden
      ? `<button id="restore-entry" type="button">Restore</button>`
      : selectedRow.origin === "vanilla"
        ? `<button id="hide-entry" type="button">Hide from mod</button>`
        : ""
    : "";
  const unreg = unregistered
    .map((u, i) => `<li class="unreg" data-u="${i}"><button class="play" data-play="${u.path}">▶</button> ${u.path}</li>`)
    .join("");
  const unregSection =
    doc.kind === "voices" ? "" : `<h3>Unregistered</h3><ul id="unreg-list">${unreg}</ul>`;

  const errs = findings.filter((f) => f.level === "error").length;
  const warns = findings.filter((f) => f.level === "warning").length;
  const ribbonClass = errs > 0 ? "bad" : warns > 0 ? "warn" : "good";

  const propRows = proposals
    .map(
      (p, i) =>
        `<li><code>${p.id}</code> ← ${p.path} <em>${p.category ?? ""}</em>
         <button data-apply="${i}">apply</button><button data-discard="${i}">✕</button></li>`,
    )
    .join("");
  const proposalPanel =
    proposals.length > 0
      ? `<div class="proposals"><h3>Gemini suggestions</h3><ul>${propRows}</ul></div>`
      : "";

  app.innerHTML = `
    <header class="ribbon">
      <h1>soundgarden</h1>
      <button id="open">Open…</button>
      <label>Mod<select id="mod-select">${modOptions()}</select></label>
      <button id="save" ${doc.dirty ? "" : "disabled"}>Save</button>
      <button id="export" class="gold">Export to game</button>
      <button id="undo" ${doc.canUndo ? "" : "disabled"}>↶</button>
      <button id="redo" ${doc.canRedo ? "" : "disabled"}>↷</button>
      ${aiEnabled && doc.kind !== "voices" ? '<button id="ai-sort">✦ Sort unregistered</button>' : ""}
      <span class="valid ${ribbonClass}">${errs}✕ ${warns}⚠</span>
      <span id="status">${doc.kind} — ${entries.length} entries${doc.dirty ? " • unsaved" : ""}</span>
    </header>
    <main class="cols">
      <section class="library"><ul id="list">${rows}</ul>${unregSection}</section>
      <section class="inspector">${proposalPanel}<form id="form">${fields}</form>${hideRestoreButton}</section>
    </main>`;

  document.querySelector("#open")!.addEventListener("click", onOpen);
  wireModSelect();
  document.querySelector("#save")!.addEventListener("click", onSave);
  document.querySelector("#export")!.addEventListener("click", onExport);
  document.querySelector("#undo")!.addEventListener("click", () => { doc!.undo(); render(); });
  document.querySelector("#redo")!.addEventListener("click", () => { doc!.redo(); render(); });
  document.querySelectorAll<HTMLButtonElement>("[data-play]").forEach((btn) =>
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      void playClip(btn.dataset.play!);
    }),
  );
  document.querySelectorAll("#list li").forEach((li) =>
    li.addEventListener("click", () => {
      selected = Number((li as HTMLElement).dataset.i);
      render();
    }),
  );
  document.querySelectorAll("#unreg-list li").forEach((li) =>
    li.addEventListener("click", () => addUnregistered(Number((li as HTMLElement).dataset.u))),
  );
  document.querySelector("#ai-sort")?.addEventListener("click", () => void onAiSort());
  document.querySelectorAll<HTMLButtonElement>(".proposals [data-apply]").forEach((btn) =>
    btn.addEventListener("click", () => applyProposal(Number(btn.dataset.apply))),
  );
  document.querySelectorAll<HTMLButtonElement>(".proposals [data-discard]").forEach((btn) =>
    btn.addEventListener("click", () => {
      proposals.splice(Number(btn.dataset.discard), 1);
      render();
    }),
  );
  document.querySelectorAll<HTMLInputElement>("#form [data-key]").forEach((input) =>
    input.addEventListener("change", () => onField(input)),
  );
  document.querySelector("#hide-entry")?.addEventListener("click", () => {
    if (!doc || !selectedRow) return;
    const id = String(selectedRow.entry.id);
    doc.edit((m) => hideEntry(m, id));
    render();
  });
  document.querySelector("#restore-entry")?.addEventListener("click", () => {
    if (!doc || !selectedRow) return;
    const id = String(selectedRow.entry.id);
    doc.edit((m) => unhideEntry(m, id));
    render();
  });
}

/** Send the unregistered clips to Gemini; parsed proposals render as
 *  apply / discard rows. Applying routes through `doc.edit` (undoable). */
async function onAiSort(): Promise<void> {
  if (!doc || unregistered.length === 0) return;
  setStatus("Asking Gemini…");
  const context = JSON.stringify({
    kind: doc.kind,
    clips: unregistered.map((u) => u.path),
    known_categories: knownCategories,
  });
  const res = await bridge.llmSuggest("categorize_clips", context);
  if (!res.ok) return setStatus(res.output);
  try {
    proposals = JSON.parse(res.output) as Proposal[];
  } catch {
    proposals = [];
    return setStatus("Gemini returned something I couldn't parse — try again.");
  }
  render();
}

function applyProposal(i: number): void {
  if (!doc) return;
  const p = proposals[i];
  if (!p) return;
  doc.edit((m) => {
    if (m.kind === "sfx") {
      m.entries.push({ id: p.id, asset: p.path, category: p.category ?? "uncategorized", duration: 0 });
    } else if (m.kind === "music") {
      m.entries.push({ id: p.id, asset: p.path, loop: p.loop ?? false, duration: 0 });
    }
  });
  const u = unregistered.findIndex((x) => x.path === p.path);
  if (u >= 0) unregistered.splice(u, 1);
  proposals.splice(i, 1);
  render();
}

/** Register an on-disk clip into the open manifest with a suggested kebab id.
 *  In mod mode `doc` IS the overlay, so this pushes straight into it; the
 *  effective view then shows the new row with a "mod" badge. */
function addUnregistered(i: number): void {
  if (!doc) return;
  const clip = unregistered[i];
  if (!clip) return;
  const id = suggestId(clip.path);
  doc.edit((m) => {
    if (m.kind === "sfx") {
      m.entries.push({ id, asset: clip.path, category: "uncategorized", duration: 0 });
    } else if (m.kind === "music") {
      m.entries.push({ id, asset: clip.path, loop: false, duration: 0 });
    }
  });
  unregistered.splice(i, 1);
  if (modId && baseEntries) {
    const rows = computeEffective(baseEntries, doc.manifest);
    const idx = rows.findIndex((r) => String(r.entry.id) === id);
    selected = idx >= 0 ? idx : rows.length - 1;
  } else {
    selected = doc.entries.length - 1;
  }
  render();
}

function fieldInput(key: string, value: unknown): string {
  if (typeof value === "boolean") {
    return `<label>${key}<input type="checkbox" data-key="${key}" ${value ? "checked" : ""}/></label>`;
  }
  const type = typeof value === "number" ? "number" : "text";
  const step = type === "number" ? ' step="0.01"' : "";
  return `<label>${key}<input type="${type}"${step} data-key="${key}" value="${String(value)}"/></label>`;
}

function onField(input: HTMLInputElement): void {
  if (!doc) return;
  const key = input.dataset.key!;
  const raw: unknown =
    input.type === "checkbox" ? input.checked : input.type === "number" ? Number(input.value) : input.value;
  if (modId && baseEntries) {
    const row = computeEffective(baseEntries, doc.manifest)[selected];
    if (!row) return;
    doc.edit((m) => forkEntry(m, row.entry, { [key]: raw }));
  } else {
    doc.edit((m) => {
      (m.entries[selected] as unknown as Record<string, unknown>)[key] = raw;
    });
  }
  render();
}

/** Shared post-load setup: AI availability, known categories, scan + validate.
 *  Used by both the dialog-based `onOpen` and mod-mode's vanilla reload. */
async function afterDocLoaded(): Promise<void> {
  selected = 0;
  proposals = [];
  aiEnabled = await bridge.llmAvailable();
  const known = await bridge.assets();
  if (known.ok) {
    try {
      knownCategories = (JSON.parse(known.output) as { categories?: string[] }).categories ?? [];
    } catch {
      knownCategories = [];
    }
  }
  await refreshScan();
  await refreshValidation();
}

/** Load the vanilla manifest for `kind` from its canonical path — the same
 *  load `onOpen` performs, extracted so mode-switching back to Vanilla can
 *  reuse it without a file dialog. */
async function openVanilla(kind: ManifestKind): Promise<void> {
  const path = `Assets/Data/${kind}.toml`;
  const res = await bridge.loadManifest(path, kind);
  if (!res.ok) return setStatus(res.output);
  doc = AudioDoc.fromJson(kind, res.output);
  openPath = path;
  await afterDocLoaded();
  render();
}

async function onOpen(): Promise<void> {
  const path = await bridge.openManifestDialog();
  if (!path) return;
  const kind = kindFromPath(path);
  const res = await bridge.loadManifest(path);
  if (!res.ok) return setStatus(res.output);
  doc = AudioDoc.fromJson(kind, res.output);
  openPath = path;
  await afterDocLoaded();
  if (modId) {
    // A manifest of a different kind was opened via dialog while mod mode was
    // active — re-apply the mod context (overlay + base) to this new kind.
    await switchMod(modId);
    return;
  }
  render();
}

async function onSave(): Promise<void> {
  if (!doc || !openPath) return;
  const res = await bridge.saveManifest(openPath, doc.toJson(), doc.kind);
  if (res.ok) doc.markSaved();
  await refreshValidation();
  setStatus(res.output);
  render();
}

async function onExport(): Promise<void> {
  if (!doc || !openPath) return;
  const res = await bridge.exportManifest(openPath, doc.toJson(), doc.kind);
  setStatus(res.output);
}

/** Directory-name / wire-key resolution for the overlay path and the empty
 *  fresh-mod document now live in ./modmode (pure, no DOM). */

/** Enter/leave mod-authoring mode for the currently open kind. In mod mode
 *  `doc` becomes the mod's overlay manifest; `baseEntries` is the vanilla
 *  effective view rendered behind it via computeEffective. */
async function switchMod(next: string | null): Promise<void> {
  const previousModId = modId;
  modId = next;
  proposals = [];
  if (!doc) {
    render();
    return;
  }
  const kind = doc.kind;
  if (modId === null) {
    baseEntries = null;
    await openVanilla(kind);
    return;
  }
  const eff = await bridge.effective(kind);
  if (!eff.ok) {
    // Don't fall back to an empty base — that would silently enter a broken
    // mod mode with every vanilla row missing. Abort and keep the previous
    // doc/state untouched.
    modId = previousModId;
    setStatus(eff.output);
    render();
    return;
  }
  baseEntries = JSON.parse(eff.output).entries as Array<Record<string, unknown>>;
  const path = overlayPath(kind, modId);
  const loaded = await bridge.loadManifest(path, kind);
  if (!loaded.ok) {
    // A missing overlay (new mod, nothing authored yet) is expected and
    // should start from a fresh empty doc. A malformed overlay file is not —
    // starting fresh there would let a later Save clobber the real broken
    // file with an empty manifest. The CLI's stable read-error prefix for a
    // missing file is "cannot read '<path>': ..."; anything else (e.g. "is
    // not valid TOML/JSON") is a parse failure and must abort instead.
    if (!loaded.output.includes("cannot read")) {
      modId = previousModId;
      setStatus(loaded.output);
      render();
      return;
    }
  }
  doc = AudioDoc.fromJson(kind, loaded.ok ? loaded.output : JSON.stringify({ [wireKey(kind)]: [] }));
  openPath = path;
  selected = 0;
  await refreshScan();
  await refreshValidation();
  render();
}

async function onNewMod(): Promise<void> {
  const id = window.prompt("New mod id (kebab-case, e.g. my-audio-pack):")?.trim();
  if (!id) {
    render();
    return;
  }
  const res = await bridge.initMod(id);
  if (!res.ok) {
    setStatus(res.output);
    render();
    return;
  }
  const listed = await bridge.mods();
  modList = listed.ok ? JSON.parse(listed.output) : modList;
  await switchMod(id);
}

function setStatus(msg: string): void {
  const el = document.querySelector("#status");
  if (el) el.textContent = msg;
}

window.addEventListener("keydown", (e) => {
  if (!doc) return;
  if (e.ctrlKey && e.key.toLowerCase() === "z") { doc.undo(); render(); e.preventDefault(); }
  if (e.ctrlKey && e.key.toLowerCase() === "y") { doc.redo(); render(); e.preventDefault(); }
});

async function init(): Promise<void> {
  const res = await bridge.mods();
  modList = res.ok ? JSON.parse(res.output) : [];
  render();
}

void init();
