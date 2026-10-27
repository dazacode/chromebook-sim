// Domain age via RDAP (the JSON successor to WHOIS). Filters block domains
// registered in the last few weeks, because most phishing and proxy mirrors
// are days old when students find them.

export const NEW_DOMAIN_DAYS = 30;

// Common multi-label public suffixes. Not the full PSL, but enough to find the
// registrable domain for the hosts this tool usually sees.
const MULTI_SUFFIXES = new Set([
  "co.uk", "org.uk", "ac.uk", "gov.uk", "sch.uk", "me.uk", "ltd.uk", "plc.uk", "net.uk",
  "com.au", "net.au", "org.au", "edu.au", "gov.au", "co.nz", "org.nz", "school.nz", "co.jp", "ne.jp", "or.jp",
  "com.br", "com.mx", "com.ar", "co.in", "co.za", "com.sg", "com.hk", "com.tr", "co.kr", "com.cn", "com.tw",
]);

export function registrableDomain(host: string): string | null {
  const labels = host.toLowerCase().replace(/\.$/, "").split(".");
  if (labels.length < 2) return null;
  const last2 = labels.slice(-2).join(".");
  if (MULTI_SUFFIXES.has(last2) || /^k12\.[a-z]{2}\.us$/.test(labels.slice(-3).join("."))) {
    const depth = /^k12\./.test(labels.slice(-3).join(".")) ? 4 : 3;
    return labels.length >= depth ? labels.slice(-depth).join(".") : null;
  }
  return last2;
}

export interface Registration {
  domain: string;
  registeredAt: string | null;
  ageDays: number | null;
  error?: string;
}

const cache = new Map<string, Promise<Registration>>();

export function lookupRegistration(domain: string, timeoutMs = 6000): Promise<Registration> {
  let p = cache.get(domain);
  if (!p) {
    p = fetchRdap(domain, timeoutMs);
    cache.set(domain, p);
  }
  return p;
}

async function fetchRdap(domain: string, timeoutMs: number): Promise<Registration> {
  try {
    const res = await fetch(`https://rdap.org/domain/${encodeURIComponent(domain)}`, {
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { accept: "application/rdap+json, application/json" },
    });
    if (res.status === 404) return { domain, registeredAt: null, ageDays: null, error: "not found in RDAP (unregistered or TLD has no RDAP)" };
    if (!res.ok) return { domain, registeredAt: null, ageDays: null, error: `RDAP HTTP ${res.status}` };
    const data = (await res.json()) as { events?: { eventAction: string; eventDate: string }[] };
    const reg = data.events?.find((e) => e.eventAction === "registration")?.eventDate ?? null;
    const ageDays = reg ? Math.floor((Date.now() - Date.parse(reg)) / 86_400_000) : null;
    return { domain, registeredAt: reg, ageDays };
  } catch (err) {
    return { domain, registeredAt: null, ageDays: null, error: err instanceof Error ? err.message : String(err) };
  }
}
