import { describe, it, expect, beforeEach } from "vitest";
import { useReport } from "../src/store/report";

describe("setupJump", () => {
  beforeEach(() => useReport.getState().setSetupJump(null));
  it("defaults to null and round-trips", () => {
    expect(useReport.getState().setupJump).toBeNull();
    useReport.getState().setSetupJump("connector");
    expect(useReport.getState().setupJump).toBe("connector");
    useReport.getState().setSetupJump(null);
    expect(useReport.getState().setupJump).toBeNull();
  });
});
