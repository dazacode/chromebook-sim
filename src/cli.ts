#!/usr/bin/env bun
import { renderBlockPage } from "./blockpage.ts";
import { checkAllProfiles, checkMany, type Verdict } from "./engine.ts";
import { scanProject, type ScanReport } from "./scan.ts";
import { LIST_SOURCES, clearLists, configureLists, installedLists, listsDir, listsSummary, updateLists } from "./lists.ts";
import { ACTION_RANK, CATEGORIES, PROFILES, actionFor, type Action, type ProfileId } from "./rules.ts";

const HELP = `chromebook-sim: would a school Chromebook block this site?

Usage
  chromebook-sim check <url...>        Check one or more URLs
  chromebook-sim batch [file|-]        Check URLs from a file or stdin, one per line
  chromebook-sim scan <dir>            Audit a local project before deploying it for students
  chromebook-sim page <url>            Print the block page HTML a student would see
  chromebook-sim serve                 Start the Chromebook simulator UI and HTTP API
  chromebook-sim mcp                   Run as an MCP server over stdio (for agents)
  chromebook-sim categories            List categories and per-profile actions
  chromebook-sim lists update [--full] Download real blocklists (HaGeZi, Block List Project)
  chromebook-sim lists status          Show installed blocklists
  chromebook-sim lists clear           Delete downloaded blocklists

Options
  -p, --profile <id>    elementary | middle | high | staff | guest   (default: high)
  -a, --all-profiles    Show the result for every profile
  -d, --deep            Fetch the page, classify its content, check domain age (RDAP)
      --no-lists        Ignore downloaded blocklists, use built-in rules only
      --full            \`lists update\` also fetches large lists (~85 MB)
      --only <ids>      \`lists update\` only these comma-separated list ids
      --as <host>       Evaluate a localhost URL as if deployed at <host>
      --json            Machine-readable JSON output (JSON Lines for batch)
      --fail-on <lvl>   block (default) | flag | never  - controls exit code
      --style <s>       Block page style for \`page\`: filter | chrome
      --include-build   \`scan\` also reads dist/, build/, out/
      --port <n>        Port for \`serve\` (default 4321)
      --host <h>        Bind address for \`serve\` (default 127.0.0.1)

Exit codes
  0  nothing failed the --fail-on threshold
  1  at least one result blocked (or flagged, with --fail-on flag)
  2  usage error or invalid URL

Examples
  chromebook-sim lists update
  chromebook-sim check tiktok.com khanacademy.org
  chromebook-sim check http://localhost:3000 --as mygame.vercel.app --deep --json
  chromebook-sim check youtube.com --all-profiles
  chromebook-sim scan . --as myapp.vercel.app --profile middle
  cat urls.txt | chromebook-sim batch --json --fail-on flag
`;

interface Flags {
  _: string[];
  profile: ProfileId;
  all: boolean;
  deep: boolean;
  as?: string;
  json: boolean;
  failOn: "block" | "flag" | "never";
  style: "filter" | "chrome";
  includeBuild: boolean;
  port: number;
  host: string;
  help: boolean;
  noLists: boolean;
  full: boolean;
  only?: string[];
}

function parse(argv: string[]): Flags {
  const f: Flags = { _: [], profile: "high", all: false, deep: false, json: false, failOn: "block", style: "filter", includeBuild: false, port: 4321, host: "127.0.0.1", help: false, noLists: false, full: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    const [key, inline] = a.startsWith("--") && a.includes("=") ? [a.slice(0, a.indexOf("=")), a.slice(a.indexOf("=") + 1)] : [a, undefined];
    const val = () => inline ?? argv[++i] ?? die(`${key} needs a value`);
    switch (key) {
      case "-p": case "--profile": f.profile = val() as ProfileId; break;
      case "-a": case "--all-profiles": f.all = true; break;
      case "-d": case "--deep": f.deep = true; break;
      case "--as": f.as = val(); break;
      case "--json": f.json = true; break;
      case "--fail-on": f.failOn = val() as Flags["failOn"]; break;
      case "--style": f.style = val() as Flags["style"]; break;
      case "--include-build": f.includeBuild = true; break;
      case "--port": f.port = Number(val()); break;
      case "--host": f.host = val(); break;
      case "-h": case "--help": f.help = true; break;
      case "--no-lists": f.noLists = true; break;
      case "--full": f.full = true; break;
      case "--only": f.only = val().split(",").map((x) => x.trim()).filter(Boolean); break;
      default:
        if (a.startsWith("-") && a !== "-") die(`Unknown option ${a}`);
        f._.push(a);
    }
  }
  if (!(f.profile in PROFILES)) die(`Unknown profile "${f.profile}". Use: ${Object.keys(PROFILES).join(", ")}`);
  if (!["block", "flag", "never"].includes(f.failOn)) die(`--fail-on must be block, flag or never`);
  return f;
}

function die(msg: string): never {
  console.error(`error: ${msg}\nRun "chromebook-sim --help" for usage.`);
  process.exit(2);
}

// --- Output ----------------------------------------------------------------

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code: string) => (s: string) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);
const bold = c("1"), dim = c("2");
const ACTION_COLOR: Record<Action, (s: string) => string> = { allow: c("32"), restrict: c("36"), flag: c("33"), block: c("31") };
const ICON: Record<Action, string> = { allow: "✓", restrict: "◐", flag: "⚑", block: "✕" };
const badge = (a: Action) => ACTION_COLOR[a](bold(`${ICON[a]} ${a.toUpperCase()}`));

function printVerdict(v: Verdict, matrix?: Record<ProfileId, Verdict>) {
  if (v.error) {
    console.log(`${ACTION_COLOR.block("✕ ERROR")}  ${v.input}\n  ${v.error}\n`);
    return;
  }
  console.log(`${badge(v.action)}  ${bold(v.url ?? v.input)}`);
  console.log(`  ${dim("category")}  ${v.category.name}${v.category.cipa ? dim(" (CIPA)") : ""}   ${dim("profile")} ${PROFILES[v.profile].name}   ${dim("risk")} ${v.riskScore}`);
  if (v.evaluatedHost && v.evaluatedHost !== v.host) console.log(`  ${dim("as")}        ${v.evaluatedHost}`);
  console.log(`  ${dim("why")}       ${v.message}`);
  for (const e of v.enforcement) console.log(`  ${dim("enforced")}  ${e}`);
  if (matrix) {
    console.log(`  ${dim("profiles")}  ${(Object.keys(matrix) as ProfileId[]).map((p) => `${p} ${ACTION_COLOR[matrix[p].action](matrix[p].action)}`).join(dim("  ·  "))}`);
  }
  console.log(`  ${dim("rules")}`);
  for (const r of v.reasons) console.log(`    ${ACTION_COLOR[r.action](ICON[r.action])} ${r.detail} ${dim(`[${r.code}]`)}`);
  if (v.registration) {
    const r = v.registration;
    console.log(`  ${dim("domain age")} ${r.ageDays != null ? `${r.domain} registered ${r.registeredAt?.slice(0, 10)} (${r.ageDays} days)` : `${r.domain}: ${r.error ?? "unknown"}`}`);
  }
  const report = v.content?.report;
  if (v.content) {
    const status = v.content.error ? `fetch failed: ${v.content.error}` : `HTTP ${v.content.status ?? "-"}`;
    console.log(`  ${dim("content")}   ${status}${report?.title ? ` · "${report.title}"` : ""}`);
    if (report?.signatures.length) console.log(`  ${dim("signals")}   ${report.signatures.map((s) => s.label).join("; ")}`);
  }
  if (v.suggestions.length) {
    console.log(`  ${dim("next")}`);
    for (const s of v.suggestions) console.log(`    → ${s}`);
  }
  if (v.vendorLookups.length && !v.trusted) console.log(`  ${dim("real vendors")} ${v.vendorLookups.map((l) => l.url).join("  ")}`);
  console.log();
}

function hintLists() {
  if (!process.stdout.isTTY) return;
  const s = listsSummary();
  if (s.enabled && !s.lists) console.error(dim(`tip: run "chromebook-sim lists update" to add ~600k real blocklist domains\n`));
}

async function runLists(sub: string | undefined, f: Flags) {
  switch (sub) {
    case "update": {
      const sources = LIST_SOURCES.filter((s) => (f.only?.length ? f.only.includes(s.id) : f.full || !s.full));
      if (!f.json) console.log(`Downloading ${sources.length} lists into ${listsDir()}`);
      const results = await updateLists({
        full: f.full,
        only: f.only,
        onProgress: (r) => !f.json && console.log(r.ok ? `  ${ACTION_COLOR.allow("✓")} ${r.id.padEnd(22)} ${r.entries!.toLocaleString()} domains` : `  ${ACTION_COLOR.block("✕")} ${r.id.padEnd(22)} ${r.error}`),
      });
      const total = listsSummary();
      if (f.json) console.log(JSON.stringify({ results, ...total }, null, 2));
      else console.log(`\n${total.domains.toLocaleString()} unique domains across ${total.lists} lists.`);
      process.exit(results.some((r) => !r.ok) ? 1 : 0);
    }
    case "status":
    case undefined: {
      const lists = installedLists();
      if (f.json) return console.log(JSON.stringify({ dir: listsDir(), installed: lists, summary: listsSummary() }, null, 2));
      if (!lists.length) return console.log(`No blocklists installed. Run "chromebook-sim lists update".\nCache: ${listsDir()}`);
      console.log(bold(`${"id".padEnd(24)}${"category".padEnd(18)}${"domains".padStart(10)}  ${"upstream modified".padEnd(26)}license`));
      for (const m of lists) console.log(`${m.id.padEnd(24)}${m.category.padEnd(18)}${m.entries.toLocaleString().padStart(10)}  ${(m.lastModified ?? "-").slice(0, 24).padEnd(26)}${m.license ?? "-"}`);
      const s = listsSummary();
      console.log(dim(`\n${s.domains.toLocaleString()} unique domains · fetched ${lists[0]!.fetchedAt.slice(0, 10)} · ${listsDir()}`));
      return;
    }
    case "clear":
      clearLists();
      return console.log(`Removed ${listsDir()}`);
    default:
      die(`unknown lists command "${sub}" (use update, status or clear)`);
  }
}

function printScan(r: ScanReport) {
  console.log(`${badge(r.action)}  ${bold(r.root)}  ${dim(`${r.filesScanned} file${r.filesScanned === 1 ? "" : "s"} · ${PROFILES[r.profile].name}`)}`);
  for (const s of r.summary) console.log(`  ${s}`);
  if (r.deployedHost) {
    console.log(`\n  ${bold("Deployed host")}`);
    for (const reason of r.deployedHost.reasons) console.log(`    ${ACTION_COLOR[reason.action](ICON[reason.action])} ${reason.detail}`);
  }
  if (r.contentFindings.length) {
    console.log(`\n  ${bold("Content that drives categorization")}`);
    for (const f of r.contentFindings) {
      const cats = f.detected.map((d) => `${CATEGORIES[d.category].name} (${ACTION_COLOR[actionFor(r.profile, d.category)](actionFor(r.profile, d.category))}, score ${d.score})`);
      console.log(`    ${f.file}${cats.length ? `: ${cats.join(", ")}` : ""}`);
      for (const s of f.signatures) console.log(`      ${dim("·")} ${s.label}`);
    }
  }
  if (r.hostFindings.length) {
    console.log(`\n  ${bold("Third-party hosts your code calls")}`);
    for (const h of r.hostFindings) console.log(`    ${ACTION_COLOR[h.action](ICON[h.action])} ${h.host} ${dim(`${h.categoryName} · ${h.files.slice(0, 3).join(", ")}${h.files.length > 3 ? "…" : ""}`)}`);
  }
  console.log();
}

function exitCodeFor(actions: Action[], failOn: Flags["failOn"], hadError = false): number {
  if (hadError) return 2;
  if (failOn === "never") return 0;
  const threshold = ACTION_RANK[failOn];
  return actions.some((a) => ACTION_RANK[a] >= threshold) ? 1 : 0;
}

// --- Commands ----------------------------------------------------------------

async function runCheck(urls: string[], f: Flags, jsonl = false) {
  if (!urls.length) die("no URLs given");
  const opts = { profile: f.profile, deep: f.deep, as: f.as };
  let verdicts: Verdict[];
  let matrices: Record<ProfileId, Verdict>[] | undefined;
  if (f.all) {
    matrices = await Promise.all(urls.map((u) => checkAllProfiles(u, opts)));
    verdicts = matrices.map((m) => m[f.profile]);
  } else {
    verdicts = await checkMany(urls, opts);
  }

  if (f.json) {
    const out = matrices ? matrices.map((m) => ({ ...m[f.profile], profiles: Object.fromEntries(Object.entries(m).map(([k, v]) => [k, { action: v.action, category: v.category.id }])) })) : verdicts;
    if (jsonl) for (const v of out) console.log(JSON.stringify(v));
    else console.log(JSON.stringify(out.length === 1 ? out[0] : out, null, 2));
  } else {
    verdicts.forEach((v, i) => printVerdict(v, matrices?.[i]));
    if (verdicts.length > 1) {
      const counts = verdicts.reduce<Record<string, number>>((acc, v) => ((acc[v.action] = (acc[v.action] ?? 0) + 1), acc), {});
      console.log(dim(Object.entries(counts).map(([a, n]) => `${n} ${a}`).join(" · ")));
    }
  }
  process.exit(exitCodeFor(verdicts.map((v) => v.action), f.failOn, verdicts.some((v) => v.error)));
}

async function readLines(source?: string): Promise<string[]> {
  const text = !source || source === "-" ? await Bun.stdin.text() : await Bun.file(source).text();
  return text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
}

async function main() {
  const f = parse(Bun.argv.slice(2));
  if (f.noLists) configureLists({ enabled: false });
  const [cmd, ...rest] = f._;
  if (f.help || !cmd || cmd === "help") {
    console.log(HELP);
    return;
  }
  switch (cmd) {
    case "lists":
      return runLists(rest[0], f);
    case "check":
      hintLists();
      return runCheck(rest, f);
    case "batch":
      return runCheck(await readLines(rest[0]), f, true);
    case "scan": {
      const report = await scanProject(rest[0] ?? ".", { profile: f.profile, as: f.as, includeBuild: f.includeBuild });
      if (f.json) console.log(JSON.stringify(report, null, 2));
      else printScan(report);
      process.exit(exitCodeFor([report.action], f.failOn));
    }
    case "page": {
      if (!rest[0]) die("page needs a URL");
      const { checkUrl } = await import("./engine.ts");
      const v = await checkUrl(rest[0], { profile: f.profile, deep: f.deep, as: f.as });
      if (!v.blocked) console.error(`note: ${rest[0]} is not blocked (${v.action}); rendering its block page anyway`);
      console.log(renderBlockPage(v, f.style));
      return;
    }
    case "serve": {
      const { startServer } = await import("./server.ts");
      const server = startServer(f.port, f.host);
      console.log(`Chromebook simulator running at ${bold(String(server.url))}`);
      console.log(dim(`API: ${server.url}api/check?url=tiktok.com&profile=high`));
      return;
    }
    case "mcp": {
      const { startMcp } = await import("./mcp.ts");
      return startMcp();
    }
    case "categories": {
      const { categoriesPayload } = await import("./server.ts");
      const cats = categoriesPayload();
      if (f.json) return console.log(JSON.stringify(cats, null, 2));
      const ids = Object.keys(PROFILES) as ProfileId[];
      console.log(bold(`${"category".padEnd(26)}${ids.map((p) => p.padEnd(12)).join("")}`));
      for (const cat of cats) {
        const cells = ids.map((p) => ACTION_COLOR[cat.actions[p] as Action]((cat.actions[p] as string).padEnd(12)));
        console.log(`${(cat.name + (cat.cipa ? " *" : "")).padEnd(26)}${cells.join("")}`);
      }
      console.log(dim("\n* CIPA: blocked for everyone, can't be overridden"));
      return;
    }
    default:
      // Treat a bare URL as `check` for convenience.
      if (/[.:/]/.test(cmd)) return runCheck(f._, f);
      die(`unknown command "${cmd}"`);
  }
}

main();
