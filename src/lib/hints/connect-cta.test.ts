import { describe, it, expect } from "vitest";
import { shouldPromptConnect, connectCta } from "./connect-cta";

describe("shouldPromptConnect", () => {
  it("prompts for rules mode", () => { expect(shouldPromptConnect("rules", false, false)).toBe(true); });
  it("prompts for local when Ollama is unreachable", () => { expect(shouldPromptConnect("local", false, false)).toBe(true); });
  it("does not prompt for local when Ollama is reachable", () => { expect(shouldPromptConnect("local", true, false)).toBe(false); });
  it("prompts for a cloud mode with no key", () => { expect(shouldPromptConnect("anthropic", false, false)).toBe(true); });
  it("does not prompt for a cloud mode with a key", () => { expect(shouldPromptConnect("anthropic", false, true)).toBe(false); });
});

describe("connectCta", () => {
  const off = { ollamaReachable: false, hasKey: false, planConnected: false };

  it("offers in-widget generation (none) when local Ollama is reachable", () => {
    expect(connectCta("local", { ...off, ollamaReachable: true })).toBe("none");
  });
  it("offers in-widget generation (none) when a cloud key is set", () => {
    expect(connectCta("anthropic", { ...off, hasKey: true })).toBe("none");
  });
  it("prompts to connect when local is picked but Ollama is down", () => {
    expect(connectCta("local", off)).toBe("connect");
  });
  it("routes a connected plan to coach-elsewhere, never an in-widget hint", () => {
    expect(connectCta("plan", { ...off, planConnected: true })).toBe("coach-elsewhere");
  });
  it("prompts to connect when plan is picked but the MCP server isn't registered yet", () => {
    expect(connectCta("plan", off)).toBe("connect");
  });
});
