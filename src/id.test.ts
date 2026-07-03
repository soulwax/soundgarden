import { describe, it, expect } from "vitest";
import { suggestId, isKebab } from "./id";

describe("suggestId", () => {
  it("derives <pack>-<filename> kebab-case from a path", () => {
    expect(suggestId("Audio/Kenneys/Casino Audio/Audio/card-fan-1.ogg", "casino")).toBe(
      "casino-card-fan-1",
    );
  });
  it("lowercases and hyphenates spaces and underscores", () => {
    expect(suggestId("Audio/Foo/My Cool_Sound.wav", "foo")).toBe("foo-my-cool-sound");
  });
  it("infers a pack from the first Audio subfolder when none is given", () => {
    expect(suggestId("Audio/GSSounds/Hit.wav")).toBe("gssounds-hit");
  });
  it("strips the extension", () => {
    expect(suggestId("Audio/Bar/beep.ogg", "bar").endsWith(".ogg")).toBe(false);
  });
});

describe("isKebab", () => {
  it("accepts kebab", () => expect(isKebab("casino-card-fan-1")).toBe(true));
  it("rejects caps and spaces", () => {
    expect(isKebab("Casino Card")).toBe(false);
    expect(isKebab("casino_card")).toBe(false);
  });
});
