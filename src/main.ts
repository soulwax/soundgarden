import { AudioDoc, type ManifestKind } from "./doc";
import * as bridge from "./bridge";
import { suggestId } from "./id";

const app = document.querySelector<HTMLDivElement>("#app")!;
let doc: AudioDoc | null = null;
let openPath: string | null = null;
let selected = 0;

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

  app.innerHTML = `
    <header class="ribbon">
      <h1>soundgarden</h1>
      <button id="open">Open…</button>
      <button id="save" ${doc.dirty ? "" : "disabled"}>Save</button>
      <button id="export" class="gold">Export to game</button>
      <button id="undo" ${doc.canUndo ? "" : "disabled"}>↶</button>
      <button id="redo" ${doc.canRedo ? "" : "disabled"}>↷</button>
      <span id="status">${doc.kind} — ${entries.length} entries${doc.dirty ? " • unsaved" : ""}</span>
    </header>
    <main class="cols">
      <section class="library"><ul id="list">${rows}</ul></section>
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
  document.querySelectorAll<HTMLInputElement>("#form [data-key]").forEach((input) =>
    input.addEventListener("change", () => onField(input)),
  );
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
  render();
}

async function onSave(): Promise<void> {
  if (!doc || !openPath) return;
  const res = await bridge.saveManifest(openPath, doc.toJson());
  if (res.ok) doc.markSaved();
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

// `suggestId` is used by the unregistered-clips flow (Task 10); referenced here
// so the import is live and the module tree is complete.
void suggestId;

render();
