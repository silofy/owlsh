import { describe, expect, it } from "vitest";
import type { Episode, GoldenObjective } from "../../types/report";
import { guard, seenTerms, type GuardCtx } from "./guard";

const GOLDEN: GoldenObjective[] = [
  {
    objective: "widget_portal_access",
    tactic: "initial-access",
    satisfied_by: ["widgettool", "gizmoscan"],
    techniques: ["T1190"],
    user_satisfied_by_seq: null,
  },
  {
    objective: "sprocket_privilege_escalate",
    tactic: "privilege-escalation",
    satisfied_by: ["sprocketctl"],
    user_satisfied_by_seq: 7,
  },
  {
    objective: "gadget_service_enumerate",
    tactic: "discovery",
    satisfied_by: ["gadgetprobe"],
    // undefined counts as unsatisfied
  },
];

const ctx = (over: Partial<GuardCtx> = {}): GuardCtx => ({
  tier: 2,
  golden: null,
  seen: new Set(),
  ...over,
});

const hint = (text: string, kind = "process") => ({ hint: text, kind });

describe("guard: artifacts", () => {
  it.each([
    ["URL", "Have a look at http://portal.example/login before moving on."],
    ["IPv4", "Revisit the host at 192.0.2.10 and slow down."],
    ["hostname with domain suffix", "Spend more time on widgets.example.test today."],
    ["CVE identifier", "Read up on CVE-2099-12345 before continuing."],
    ["multi-segment path", "Look closer at /opt/widget for anything odd."],
    ["flag format", "You already have PLACEHOLDER{not_a_real_flag} in hand."],
    ["long hex", "Compare against 0123456789abcdef0123 when you get there."],
    ["credential phrase", "Remember the password is placeholder for that account."],
    ["mixed-class secret", "Try reusing Xq7Lm2Pz9Wv from earlier."],
    ["tool with option flags", "Run widgettool --deep against the target."],
    ["pipe", "Filter the output with sort | uniq to see the pattern."],
    ["redirect", "Save the listing > notes to compare later."],
    ["subshell", "Wrap it in $(widgettool) and compare."],
    ["inline code", "Consider `widgettool` for the next step."],
  ])("blocks %s", (_cat, text) => {
    expect(guard(hint(text), ctx()).ok).toBe(false);
  });

  it("blocks artifacts even when the token is in seen", () => {
    const seen = new Set(["192.0.2.10", "192", "0.2.10"]);
    expect(guard(hint("Revisit the host at 192.0.2.10 calmly."), ctx({ seen })).ok).toBe(false);
  });
});

describe("guard: pass", () => {
  it("allows a plain process nudge and trims it", () => {
    const r = guard(hint("  Step back and list what you have already learned before trying anything new.  "), ctx());
    expect(r).toEqual({
      ok: true,
      text: "Step back and list what you have already learned before trying anything new.",
      kind: "process",
    });
  });
});

describe("guard: shape", () => {
  it.each([
    ["non-object", "just a string", 2],
    ["null", null, 2],
    ["missing hint", { kind: "process" }, 2],
    ["empty hint", { hint: "   ", kind: "process" }, 2],
    ["bad kind", { hint: "Slow down.", kind: "answer" }, 2],
    ["31 words", { hint: Array(31).fill("word").join(" "), kind: "process" }, 2],
    ["tier 1 with area", { hint: "Look around more.", kind: "area" }, 1],
    ["tier 2 with technique", { hint: "Look around more.", kind: "technique" }, 2],
  ])("rejects %s", (_n, raw, tier) => {
    expect(guard(raw, ctx({ tier: tier as 1 | 2 | 3 })).ok).toBe(false);
  });

  it("allows exactly 30 words", () => {
    expect(guard(hint(Array(30).fill("word").join(" ")), ctx()).ok).toBe(true);
  });

  it("allows technique at tier 3", () => {
    expect(guard(hint("Think about how input reaches the server.", "technique"), ctx({ tier: 3 })).ok).toBe(true);
  });
});

describe("guard: golden", () => {
  it("blocks an unsatisfied objective's tool", () => {
    expect(guard(hint("Maybe gizmoscan would help here."), ctx({ golden: GOLDEN })).ok).toBe(false);
  });
  it("blocks an objective word from an objective with undefined user_satisfied_by_seq", () => {
    expect(guard(hint("Think about the gadget again."), ctx({ golden: GOLDEN })).ok).toBe(false);
  });
  it("passes the same word when it is in seen", () => {
    const seen = new Set(["gizmoscan"]);
    expect(guard(hint("Maybe gizmoscan would help here."), ctx({ golden: GOLDEN, seen })).ok).toBe(true);
  });
  it("passes a word from a satisfied objective", () => {
    expect(guard(hint("Your sprocket work went well."), ctx({ golden: GOLDEN })).ok).toBe(true);
  });
  it("passes a stop-listed generic word", () => {
    expect(guard(hint("Enumerate the service before you try to access anything."), ctx({ golden: GOLDEN })).ok).toBe(true);
  });
  it.each(["Look at the widget-portal again.", "Look at the widget_portal again."])(
    "blocks a golden term inside a compound: %s",
    (text) => {
      expect(guard(hint(text), ctx({ golden: GOLDEN })).ok).toBe(false);
    },
  );
  it("returns ok:false instead of throwing on malformed golden data", () => {
    const bad = [{ objective: 42, satisfied_by: "nope", techniques: 7 }] as unknown as GoldenObjective[];
    expect(() => guard(hint("Slow down and reread your notes."), ctx({ golden: bad, tier: 1 }))).not.toThrow();
    expect(guard(hint("Slow down and reread your notes."), ctx({ golden: bad, tier: 1 })).ok).toBe(false);
  });
  it("is case-insensitive", () => {
    expect(guard(hint("The Portal deserves attention."), ctx({ golden: GOLDEN })).ok).toBe(false);
  });
});

describe("guard: tierOneTools", () => {
  it("blocks a known tool not in seen at tier 1, allows it at tier 2", () => {
    const text = "Consider whether nmap told you everything.";
    expect(guard(hint(text), ctx({ tier: 1 })).ok).toBe(false);
    expect(guard(hint(text), ctx({ tier: 2 })).ok).toBe(true);
  });
  it("blocks a hyphenated known tool at tier 1", () => {
    expect(guard(hint("Try an nmap-style sweep of your notes."), ctx({ tier: 1 })).ok).toBe(false);
  });
  it("allows a known tool at tier 1 when it is in seen", () => {
    expect(guard(hint("Consider whether nmap told you everything."), ctx({ tier: 1, seen: new Set(["nmap"]) })).ok).toBe(true);
  });
  it("blocks a satisfied objective's tool at tier 1", () => {
    expect(guard(hint("Was sprocketctl the right call?"), ctx({ tier: 1, golden: GOLDEN })).ok).toBe(false);
  });
});

describe("guard: property", () => {
  // mulberry32
  function rng(seed: number) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const FILLER = ["take", "a", "moment", "to", "review", "notes", "slowly", "think", "about", "what", "changed", "and", "why", "it", "matters", "now"];
  const TERMS = ["widget", "portal", "widgettool", "gizmoscan", "t1190", "gadget", "gadgetprobe"];

  it("always blocks an embedded unsatisfied golden term unless seen", () => {
    const r = rng(1337);
    const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
    for (let i = 0; i < 200; i++) {
      const n = 3 + Math.floor(r() * 20);
      const words = Array.from({ length: n }, () => pick(FILLER));
      const term = pick(TERMS);
      words.splice(Math.floor(r() * (n + 1)), 0, r() < 0.5 ? term : term.toUpperCase());
      const text = words.join(" ");
      expect(guard(hint(text), ctx({ golden: GOLDEN })).ok, text).toBe(false);
      expect(guard(hint(text), ctx({ golden: GOLDEN, seen: new Set([term]) })).ok, text).toBe(true);
    }
  });
});

describe("seenTerms", () => {
  it("collects lowercase tokens from cmd and output_digest of every episode", () => {
    const eps = [
      { cmd: "WidgetTool -x 192.0.2.5", output_digest: "Port open: widget-svc" },
      { cmd: "gizmoscan run_all", output_digest: "found config.bak ok" },
    ] as unknown as Episode[];
    const s = seenTerms(eps);
    for (const t of ["widgettool", "192.0.2.5", "port", "open", "widget-svc", "gizmoscan", "run_all", "found", "config.bak"]) {
      expect(s.has(t), t).toBe(true);
    }
    expect(s.has("-x")).toBe(false);
    expect(s.has("ok")).toBe(false);
    expect(s.has("x")).toBe(false);
  });
});
