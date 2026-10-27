// Scan a local project for what a school filter would react to: page content
// that gets the site categorized as blocked, and third-party hosts the app
// calls that will fail on a school network.

import { readdir, stat } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import { analyzeCode, analyzeHtml, type ContentReport } from "./content.ts";
import { checkUrlSync, type Verdict } from "./engine.ts";
import { ACTION_RANK, CATEGORIES, actionFor, type Action, type CategoryId, type ProfileId } from "./rules.ts";

const IGNORE_DIRS = new Set(["node_modules", ".git", ".next", ".nuxt", ".svelte-kit", ".turbo", ".vercel", ".output", "coverage", "vendor", ".cache"]);
const HTML_EXT = new Set([".html", ".htm"]);
const CODE_EXT = new Set([".js", ".mjs", ".cjs", ".jsx", ".ts", ".tsx", ".vue", ".svelte", ".astro", ".json", ".md", ".mdx", ".php", ".py", ".rb", ".erb", ".hbs", ".ejs"]);
const MAX_FILE_BYTES = 2_000_000;
const URL_RE = /https?:\/\/[a-z0-9.-]+\.[a-z]{2,}(?::\d+)?(?:\/[^\s"'`)<>\]\\]*)?/gi;

export interface ScanOptions {
  profile?: ProfileId;
  /** Deployed host, checked with domain rules. */
  as?: string;
  /** Include build output dirs (dist, build). Off by default to skip minified bundles. */
  includeBuild?: boolean;
}

export interface HostFinding {
  host: string;
  action: Action;
  category: CategoryId;
  categoryName: string;
  detail: string;
  files: string[];
}

export interface FileFinding {
  file: string;
  detected: ContentReport["detected"];
  signatures: ContentReport["signatures"];
  title: string | null;
}

export interface ScanReport {
  root: string;
  profile: ProfileId;
  filesScanned: number;
  /** Worst outcome across everything found. */
  action: Action;
  blocked: boolean;
  deployedHost: Verdict | null;
  contentFindings: FileFinding[];
  hostFindings: HostFinding[];
  summary: string[];
}

async function* walk(dir: string, includeBuild: boolean): AsyncGenerator<string> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name.startsWith(".") && entry.name !== ".well-known") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (IGNORE_DIRS.has(entry.name)) continue;
      if (!includeBuild && (entry.name === "dist" || entry.name === "build" || entry.name === "out")) continue;
      yield* walk(full, includeBuild);
    } else if (entry.isFile()) {
      yield full;
    }
  }
}

export async function scanProject(root: string, opts: ScanOptions = {}): Promise<ScanReport> {
  const profile = opts.profile ?? "high";
  const info = await stat(root);
  const files = info.isDirectory() ? walk(root, !!opts.includeBuild) : (async function* () { yield root; })();

  let filesScanned = 0;
  const contentFindings: FileFinding[] = [];
  const hostFiles = new Map<string, Set<string>>();

  for await (const file of files) {
    const ext = extname(file).toLowerCase();
    const isHtml = HTML_EXT.has(ext);
    if (!isHtml && !CODE_EXT.has(ext)) continue;
    const f = Bun.file(file);
    if (f.size > MAX_FILE_BYTES) continue;
    const text = await f.text();
    filesScanned++;
    const rel = info.isDirectory() ? relative(root, file) : file;

    const report = isHtml ? analyzeHtml(text) : analyzeCode(text);
    if (report.detected.length || report.signatures.length) {
      contentFindings.push({ file: rel, detected: report.detected, signatures: report.signatures, title: report.title });
    }

    for (const m of text.matchAll(URL_RE)) {
      let host: string;
      try {
        host = new URL(m[0]).hostname.toLowerCase();
      } catch {
        continue;
      }
      if (!hostFiles.has(host)) hostFiles.set(host, new Set());
      hostFiles.get(host)!.add(rel);
    }
  }

  const hostFindings: HostFinding[] = [];
  for (const [host, fileSet] of hostFiles) {
    const v = checkUrlSync(`https://${host}/`, { profile });
    if (v.local || v.category.id === "uncategorized") continue; // unknown APIs are too noisy to report
    if (ACTION_RANK[v.action] < ACTION_RANK.flag) continue;
    hostFindings.push({ host, action: v.action, category: v.category.id, categoryName: v.category.name, detail: v.primaryReason?.detail ?? v.message, files: [...fileSet].slice(0, 10) });
  }
  hostFindings.sort((a, b) => ACTION_RANK[b.action] - ACTION_RANK[a.action] || a.host.localeCompare(b.host));

  const deployedHost = opts.as ? checkUrlSync(opts.as, { profile }) : null;

  // Content in your own pages determines how the deployed site gets categorized.
  const contentActions = contentFindings.flatMap((f) => f.detected.map((d) => ({ cat: d.category, action: actionFor(profile, d.category) })));
  const worst = [deployedHost?.action, ...contentActions.map((c) => c.action), ...hostFindings.map((h) => (h.action === "block" ? "flag" : h.action))]
    .filter((a): a is Action => !!a)
    .reduce<Action>((w, a) => (ACTION_RANK[a] > ACTION_RANK[w] ? a : w), "allow");

  const summary: string[] = [];
  if (deployedHost) summary.push(`Deployed host ${deployedHost.evaluatedHost}: ${deployedHost.action.toUpperCase()} (${deployedHost.category.name}).`);
  for (const c of new Set(contentActions.filter((c) => c.action === "block").map((c) => c.cat)))
    summary.push(`Page content would get the site categorized as ${CATEGORIES[c].name}, which is blocked for ${profile}.`);
  const blockedHosts = hostFindings.filter((h) => h.action === "block");
  if (blockedHosts.length)
    summary.push(`${blockedHosts.length} third-party host(s) your code calls are blocked, so those features will break for students: ${blockedHosts.slice(0, 6).map((h) => h.host).join(", ")}.`);
  if (!summary.length) summary.push("Nothing in this project would trip the filter for this profile.");

  return { root, profile, filesScanned, action: worst, blocked: worst === "block", deployedHost, contentFindings, hostFindings, summary };
}
