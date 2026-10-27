// Third-party domain blocklists that real school admins import into DNS
// filters, firewalls and Pi-holes. Downloaded on demand into a local cache
// (never bundled, so their licenses stay with the data) and consulted after
// the hand-curated rules in rules.ts.

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { CategoryId } from "./rules.ts";

export interface ListSource {
  id: string;
  name: string;
  project: "HaGeZi" | "Block List Project";
  category: CategoryId;
  url: string;
  homepage: string;
  /** Only downloaded with --full (large files). */
  full?: boolean;
}

const HAGEZI = "https://raw.githubusercontent.com/hagezi/dns-blocklists/main/wildcard";
const BLP = "https://raw.githubusercontent.com/blocklistproject/Lists/master/alt-version";
const hz = (id: string, file: string, name: string, category: CategoryId, full = false): ListSource => ({
  id: `hagezi-${id}`, name, project: "HaGeZi", category, url: `${HAGEZI}/${file}-onlydomains.txt`, homepage: "https://github.com/hagezi/dns-blocklists", full,
});
const blp = (id: string, name: string, category: CategoryId, full = false): ListSource => ({
  id: `blp-${id}`, name, project: "Block List Project", category, url: `${BLP}/${id}-nl.txt`, homepage: "https://github.com/blocklistproject/Lists", full,
});

/** Order matters: earlier sources win when a domain appears on several lists. */
export const LIST_SOURCES: ListSource[] = [
  hz("hoster", "hoster", "Badware Hoster", "security"),
  blp("phishing", "Phishing", "security"),
  blp("scam", "Scam", "security"),
  blp("ransomware", "Ransomware", "security"),
  hz("bypass", "doh-vpn-proxy-bypass", "DoH/VPN/TOR/Proxy Bypass", "proxy"),
  hz("nsfw", "nsfw", "NSFW", "adult"),
  hz("gambling-mini", "gambling.mini", "Gambling (mini)", "gambling"),
  blp("drugs", "Drugs", "drugs"),
  blp("vaping", "Vaping", "drugs"),
  hz("nosafesearch", "nosafesearch", "SafeSearch Not Supported", "search_unsafe"),
  hz("piracy", "anti.piracy", "Anti-Piracy", "piracy"),
  blp("piracy", "Piracy", "piracy"),
  blp("torrent", "Torrent", "piracy"),
  hz("urlshortener", "urlshortener", "URL Shortener", "url_shortener"),
  hz("dyndns", "dyndns", "Dynamic DNS", "dynamic_dns"),
  hz("social", "social", "Social Networks", "social"),
  hz("light", "light", "Multi Light (ads & trackers)", "ads"),
  // Large lists, only with --full.
  hz("gambling", "gambling", "Gambling (full)", "gambling", true),
  blp("porn", "Porn", "adult", true),
  blp("fraud", "Fraud", "security", true),
  blp("malware", "Malware", "security", true),
];

export function listsDir(): string {
  return process.env.CHROMEBOOK_SIM_CACHE ?? join(process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache"), "chromebook-sim", "lists");
}

export interface ListMeta {
  id: string;
  name: string;
  project: string;
  category: CategoryId;
  url: string;
  license: string | null;
  entries: number;
  lastModified: string | null;
  fetchedAt: string;
}

export interface ListHit {
  source: ListMeta;
  matched: string;
}

let index: Map<string, number> | null = null;
let metas: ListMeta[] = [];
let enabled = !process.env.CHROMEBOOK_SIM_NO_LISTS;

/** Turn list lookups on/off (tests and --no-lists). */
export function configureLists(opts: { enabled: boolean }) {
  enabled = opts.enabled;
  if (!enabled) index = null;
}

function parseHeader(text: string, key: RegExp): string | null {
  for (const line of text.slice(0, 2000).split("\n")) {
    const m = line.match(key);
    if (m) return m[1]!.trim();
  }
  return null;
}

function parseDomains(text: string): string[] {
  const out: string[] = [];
  for (let line of text.split("\n")) {
    line = line.trim();
    if (!line || line.startsWith("#") || line.startsWith("!")) continue;
    // Tolerate hosts-file and wildcard syntaxes.
    line = line.replace(/^(0\.0\.0\.0|127\.0\.0\.1)\s+/, "").replace(/^\*\./, "").replace(/^\|\|/, "").replace(/\^$/, "");
    if (/^[a-z0-9.-]+\.[a-z0-9-]+$/i.test(line)) out.push(line.toLowerCase());
  }
  return out;
}

export interface UpdateResult {
  id: string;
  ok: boolean;
  entries?: number;
  error?: string;
}

export async function updateLists(opts: { full?: boolean; only?: string[]; onProgress?: (r: UpdateResult) => void } = {}): Promise<UpdateResult[]> {
  const dir = listsDir();
  mkdirSync(dir, { recursive: true });
  const sources = LIST_SOURCES.filter((s) => (opts.only?.length ? opts.only.includes(s.id) : opts.full || !s.full));
  const results: UpdateResult[] = [];

  await Promise.all(
    sources.map(async (src) => {
      let r: UpdateResult;
      try {
        const res = await fetch(src.url, { signal: AbortSignal.timeout(120_000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        const domains = parseDomains(text);
        if (!domains.length) throw new Error("no domains parsed");
        const meta: ListMeta = {
          id: src.id,
          name: src.name,
          project: src.project,
          category: src.category,
          url: src.url,
          license: parseHeader(text, /^#\s*License:\s*(.+)$/i),
          entries: domains.length,
          lastModified: parseHeader(text, /^#\s*Last modified:\s*(.+)$/i),
          fetchedAt: new Date().toISOString(),
        };
        writeFileSync(join(dir, `${src.id}.txt`), domains.join("\n"));
        writeFileSync(join(dir, `${src.id}.json`), JSON.stringify(meta, null, 2));
        r = { id: src.id, ok: true, entries: domains.length };
      } catch (err) {
        r = { id: src.id, ok: false, error: err instanceof Error ? err.message : String(err) };
      }
      results.push(r);
      opts.onProgress?.(r);
    }),
  );
  index = null; // reload on next lookup
  return results;
}

export function installedLists(): ListMeta[] {
  const dir = listsDir();
  if (!existsSync(dir)) return [];
  const byId = new Map(LIST_SOURCES.map((s, i) => [s.id, i]));
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as ListMeta)
    .filter((m) => byId.has(m.id))
    .sort((a, b) => byId.get(a.id)! - byId.get(b.id)!);
}

export function clearLists() {
  rmSync(listsDir(), { recursive: true, force: true });
  index = null;
}

function load() {
  index = new Map();
  metas = installedLists();
  const dir = listsDir();
  metas.forEach((meta, i) => {
    const file = join(dir, `${meta.id}.txt`);
    if (!existsSync(file)) return;
    for (const d of readFileSync(file, "utf8").split("\n")) if (d && !index!.has(d)) index!.set(d, i);
  });
}

/** Most specific list entry covering `host` (lists treat entries as covering subdomains). */
export function lookupLists(host: string): ListHit | null {
  if (!enabled) return null;
  if (!index) load();
  if (!index!.size) return null;
  const labels = host.toLowerCase().split(".");
  for (let i = 0; i < labels.length - 1; i++) {
    const candidate = labels.slice(i).join(".");
    const at = index!.get(candidate);
    if (at !== undefined) return { source: metas[at]!, matched: candidate };
  }
  return null;
}

export function listsSummary() {
  if (!enabled) return { enabled: false, lists: 0, domains: 0 };
  if (!index) load();
  return { enabled: true, lists: metas.length, domains: index!.size, dir: listsDir() };
}
