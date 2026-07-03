import { AudioDoc, type ManifestKind } from "./doc";
import * as bridge from "./bridge";
import { suggestId } from "./id";

const app = document.querySelector<HTMLDivElement>("#app")!;
let doc: AudioDoc | null = null;
let openPath: string | null = null;
let selected = 0;
let unregistered: Array<{ path: string; ext: string }> = [];
let findings: Array<{ level: string; message: string }> = [];

/** Refresh the on-disk clips not present in any manifest (sfx/music only). */
async function refreshScan(): Promise<void> {
  if (!doc || doc.kind === "voices") {
    unregistered = [];
    return;
  }
  const res = await bridge.scan();
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

function render(): void {
  if (!doc) {
    app.innerHTML = `
      <header class="ribbon"><h1>soundgarden</h1>
        <button id="open">Open manifest…</button>
        <span id="status">Open sfx.toml / music.toml / voices.toml to begin.</span>
      </header>`;
    document.querySelector("#open")!.addEventListener("click", onOpen);
    return;
  }
  const entries = doc.entries as unknown as Array<Record<string, unknown>>;
  const rows = entries
    .map((e, i) => `<li class="${i === selected ? "sel" : ""}" data-i="${i}">${String(e.id)}</li>`)
    .join("");
  const entry = entries[selected] ?? {};
  const fields = Object.keys(entry)
    .map((k) => fieldInput(k, (entry as Record<string, unknown>)[k]))
    .join("");
  const unreg = unregistered
    .map((u, i) => `<li class="unreg" data-u="${i}">＋ ${u.path}</li>`)
    .join("");
  const unregSection =
    doc.kind === "voices" ? "" : `<h3>Unregistered</h3><ul id="unreg-list">${unreg}</ul>`;

  const errs = findings.filter((f) => f.level === "error").length;
  const warns = findings.filter((f) => f.level === "warning").length;
  const ribbonClass = errs > 0 ? "bad" : warns > 0 ? "warn" : "good";

  app.innerHTML = `
    <header class="ribbon">
      <h1>soundgarden</h1>
      <button id="open">Open…</button>
      <button id="save" ${doc.dirty ? "" : "disabled"}>Save</button>
      <button id="export" class="gold">Export to game</button>
      <button id="undo" ${doc.canUndo ? "" : "disabled"}>↶</button>
      <button id="redo" ${doc.canRedo ? "" : "disabled"}>↷</button>
      <span class="valid ${ribbonClass}">${errs}✕ ${warns}⚠</span>
      <span id="status">${doc.kind} — ${entries.length} entries${doc.dirty ? " • unsaved" : ""}</span>
    </header>
    <main class="cols">
      <section class="library"><ul id="list">${rows}</ul>${unregSection}</section>
      <section class="inspector"><form id="form">${fields}</form></section>
    </main>`;

  document.querySelector("#open")!.addEventListener("click", onOpen);
  document.querySelector("#save")!.addEventListener("click", onSave);
  document.querySelector("#export")!.addEventListener("click", onExport);
  document.querySelector("#undo")!.addEventListener("click", () => { doc!.undo(); render(); });
  document.querySelector("#redo")!.addEventListener("click", () => { doc!.redo(); render(); });
  document.querySelectorAll("#list li").forEach((li) =>
    li.addEventListener("click", () => {
      selected = Number((li as HTMLElement).dataset.i);
      render();
    }),
  );
  document.querySelectorAll("#unreg-list li").forEach((li) =>
    li.addEventListener("click", () => addUnregistered(Number((li as HTMLElement).dataset.u))),
  );
  document.querySelectorAll<HTMLInputElement>("#form [data-key]").forEach((input) =>
    input.addEventListener("change", () => onField(input)),
  );
}

/** Register an on-disk clip into the open manifest with a suggested kebab id. */
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
  selected = doc.entries.length - 1;
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
  doc.edit((m) => {
    (m.entries[selected] as unknown as Record<string, unknown>)[key] = raw;
  });
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
  selected = 0;
  await refreshScan();
  await refreshValidation();
  render();
}

async function onSave(): Promise<void> {
  if (!doc || !openPath) return;
  const res = await bridge.saveManifest(openPath, doc.toJson());
  if (res.ok) doc.markSaved();
  await refreshValidation();
  setStatus(res.output);
  render();
}

async function onExport(): Promise<void> {
  if (!doc || !openPath) return;
  const res = await bridge.exportManifest(openPath, doc.toJson());
  setStatus(res.output);
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

render();
