import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { COACHING_RULES } from "./coaching-rules";

describe("coaching rules parity", () => {
  it("the Rust server embeds the exact same rule text", () => {
    const rust = readFileSync("crates/capture/src/mcp/rules.rs", "utf8");
    const m = rust.match(/r#"([\s\S]*?)"#/);
    expect(m, "rules.rs must hold an r#\"...\"# literal").not.toBeNull();
    expect(m![1].trim()).toBe(COACHING_RULES.trim());
  });
});
