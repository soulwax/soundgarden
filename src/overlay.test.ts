import { describe, it, expect } from "vitest";
import { computeEffective, forkEntry, hideEntry, unhideEntry } from "./overlay";
import type { Manifest } from "./doc";

const base = [
  { id: "a", asset: "A.ogg", category: "x", duration: 1 },
  { id: "b", asset: "B.ogg", category: "x", duration: 1 },
];

function overlay(entries: object[] = [], remove: string[] = []): Manifest {
  return { kind: "sfx", entries: entries as never, remove };
}

describe("computeEffective", () => {
  it("tags vanilla, override, and mod rows", () => {
    const rows = computeEffective(base, overlay([
      { id: "b", asset: "B2.ogg", category: "y", duration: 2 },
      { id: "m", asset: "M.ogg", category: "y", duration: 1 },
    ]));
    expect(rows.map((r) => [r.entry.id, r.origin])).toEqual([
      ["a", "vanilla"],
      ["b", "override"],
      ["m", "mod"],
    ]);
  });
  it("marks removed vanilla ids hidden instead of dropping them", () => {
    const rows = computeEffective(base, overlay([], ["a"]));
    expect(rows[0]).toMatchObject({ origin: "vanilla", hidden: true });
    expect(rows[1].hidden).toBe(false);
  });
});

describe("mutators (run inside doc.edit)", () => {
  it("forkEntry copies a vanilla entry into the overlay with a patch", () => {
    const m = overlay();
    forkEntry(m, base[0], { category: "impact" });
    expect(m.entries).toEqual([{ id: "a", asset: "A.ogg", category: "impact", duration: 1 }]);
    // Forking again patches the existing overlay copy, no duplicate.
    forkEntry(m, base[0], { duration: 9 });
    expect(m.entries.length).toBe(1);
    expect((m.entries[0] as { duration: number }).duration).toBe(9);
  });
  it("hideEntry / unhideEntry manage the remove list without duplicates", () => {
    const m = overlay();
    hideEntry(m, "a");
    hideEntry(m, "a");
    expect(m.remove).toEqual(["a"]);
    unhideEntry(m, "a");
    expect(m.remove).toEqual([]);
  });
});
