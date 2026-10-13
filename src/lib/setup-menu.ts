export type SetupItemId = "guide" | "ai" | "connector" | "widget";
export interface SetupItem { id: SetupItemId; label: string }

export function setupItems(opts: { desktop: boolean }): SetupItem[] {
  const base: SetupItem[] = [
    { id: "guide", label: "Setup guide" },
    { id: "ai", label: "AI · coach model" },
    { id: "connector", label: "VM connector" },
  ];
  return opts.desktop ? [...base, { id: "widget", label: "Open widget" }] : base;
}

export function setupIncomplete(opts: { onboarded: boolean; hasRealCapture: boolean }): boolean {
  return !opts.onboarded || !opts.hasRealCapture;
}
