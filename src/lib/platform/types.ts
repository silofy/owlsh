import type { Machine, Target, GoldenObjective, NoiseBaseline, PlatformId } from "../../types/report";
import type { DetectContext } from "./detect";

export interface NativePathInput {
  target: Target;
  /** Platform-native structure the adapter parses (e.g. a pasted THM task list). */
  raw?: string;
}

export interface Connector {
  kind: "ssh" | "local" | "none";
  label: string;
  hint?: string; // ssh: connection-string placeholder / where to find it
  note?: string; // local/none: one-line explanation shown instead of a form
}

export interface PlatformAdapter {
  id: PlatformId;
  label: string; // "Hack The Box", "TryHackMe", ...
  kindNoun: string; // "box", "room", "lab", "target", "host"
  /** How captures reach owlsh for this platform's attack VM. */
  connector: Connector;
  /** 0..1 confidence this session belongs to this platform. Never throws. */
  detect(ctx: DetectContext): number;
  /** Neutral identity. Always returns a Target, never throws. */
  identify(machine: Machine | undefined, ctx: DetectContext): Target;
  /** Native intended path where the platform is structured; null → fall back to write-up extraction. */
  intendedPath?(input: NativePathInput): Promise<GoldenObjective[] | null>;
  calibration?: {
    noiseBaseline?: (target: Target) => NoiseBaseline | undefined;
    difficultyColor?: (label: string) => string | undefined;
  };
}
