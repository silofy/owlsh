import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readPulls, appendPull } from "./append-pull";
import type { HintPull } from "./hints";

const pull = (atMs: number): HintPull => ({ atMs, tier: 1 }) as unknown as HintPull;
const tmp = () => join(mkdtempSync(join(tmpdir(), "owlsh-")), "s.json.hints");

describe("appendPull", () => {
  it("creates the file when missing", () => {
    const f = tmp();
    expect(readPulls(f)).toEqual([]);
    appendPull(f, pull(1));
    expect(JSON.parse(readFileSync(f, "utf8"))).toEqual([pull(1)]);
  });
  it("keeps pulls another surface recorded meanwhile", () => {
    const f = tmp();
    appendPull(f, pull(1));
    writeFileSync(f, JSON.stringify([pull(1), pull(2)])); // desktop widget appended
    appendPull(f, pull(3));
    expect(readPulls(f).map((p) => p.atMs)).toEqual([1, 2, 3]);
  });
  it("tolerates a malformed file", () => {
    const f = tmp();
    writeFileSync(f, "{oops");
    expect(readPulls(f)).toEqual([]);
    appendPull(f, pull(5));
    expect(readPulls(f)).toHaveLength(1);
  });
});
