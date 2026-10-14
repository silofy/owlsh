import { connectorFor } from "./platform";
import type { PlatformId } from "../types/report";

export function connectorView(platform: PlatformId) {
  const c = connectorFor(platform);
  return { ...c, showSshForm: c.kind === "ssh" };
}
