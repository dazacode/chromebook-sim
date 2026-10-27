// Page-content classification, the way filters do "dynamic categorization"
// of sites that aren't in their domain database yet.

import { CONTENT_SIGNATURES, KEYWORDS, type CategoryId } from "./rules.ts";

export const CHROMEBOOK_UA =
  "Mozilla/5.0 (X11; CrOS x86_64 16093.68.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

const CONTENT_THRESHOLD = 12;
const MAX_HITS_PER_KEYWORD = 5;
const MAX_BYTES = 3_000_000;

export interface SignatureHit {
  category: CategoryId;
  label: string;
  weight: number;
}

export interface ContentReport {
  title: string | null;
  description: string | null;
  h1: string[];
  frames: string[];
  externalHosts: string[];
  signatures: SignatureHit[];
  keywordHits: Partial<Record<CategoryId, Record<string, number>>>;
  scores: Partial<Record<CategoryId, number>>;
  /** Categories whose score crossed the threshold, highest first. */
  detected: { category: CategoryId; score: number }[];
}

export interface FetchResult {
  ok: boolean;
  status: number | null;
  finalUrl: string;
  contentType: string | null;
  html: string | null;
  error?: string;
}

const decodeEntities = (s: string) =>
  s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, " ");

const clean = (s: string) => decodeEntities(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

/** Lowercase, collapse non-alphanumerics to single spaces, pad with spaces for phrase matching. */
export const normalize = (s: string) => ` ${s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;

function countPhrase(haystack: string, phrase: string): number {
  const needle = ` ${phrase} `;
  let count = 0;
  let i = haystack.indexOf(needle);
  while (i !== -1 && count < MAX_HITS_PER_KEYWORD) {
    count++;
    i = haystack.indexOf(needle, i + needle.length - 1);
  }
  return count;
}

function metaContent(html: string, name: string): string | null {
  const re = new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*>`, "i");
  const tag = html.match(re)?.[0];
  const content = tag?.match(/content=["']([^"']*)["']/i)?.[1];
  return content ? clean(content) : null;
}

function hostsOf(urls: string[], base?: string): string[] {
  const hosts = new Set<string>();
  for (const u of urls) {
    try {
      hosts.add(new URL(u, base).hostname.toLowerCase());
    } catch {}
  }
  return [...hosts];
}

export function analyzeHtml(html: string, baseUrl?: string): ContentReport {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const description = metaContent(html, "description") ?? metaContent(html, "og:description");
  const keywordsMeta = metaContent(html, "keywords");
  const h1 = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) => clean(m[1] ?? "")).filter(Boolean).slice(0, 10);

  const frameSrcs = [...html.matchAll(/<(?:iframe|embed|object)[^>]+(?:src|data)=["']([^"']+)["']/gi)].map((m) => m[1]!);
  const resourceSrcs = [...html.matchAll(/<(?:script|link|img|source|video|audio)[^>]+(?:src|href)=["']([^"']+)["']/gi)].map((m) => m[1]!);
  const baseHost = baseUrl ? safeHost(baseUrl) : null;
  const frames = hostsOf(frameSrcs, baseUrl).filter((h) => h !== baseHost);
  const externalHosts = hostsOf([...frameSrcs, ...resourceSrcs], baseUrl).filter((h) => h !== baseHost && !h.endsWith(".local") && h !== "localhost");

  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  const bodyText = normalize(clean(body));
  // Title, description and headings carry more weight, like real classifiers.
  const headline = normalize([title ? clean(title) : "", description ?? "", keywordsMeta ?? "", ...h1].join(" "));

  return score(html, bodyText, headline, {
    title: title ? clean(title) : null,
    description,
    h1,
    frames,
    externalHosts,
  });
}

/** Signature-only analysis for JS/TS source, where prose keywords are noise. */
export function analyzeCode(source: string): ContentReport {
  return score(source, " ", " ", { title: null, description: null, h1: [], frames: [], externalHosts: [] });
}

function score(
  raw: string,
  bodyText: string,
  headline: string,
  base: Pick<ContentReport, "title" | "description" | "h1" | "frames" | "externalHosts">,
): ContentReport {
  const scores: Partial<Record<CategoryId, number>> = {};
  const keywordHits: ContentReport["keywordHits"] = {};
  const add = (c: CategoryId, n: number) => (scores[c] = (scores[c] ?? 0) + n);

  for (const set of KEYWORDS) {
    for (const kw of set.tokens) {
      const phrase = normalize(kw).trim();
      const inBody = countPhrase(bodyText, phrase);
      const inHead = countPhrase(headline, phrase);
      if (!inBody && !inHead) continue;
      (keywordHits[set.category] ??= {})[kw] = inBody + inHead;
      // Body hits are diluted; headline hits count triple.
      add(set.category, set.weight * (Math.min(inBody, MAX_HITS_PER_KEYWORD) * 0.5 + inHead * 3));
    }
  }

  const signatures: SignatureHit[] = [];
  for (const sig of CONTENT_SIGNATURES) {
    if (sig.pattern.test(raw)) {
      signatures.push({ category: sig.category, label: sig.label, weight: sig.weight });
      add(sig.category, sig.weight);
    }
  }

  for (const k of Object.keys(scores) as CategoryId[]) scores[k] = Math.round(scores[k]! * 10) / 10;
  const detected = (Object.entries(scores) as [CategoryId, number][])
    .filter(([, s]) => s >= CONTENT_THRESHOLD)
    .sort((a, b) => b[1] - a[1])
    .map(([category, score]) => ({ category, score }));

  return { ...base, signatures, keywordHits, scores, detected };
}

function safeHost(u: string): string | null {
  try {
    return new URL(u).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export async function fetchPage(url: string, timeoutMs = 8000): Promise<FetchResult> {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "user-agent": CHROMEBOOK_UA, accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5" },
    });
    const contentType = res.headers.get("content-type");
    let html: string | null = null;
    if (!contentType || /html|xml|text\/plain/i.test(contentType)) {
      const buf = await res.arrayBuffer();
      html = new TextDecoder().decode(buf.byteLength > MAX_BYTES ? buf.slice(0, MAX_BYTES) : buf);
    }
    return { ok: res.ok, status: res.status, finalUrl: res.url || url, contentType, html };
  } catch (err) {
    return { ok: false, status: null, finalUrl: url, contentType: null, html: null, error: err instanceof Error ? err.message : String(err) };
  }
}
