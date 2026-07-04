import { describe, it, expect } from "vitest";
import { AudioDoc, type SfxEntry } from "./doc";

const SFX_JSON = JSON.stringify({
  sfx: [
    { id: "a-one", asset: "Audio/A/one.ogg", category: "rpg", duration: 0.5 },
    { id: "a-two", asset: "Audio/A/two.ogg", category: "rpg", duration: 0.7 },
  ],
});

describe("AudioDoc", () => {
  it("loads entries from JSON", () => {
    const doc = AudioDoc.fromJson("sfx", SFX_JSON);
    expect(doc.kind).toBe("sfx");
    expect(doc.entries.length).toBe(2);
    expect(doc.dirty).toBe(false);
  });

  it("edit() mutates, marks dirty, and is undoable", () => {
    const doc = AudioDoc.fromJson("sfx", SFX_JSON);
    doc.edit((m) => {
      if (m.kind === "sfx") m.entries[0].category = "impact";
    });
    expect((doc.entries[0] as SfxEntry).category).toBe("impact");
    expect(doc.dirty).toBe(true);
    expect(doc.canUndo).toBe(true);

    doc.undo();
    expect((doc.entries[0] as SfxEntry).category).toBe("rpg");
    expect(doc.canRedo).toBe(true);

    doc.redo();
    expect((doc.entries[0] as SfxEntry).category).toBe("impact");
  });

  it("toJson() round-trips the manifest shape", () => {
    const doc = AudioDoc.fromJson("sfx", SFX_JSON);
    const out = JSON.parse(doc.toJson());
    expect(out.sfx.length).toBe(2);
    expect(out.sfx[0].id).toBe("a-one");
  });

  it("markSaved() clears the dirty flag", () => {
    const doc = AudioDoc.fromJson("sfx", SFX_JSON);
    doc.edit((m) => {
      if (m.kind === "sfx")
        m.entries.push({ id: "a-three", asset: "Audio/A/three.ogg", category: "rpg", duration: 0.2 });
    });
    expect(doc.dirty).toBe(true);
    doc.markSaved();
    expect(doc.dirty).toBe(false);
  });

  it("preserves the music loop key through JSON", () => {
    const doc = AudioDoc.fromJson(
      "music",
      JSON.stringify({ track: [{ id: "m-one", asset: "Audio/M/one.ogg", loop: true, duration: 4.0 }] }),
    );
    const out = JSON.parse(doc.toJson());
    expect(out.track[0].loop).toBe(true);
  });

  it("preserves top-level schema headers through the round-trip", () => {
    const doc = AudioDoc.fromJson(
      "sfx",
      JSON.stringify({ schema: 1, schema_version: "1.0.0", sfx: [] }),
    );
    const out = JSON.parse(doc.toJson());
    expect(out.schema).toBe(1);
    expect(out.schema_version).toBe("1.0.0");
  });

  it("reads and round-trips a remove list, undoably", () => {
    const doc = AudioDoc.fromJson("sfx", JSON.stringify({ remove: ["a-one"], sfx: [] }));
    expect(doc.remove).toEqual(["a-one"]);
    doc.edit((m) => m.remove.push("a-two"));
    expect(doc.remove).toEqual(["a-one", "a-two"]);
    doc.undo();
    expect(doc.remove).toEqual(["a-one"]);
    const out = JSON.parse(doc.toJson());
    expect(out.remove).toEqual(["a-one"]);
  });

  it("omits an empty remove list from the wire shape", () => {
    const doc = AudioDoc.fromJson("sfx", SFX_JSON);
    expect(JSON.parse(doc.toJson()).remove).toBeUndefined();
  });
});
