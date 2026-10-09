import { describe, it, expect } from "vitest";
import { NONE } from "./golden-source";

describe("NONE sentinel", () => {
  it("is frozen so a shared miss can't be mutated", () => {
    expect(Object.isFrozen(NONE)).toBe(true);
    expect(Object.isFrozen(NONE.golden)).toBe(true);
  });
});
