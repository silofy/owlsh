import { describe, it, expect } from "vitest";
import { shouldPromptConnect } from "./connect-cta";

describe("shouldPromptConnect", () => {
  it("prompts for rules mode", () => { expect(shouldPromptConnect("rules", false, false)).toBe(true); });
  it("prompts for local when Ollama is unreachable", () => { expect(shouldPromptConnect("local", false, false)).toBe(true); });
  it("does not prompt for local when Ollama is reachable", () => { expect(shouldPromptConnect("local", true, false)).toBe(false); });
  it("prompts for a cloud mode with no key", () => { expect(shouldPromptConnect("anthropic", false, false)).toBe(true); });
  it("does not prompt for a cloud mode with a key", () => { expect(shouldPromptConnect("anthropic", false, true)).toBe(false); });
});
