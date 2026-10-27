import { analyzeHtml, fetchPage, normalize, type ContentReport } from "./content.ts";
import { lookupLists } from "./lists.ts";
import { NEW_DOMAIN_DAYS, lookupRegistration, registrableDomain, type Registration } from "./registration.ts";
import {
  ACTION_RANK,
  CATEGORIES,
  DOMAIN_RULES,
  KEYWORDS,
  PROFILES,
  SEARCH_QUERY_PARAMS,
  EDU_GOV_TLDS,
  actionFor,
  type Action,
  type CategoryId,
  type DomainRule,
  type ProfileId,
} from "./rules.ts";

export type ReasonSource = "scheme" | "domain" | "blocklist" | "tld" | "registration" | "url_keyword" | "search_query" | "heuristic" | "content" | "redirect" | "embed";

export interface Reason {
  code: string;
  source: ReasonSource;
  category: CategoryId;
  action: Action;
  detail: string;
  matched?: string;
}

export interface Verdict {
  input: string;
  url: string | null;
  host: string | null;
  /** Host the domain rules were evaluated against (differs from `host` when --as is used). */
  evaluatedHost: string | null;
  profile: ProfileId;
  action: Action;
  blocked: boolean;
  category: { id: CategoryId; name: string; cipa: boolean };
  /** Human-readable reason shown on the block page. */
  message: string;
  primaryReason: Reason | null;
  reasons: Reason[];
  enforcement: string[];
  riskScore: number;
  suggestions: string[];
  local: boolean;
  content?: {
    fetched: boolean;
    status: number | null;
    finalUrl: string | null;
    error?: string;
    report?: ContentReport;
  };
  /** Matched an allowlisted domain (education, productivity...), so heuristics are ignored. */
  trusted?: boolean;
  /** Domain age from RDAP (deep checks only). */
  registration?: Registration;
  /** Official pages where a human can see how real filter vendors categorize this host. */
  vendorLookups: { vendor: string; url: string }[];
  checkedAt: string;
  error?: string;
}

export interface CheckOptions {
  profile?: ProfileId;
  /** Fetch the page and classify its content. */
  deep?: boolean;
  /** Evaluate domain rules as if the site were deployed at this host (for localhost projects). */
  as?: string;
  /** Pre-supplied HTML to classify instead of fetching. */
  html?: string;
  timeoutMs?: number;
}

export const DEFAULT_PROFILE: ProfileId = "high";
const SEVERE: CategoryId[] = ["adult", "gambling", "drugs", "weapons", "violence_hate", "proxy", "hacking", "piracy", "dating"];

export function normalizeInput(input: string): string {
  const s = input.trim();
  if (/^[a-z][a-z0-9+.-]*:/i.test(s) && !/^[^/:]+:\d+(\/|$)/.test(s)) return s;
  const bare = s.replace(/^\/+/, "");
  const host = bare.split(/[/:?#]/)[0]!.toLowerCase();
  return `${isLocal(host) ? "http" : "https"}://${bare}`;
}

function isIp(host: string) {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":");
}

function isLocal(host: string) {
  return (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".test") ||
    host === "::1" ||
    host === "[::1]" ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    host === "0.0.0.0"
  );
}

function hostMatches(host: string, pattern: string) {
  return host === pattern || host.endsWith(`.${pattern}`);
}

export function matchDomain(host: string, path = "/"): DomainRule | null {
  let best: DomainRule | null = null;
  let bestScore = -1;
  for (const rule of DOMAIN_RULES) {
    if (!hostMatches(host, rule.pattern)) continue;
    if (rule.path && !path.toLowerCase().startsWith(rule.path)) continue;
    const s = rule.pattern.length * 10 + (rule.path ? rule.path.length * 100 : 0);
    if (s > bestScore) {
      best = rule;
      bestScore = s;
    }
  }
  return best;
}

interface KeywordMatch {
  category: CategoryId;
  keyword: string;
  where: "host" | "path";
}

function urlKeywords(host: string, pathAndQuery: string, opts: { hostSubstrings: boolean; severeOnly: boolean }): KeywordMatch[] {
  const hits: KeywordMatch[] = [];
  const hostNorm = normalize(host.replace(/\.[a-z]+$/, ""));
  const pathNorm = normalize(decodeSafe(pathAndQuery));
  const hostCompact = host.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const set of KEYWORDS) {
    if (opts.severeOnly && !SEVERE.includes(set.category)) continue;
    for (const kw of set.tokens) {
      const phrase = ` ${normalize(kw).trim()} `;
      if (hostNorm.includes(phrase)) hits.push({ category: set.category, keyword: kw, where: "host" });
      else if (pathNorm.includes(phrase)) hits.push({ category: set.category, keyword: kw, where: "path" });
    }
    if (opts.hostSubstrings) {
      for (const sub of set.substrings) {
        if (hostCompact.includes(sub) && !hits.some((h) => h.category === set.category && h.where === "host"))
          hits.push({ category: set.category, keyword: sub, where: "host" });
      }
    }
  }
  return hits;
}

function decodeSafe(s: string) {
  try {
    return decodeURIComponent(s.replace(/\+/g, " "));
  } catch {
    return s;
  }
}

function reason(profile: ProfileId, r: Omit<Reason, "action"> & { action?: Action }): Reason {
  return { ...r, action: r.action ?? actionFor(profile, r.category) };
}

export function checkUrlSync(input: string, opts: CheckOptions = {}): Verdict {
  const profile = opts.profile ?? DEFAULT_PROFILE;
  const checkedAt = new Date().toISOString();
  const reasons: Reason[] = [];
  let url: URL;
  try {
    url = new URL(normalizeInput(input));
  } catch {
    return finalize({ input, url: null, host: null, evaluatedHost: null, profile, reasons, local: false, checkedAt, error: `Not a valid URL: ${input}` });
  }

  const scheme = url.protocol.replace(/:$/, "");
  if (!["http", "https"].includes(scheme)) {
    if (url.href === "about:blank") {
      reasons.push(reason(profile, { code: "about_blank", source: "scheme", category: "infrastructure", detail: "about:blank is allowed." }));
    } else {
      reasons.push(
        reason(profile, {
          code: "blocked_scheme",
          source: "scheme",
          category: "browser_internal",
          action: ["javascript", "data"].includes(scheme) ? "block" : undefined,
          detail: `${scheme}:// URLs are blocked by device policy (URLBlocklist).`,
          matched: `${scheme}://`,
        }),
      );
    }
    return finalize({ input, url: url.href, host: url.hostname || null, evaluatedHost: null, profile, reasons, local: false, checkedAt });
  }

  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  const local = isLocal(host);
  const evaluatedHost = (opts.as ? hostOf(opts.as) : null) ?? host;
  const pathAndQuery = url.pathname + url.search;

  // 1. Explicit domain database.
  // Hand-curated rules first, then imported blocklists; the more specific match wins.
  const skipDomainRules = local && !opts.as;
  let rule = skipDomainRules ? null : matchDomain(evaluatedHost, url.pathname);
  const listHit = skipDomainRules ? null : lookupLists(evaluatedHost);
  const listWon = !!listHit && (!rule || (!rule.path && listHit.matched.length > rule.pattern.length));
  if (listHit && listWon) {
    reasons.push(
      reason(profile, {
        code: "blocklist_category",
        source: "blocklist",
        category: listHit.source.category,
        detail: `${listHit.matched} is on the ${listHit.source.project} "${listHit.source.name}" list (${CATEGORIES[listHit.source.category].name}).`,
        matched: listHit.matched,
      }),
    );
    rule = { pattern: listHit.matched, category: listHit.source.category };
  } else if (rule) {
    reasons.push(
      reason(profile, {
        code: "domain_category",
        source: "domain",
        category: rule.category,
        detail: `${rule.pattern}${rule.path ?? ""} is categorized as ${CATEGORIES[rule.category].name}.${rule.note ? ` (${rule.note})` : ""}`,
        matched: rule.pattern + (rule.path ?? ""),
      }),
    );
  }
  // .edu/.gov get a category, but not blanket trust: real districts still filter them.
  const eduGovTld = !rule && !skipDomainRules && EDU_GOV_TLDS.some((re) => re.test(evaluatedHost));
  if (eduGovTld) {
    const cat: CategoryId = /\.(gov|mil)(\.[a-z]{2})?$/.test(evaluatedHost) ? "government" : "education";
    reasons.push(reason(profile, { code: "edu_gov_tld", source: "tld", category: cat, detail: `${evaluatedHost} is a ${cat === "government" ? "government" : "school or university"} domain.`, matched: evaluatedHost }));
  }
  const trusted = !listWon && rule != null && ["education", "reference", "productivity"].includes(rule.category);

  if (!trusted) {
    // 2. Raw IP navigation is a classic filter-bypass trick.
    if (!local && isIp(host)) {
      reasons.push(reason(profile, { code: "ip_navigation", source: "heuristic", category: "proxy", detail: "Navigating directly to an IP address skips DNS-based filtering, so it's treated as a bypass attempt.", matched: host }));
    }

    // 3. Keyword filtering on the URL. Known domains only get severe-term path checks.
    // Free-hosting subdomains are user-chosen, so their names still get keyword-checked.
    const known = (rule != null && rule.category !== "web_hosting") || eduGovTld;
    const urlHits = rule?.category === "search" || rule?.category === "search_unsafe" ? [] : urlKeywords(known ? "" : evaluatedHost, pathAndQuery, { hostSubstrings: !known, severeOnly: known });
    for (const hit of urlHits) {
      reasons.push(
        reason(profile, {
          code: hit.where === "host" ? "keyword_in_domain" : "keyword_in_path",
          source: "url_keyword",
          category: hit.category,
          detail: `The ${hit.where === "host" ? "domain name" : "URL path"} contains the blocked keyword "${hit.keyword}" (${CATEGORIES[hit.category].name}).`,
          matched: hit.keyword,
        }),
      );
    }

    // 4. Look-alike / punycode hosts.
    if (evaluatedHost.split(".").some((l) => l.startsWith("xn--"))) {
      reasons.push(reason(profile, { code: "punycode_host", source: "heuristic", category: "uncategorized", action: "flag", detail: "Internationalized (punycode) domain; filters flag these as possible look-alikes.", matched: evaluatedHost }));
    }

    // 5. Non-standard ports suggest self-hosted proxies.
    if (url.port && !["80", "443"].includes(url.port) && !local) {
      reasons.push(reason(profile, { code: "nonstandard_port", source: "heuristic", category: "uncategorized", action: "flag", detail: `Port ${url.port} is non-standard; filters flag these as possible self-hosted proxies.`, matched: url.port }));
    }
  }

  // 6. SafeSearch: search queries are themselves filtered.
  if (rule?.category === "search") {
    for (const p of SEARCH_QUERY_PARAMS) {
      const q = url.searchParams.get(p);
      if (!q) continue;
      for (const hit of urlKeywords("", `/${q}`, { hostSubstrings: false, severeOnly: false })) {
        if (hit.category === "games") continue; // searching "games" isn't blocked, the results are
        reasons.push(
          reason(profile, {
            code: "search_term_blocked",
            source: "search_query",
            category: hit.category,
            detail: `Search term "${hit.keyword}" is on the blocked search-terms list (${CATEGORIES[hit.category].name}).`,
            matched: hit.keyword,
          }),
        );
      }
    }
  }

  return finalize({ input, url: url.href, host, evaluatedHost, profile, reasons, local, trusted, checkedAt });
}

export async function checkUrl(input: string, opts: CheckOptions = {}): Promise<Verdict> {
  const base = checkUrlSync(input, opts);
  if ((!opts.deep && !opts.html) || !base.url || base.error || !/^https?:/.test(base.url)) return base;

  const profile = base.profile;
  const reasons = [...base.reasons];
  let content: Verdict["content"];
  let registration: Registration | undefined;

  // Domain age. Skipped for shared-hosting subdomains, whose registrable domain is the platform's.
  const regHost = base.evaluatedHost;
  const onSharedHost = base.reasons.some((r) => r.category === "web_hosting");
  const regPromise =
    opts.deep && regHost && !onSharedHost && !base.trusted && !(base.local && regHost === base.host) && !isIp(regHost) && registrableDomain(regHost)
      ? lookupRegistration(registrableDomain(regHost)!, opts.timeoutMs)
      : null;

  let html = opts.html ?? null;
  let finalUrl = base.url;
  if (html == null) {
    const res = await fetchPage(base.url, opts.timeoutMs);
    html = res.html;
    finalUrl = res.finalUrl;
    content = { fetched: true, status: res.status, finalUrl: res.finalUrl, error: res.error };

    const finalHost = hostOf(res.finalUrl);
    if (finalHost && finalHost !== base.host) {
      const target = checkUrlSync(res.finalUrl, { profile });
      if (ACTION_RANK[target.action] > ACTION_RANK[base.action] && target.primaryReason) {
        reasons.push({ ...target.primaryReason, code: "redirect_target", source: "redirect", detail: `Redirects to ${finalHost}: ${target.primaryReason.detail}` });
      }
    }
  } else {
    content = { fetched: false, status: null, finalUrl: null };
  }

  if (html) {
    const report = analyzeHtml(html, finalUrl);
    content.report = report;
    if (!base.trusted) {
      for (const d of report.detected) {
        const sigs = report.signatures.filter((s) => s.category === d.category).map((s) => s.label);
        const kws = Object.keys(report.keywordHits[d.category] ?? {}).slice(0, 6);
        const evidence = [...sigs, ...kws.map((k) => `"${k}"`)].join(", ");
        reasons.push(
          reason(profile, {
            code: sigs.length ? "content_signature" : "content_keywords",
            source: "content",
            category: d.category,
            detail: `Page content classified as ${CATEGORIES[d.category].name} (score ${d.score}): ${evidence}.`,
            matched: evidence,
          }),
        );
      }
    }
    for (const frameHost of report.frames) {
      const frame = checkUrlSync(`https://${frameHost}/`, { profile });
      if (frame.action === "block") {
        reasons.push(
          reason(profile, {
            code: "embedded_blocked",
            source: "embed",
            category: frame.category.id,
            action: "flag",
            detail: `Embeds ${frameHost} (${frame.category.name}), which is blocked. That frame will show a block page inside this site.`,
            matched: frameHost,
          }),
        );
      }
    }
  }

  if (regPromise) {
    registration = await regPromise;
    if (registration.ageDays != null && registration.ageDays < NEW_DOMAIN_DAYS) {
      reasons.push(
        reason(profile, {
          code: "newly_registered",
          source: "registration",
          category: "newly_registered",
          detail: `${registration.domain} was registered ${registration.ageDays} day${registration.ageDays === 1 ? "" : "s"} ago (${registration.registeredAt?.slice(0, 10)}). Filters block domains younger than ${NEW_DOMAIN_DAYS} days.`,
          matched: registration.domain,
        }),
      );
    }
  }

  return finalize({ ...base, reasons, content, registration, trusted: base.trusted });
}

function hostOf(s: string): string | null {
  try {
    return new URL(normalizeInput(s)).hostname.toLowerCase();
  } catch {
    return null;
  }
}

interface Draft {
  input: string;
  url: string | null;
  host: string | null;
  evaluatedHost: string | null;
  profile: ProfileId;
  reasons: Reason[];
  local: boolean;
  trusted?: boolean;
  checkedAt: string;
  content?: Verdict["content"];
  registration?: Registration;
  error?: string;
}

function finalize(d: Draft): Verdict {
  const reasons = [...d.reasons];
  const categorized = reasons.some((r) => ["domain", "blocklist", "tld", "url_keyword", "content", "scheme", "search_query", "registration"].includes(r.source) || r.code === "ip_navigation");
  if (!d.error && !categorized) {
    reasons.push(
      reason(d.profile, {
        code: "uncategorized",
        source: "heuristic",
        category: "uncategorized",
        detail: d.local && d.evaluatedHost === d.host
          ? "Local dev server. On a real Chromebook this would be your deployed domain, which starts out uncategorized."
          : `${d.evaluatedHost} isn't in the filter's category database.`,
        matched: d.evaluatedHost ?? undefined,
      }),
    );
  }

  // Allowlisted (trusted) categories win over heuristics, like a district allowlist.
  const pool = d.trusted ? reasons.filter((r) => r.source === "domain" || r.source === "scheme") : reasons;
  const primary = pool.reduce<Reason | null>((best, r) => {
    if (!best) return r;
    const a = ACTION_RANK[r.action], b = ACTION_RANK[best.action];
    if (a !== b) return a > b ? r : best;
    // Same action: prefer CIPA categories, then explicit domain rules.
    const cipa = Number(!!CATEGORIES[r.category].cipa) - Number(!!CATEGORIES[best.category].cipa);
    if (cipa !== 0) return cipa > 0 ? r : best;
    return best;
  }, null);

  const action: Action = d.error ? "block" : (primary?.action ?? "allow");
  const catId: CategoryId = primary?.category ?? "uncategorized";
  const cat = CATEGORIES[catId];

  const enforcement: string[] = [];
  if (action !== "block") {
    if (reasons.some((r) => r.category === "search")) enforcement.push("SafeSearch enforced (forcesafesearch DNS / ForceGoogleSafeSearch policy)");
    if (reasons.some((r) => r.category === "video") && /youtube|youtu\.be/.test(d.evaluatedHost ?? "")) enforcement.push("YouTube Restricted Mode: Strict (ForceYouTubeRestrict = 2)");
    if (action === "flag") enforcement.push("Visit is logged and may alert a teacher or admin");
  }

  const message = d.error
    ? d.error
    : action === "block"
      ? cat.blockReason || primary?.detail || "Blocked by your administrator."
      : action === "flag"
        ? `Allowed, but flagged for review: ${primary?.detail ?? cat.name}`
        : action === "restrict"
          ? `Allowed with restrictions: ${enforcement[0] ?? cat.name}`
          : `Allowed. ${cat.name}.`;

  const riskScore = d.error
    ? 0
    : Math.min(100, ({ allow: 0, restrict: 15, flag: 50, block: 80 } as const)[action] + (cat.cipa ? 20 : 0) + Math.min(15, reasons.filter((r) => ACTION_RANK[r.action] >= 2).length * 4));

  return {
    input: d.input,
    url: d.url,
    host: d.host,
    evaluatedHost: d.evaluatedHost,
    profile: d.profile,
    action,
    blocked: action === "block",
    category: { id: catId, name: cat.name, cipa: !!cat.cipa },
    message,
    primaryReason: primary,
    reasons,
    enforcement,
    riskScore,
    suggestions: d.error ? ["Pass a full URL like https://example.com"] : suggest(action, reasons, d),
    local: d.local,
    content: d.content,
    registration: d.registration,
    vendorLookups: d.error || d.local && d.evaluatedHost === d.host || !d.evaluatedHost ? [] : vendorLookups(d.evaluatedHost),
    checkedAt: d.checkedAt,
    trusted: d.trusted,
    ...(d.error ? { error: d.error } : {}),
  };
}

function vendorLookups(host: string) {
  const q = encodeURIComponent(host);
  return [
    { vendor: "Palo Alto Networks (Test A Site)", url: "https://urlfiltering.paloaltonetworks.com/" },
    { vendor: "Fortinet FortiGuard", url: `https://www.fortiguard.com/webfilter?q=${q}` },
    { vendor: "Cisco Talos", url: `https://talosintelligence.com/reputation_center/lookup?search=${q}` },
  ];
}

/** Advice for developers checking their own project. Points at legitimate fixes only. */
function suggest(action: Action, reasons: Reason[], d: Draft): string[] {
  const out = new Set<string>();
  const has = (pred: (r: Reason) => boolean) => reasons.some(pred);
  if (d.local && d.evaluatedHost === d.host)
    out.add("This is a local URL. Re-run with --as <your-deployed-host> (e.g. --as myapp.vercel.app) to apply domain rules for where it will live, and --deep to classify the page.");
  if (has((r) => r.category === "proxy" || r.category === "hacking"))
    out.add("Proxy, VPN, cloaking and device-tampering behavior is always blocked. There's no legitimate way around this; remove that functionality if the site is meant for school use.");
  if (has((r) => !!CATEGORIES[r.category].cipa))
    out.add("CIPA categories (adult, gambling, drugs, weapons, violence/hate, dating) are blocked for every student, and no allowlist request will override them.");
  if (has((r) => r.code === "keyword_in_domain"))
    out.add("The domain name itself matches a keyword filter. Filters match hostnames before anything else, so only a different domain will clear it.");
  if (has((r) => r.code === "keyword_in_path"))
    out.add("A URL path matches a keyword filter. If the term is used innocently (for example in a health-class page), ask district IT to allowlist the URL.");
  if (has((r) => r.category === "web_hosting"))
    out.add("Free hosting subdomains are flagged by default because they host so many game and proxy mirrors. A custom domain with clear educational metadata gets categorized more favorably.");
  if (has((r) => r.category === "uncategorized"))
    out.add("New domains start out uncategorized. Submit the site to your district's filter vendor for categorization, or ask IT to add it to the allowlist.");
  if (has((r) => r.category === "games"))
    out.add("Games are blocked by policy. If it's an educational game, describe the learning goal in the <title> and meta description, then ask a teacher or IT to request an Education categorization.");
  if (has((r) => r.category === "ai_chat"))
    out.add("AI tools are commonly blocked for students. If your app calls an AI API from the browser, route it through your own backend so the feature doesn't break on school networks, and get district approval.");
  if (has((r) => r.code === "embedded_blocked"))
    out.add("Embedded frames are filtered on their own. Any blocked embed will show a block page inside your site.");
  if (has((r) => r.code === "newly_registered"))
    out.add("The domain is under 30 days old. Most filters automatically lift this block once the domain ages and gets categorized. Launch on an older domain, or register early.");
  if (has((r) => r.category === "dynamic_dns"))
    out.add("Dynamic-DNS hostnames are blocked because they're used for home-hosted proxies. Use a regular registered domain.");
  if (has((r) => r.category === "sexuality_health"))
    out.add("Sex-ed and LGBTQ+ resources are often blocked for younger grades even though they aren't explicit. If your site is educational, ask the district to review its categorization; reporting like The Markup's 2024 investigation has pushed districts to fix this.");
  if (has((r) => r.category === "ads"))
    out.add("Ad and tracking domains are blocked at the DNS layer on many school networks. Make sure your site still works when they fail to load.");
  if (has((r) => r.category === "security"))
    out.add("The domain is on a malware/phishing list. If it's yours and clean, request delisting from the list maintainer and check it for compromise.");
  if (action === "allow" || action === "restrict") out.add("No changes needed for this profile.");
  return [...out];
}

export async function checkMany(inputs: string[], opts: CheckOptions = {}, concurrency = 6): Promise<Verdict[]> {
  const results: Verdict[] = new Array(inputs.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, inputs.length) }, async () => {
    while (next < inputs.length) {
      const i = next++;
      results[i] = await checkUrl(inputs[i]!, opts);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function checkAllProfiles(input: string, opts: Omit<CheckOptions, "profile"> = {}): Promise<Record<ProfileId, Verdict>> {
  const ids = Object.keys(PROFILES) as ProfileId[];
  const verdicts = await Promise.all(ids.map((profile) => checkUrl(input, { ...opts, profile })));
  return Object.fromEntries(ids.map((id, i) => [id, verdicts[i]!])) as Record<ProfileId, Verdict>;
}
