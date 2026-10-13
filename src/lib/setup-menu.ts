export type SetupItemId = "guide" | "ai" | "connector" | "widget";
export interface SetupItem { id: SetupItemId; label: string }

export function setupItems(opts: { desktop: boolean }): SetupItem[] {
  const base: SetupItem[] = [
    { id: "guide", label: "Setup guide" },
    { id: "ai", label: "Connect a model" },
    { id: "connector", label: "VM connector" },
  ];
  return opts.desktop ? [...base, { id: "widget", label: "Open widget" }] : base;
}

export function setupItemTarget(id: SetupItemId): { step?: number; jump?: "connector"; widget?: boolean } {
  switch (id) {
    case "guide": return { step: 0 };
    case "ai": return { step: 2 };
    case "connector": return { step: 1, jump: "connector" };
    case "widget": return { widget: true };
  }
}

export function setupIncomplete(opts: { onboarded: boolean; hasRealCapture: boolean }): boolean {
  return !opts.onboarded || !opts.hasRealCapture;
}
