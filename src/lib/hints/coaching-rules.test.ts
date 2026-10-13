import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { COACHING_RULES } from "./coaching-rules";

describe("coaching rules parity", () => {
  it("the Rust server embeds the exact same rule text", () => {
    const rust = readFileSync(new URL("../../../crates/capture/src/mcp/rules.rs", import.meta.url), "utf8");
    const m = rust.match(/r#"([\s\S]*?)"#/);
    expect(m, "rules.rs must hold an r#\"...\"# literal").not.toBeNull();
    const norm = (t: string) => t.replace(/\r\n/g, "\n").trim();
    expect(norm(m![1])).toBe(norm(COACHING_RULES));
  });
});
