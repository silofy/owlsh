import { describe, it, expect } from "vitest";
import { migrateLegacyKeys } from "./migrateStorage";

/** Minimal in-memory Storage — the unit tests run in node, without a DOM. */
function memStorage(init: Record<string, string> = {}): Storage {
  const m = new Map(Object.entries(init));
  return {
    get length() { return m.size; },
    key: (i: number) => [...m.keys()][i] ?? null,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
  };
}

describe("migrateLegacyKeys", () => {
  it("copies watcher.* settings to owlsh.* and drops the old keys", () => {
    const s = memStorage({ "watcher.onboarded": "1", "watcher.widget.size": "large", other: "x" });
    expect(migrateLegacyKeys(s)).toBe(2);
    expect(s.getItem("owlsh.onboarded")).toBe("1");
    expect(s.getItem("owlsh.widget.size")).toBe("large");
    expect(s.getItem("watcher.onboarded")).toBeNull();
    expect(s.getItem("other")).toBe("x");
  });

  it("never overwrites a value already set under the new name", () => {
    const s = memStorage({ "watcher.coachMode": "old", "owlsh.coachMode": "new" });
    migrateLegacyKeys(s);
    expect(s.getItem("owlsh.coachMode")).toBe("new");
  });

  it("is a no-op without storage", () => {
    expect(migrateLegacyKeys(undefined)).toBe(0);
  });
});
