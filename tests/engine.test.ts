import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkUrl, checkUrlSync, normalizeInput } from "../src/engine.ts";
import { configureLists, installedLists, listsDir, lookupLists } from "../src/lists.ts";
import { registrableDomain } from "../src/registration.ts";
import { scanProject } from "../src/scan.ts";
import { CATEGORIES, PROFILES, actionFor } from "../src/rules.ts";

const fixtures = join(import.meta.dir, "fixtures");
// Keep results deterministic regardless of what's in the user's list cache.
configureLists({ enabled: false });
const check = (url: string, profile: keyof typeof PROFILES = "high") => checkUrlSync(url, { profile });

describe("domain categories", () => {
  test.each([
    ["khanacademy.org", "allow", "education"],
    ["docs.google.com/document/d/xxxABC/edit", "allow", "productivity"],
    ["admissions.stateu.edu", "allow", "education"],
    ["irs.gov", "allow", "government"],
    ["tiktok.com", "block", "social"],
    ["www.instagram.com/explore", "block", "social"],
    ["coolmathgames.com", "block", "games"],
    ["discord.com/app", "block", "chat"],
    ["netflix.com", "block", "streaming"],
    ["character.ai", "block", "ai_companion"],
    ["chatgpt.com", "flag", "ai_chat"],
    ["bit.ly/abc", "block", "url_shortener"],
    ["nordvpn.com", "block", "proxy"],
    ["draftkings.com", "block", "gambling"],
    ["duckduckgo.com", "block", "search_unsafe"],
    ["myproxy.duckdns.org", "block", "dynamic_dns"],
    ["cloudflare-dns.com", "block", "proxy"],
    ["doubleclick.net", "block", "ads"],
    ["buzzfeed.com", "flag", "entertainment"],
  ] as const)("%s → %s (%s)", (url, action, category) => {
    const v = check(url);
    expect(v.action).toBe(action);
    expect(v.category.id).toBe(category);
  });

  test("path rules beat domain rules", () => {
    expect(check("youtube.com/watch?v=1").action).toBe("restrict");
    expect(check("youtube.com/shorts/abc").category.id).toBe("social");
    expect(check("nytimes.com/games/wordle").category.id).toBe("games");
    expect(check("translate.google.com/translate?u=x").category.id).toBe("proxy");
  });
});

describe("profiles", () => {
  test("YouTube varies by grade band", () => {
    expect(check("youtube.com", "elementary").action).toBe("block");
    expect(check("youtube.com", "middle").action).toBe("restrict");
    expect(check("youtube.com", "staff").action).toBe("allow");
  });

  test("CIPA categories are blocked for every profile", () => {
    for (const cat of Object.values(CATEGORIES).filter((c) => c.cipa))
      for (const p of Object.keys(PROFILES) as (keyof typeof PROFILES)[]) expect(actionFor(p, cat.id)).toBe("block");
  });

  test("sexuality resources are High School Allowed, like real district records", () => {
    expect(check("thetrevorproject.org", "elementary").action).toBe("block");
    expect(check("thetrevorproject.org", "middle").action).toBe("block");
    expect(check("thetrevorproject.org", "high").action).toBe("allow");
  });

  test("guest Wi-Fi blocks health and limits government sites", () => {
    expect(check("cdc.gov", "high").action).toBe("allow");
    expect(check("cdc.gov", "guest").action).toBe("block");
    expect(check("irs.gov", "guest").action).toBe("flag");
    expect(check("classroom.google.com", "guest").action).toBe("allow");
  });

  test(".edu domains are categorized, not blindly trusted", () => {
    const v = checkUrlSync("https://somecollege.edu/files/free-porn-videos");
    expect(v.action).toBe("block");
    expect(v.trusted).toBeFalsy();
  });

  test("uncategorized sites are blocked for elementary, flagged for high", () => {
    expect(check("some-brand-new-site.xyz", "elementary").action).toBe("block");
    expect(check("some-brand-new-site.xyz", "high").action).toBe("flag");
  });
});

describe("heuristics", () => {
  test("keyword in a free-hosting subdomain blocks it", () => {
    const v = check("unblockedgames76.github.io");
    expect(v.action).toBe("block");
    expect(v.primaryReason?.code).toBe("keyword_in_domain");
  });

  test("whole-word matching avoids the Scunthorpe problem", () => {
    expect(check("sussexcollege.com").category.id).toBe("uncategorized");
    expect(check("essex-county-library.org").category.id).toBe("uncategorized");
  });

  test("SafeSearch blocks bad queries but not normal ones", () => {
    expect(check("google.com/search?q=photosynthesis").action).toBe("restrict");
    const v = check("google.com/search?q=free+porn");
    expect(v.action).toBe("block");
    expect(v.primaryReason?.code).toBe("search_term_blocked");
  });

  test("raw IPs, browser internals, and non-standard ports", () => {
    expect(check("http://142.250.72.14").primaryReason?.code).toBe("ip_navigation");
    expect(check("chrome://flags").action).toBe("block");
    expect(check("javascript:alert(1)", "staff").action).toBe("block");
    expect(check("http://somehost.net:8080").reasons.some((r) => r.code === "nonstandard_port")).toBe(true);
  });

  test("allowlisted domains ignore keyword heuristics", () => {
    expect(check("khanacademy.org/search?q=games").action).toBe("allow");
  });
});

describe("local projects", () => {
  test("localhost gets http and an uncategorized verdict", () => {
    expect(normalizeInput("localhost:3000")).toBe("http://localhost:3000");
    const v = check("localhost:3000");
    expect(v.local).toBe(true);
    expect(v.category.id).toBe("uncategorized");
  });

  test("--as applies domain rules for the deployed host", () => {
    const v = checkUrlSync("http://localhost:5173", { as: "slope-unblocked.vercel.app" });
    expect(v.evaluatedHost).toBe("slope-unblocked.vercel.app");
    expect(v.action).toBe("block");
  });
});

describe("content classification", () => {
  test("proxy + game signatures in page HTML", async () => {
    const html = await Bun.file(join(fixtures, "games-site/index.html")).text();
    const v = await checkUrl("https://totally-normal-site.com", { html });
    expect(v.action).toBe("block");
    const cats = v.content!.report!.detected.map((d) => d.category);
    expect(cats).toContain("proxy");
    expect(cats).toContain("games");
    expect(v.reasons.some((r) => r.code === "embedded_blocked")).toBe(true);
  });

  test("clean educational page isn't miscategorized", async () => {
    const html = await Bun.file(join(fixtures, "edu-site/index.html")).text();
    const v = await checkUrl("https://fractionlab.example", { html });
    expect(v.content!.report!.detected).toEqual([]);
    expect(v.action).toBe("flag"); // still uncategorized until the vendor reviews it
  });
});

describe("scan_project", () => {
  test("finds blocked third-party hosts in an otherwise clean project", async () => {
    const r = await scanProject(join(fixtures, "edu-site"), { profile: "middle" });
    const hosts = r.hostFindings.map((h) => h.host);
    expect(hosts).toContain("api.openai.com");
    expect(hosts).toContain("discord.gg");
    expect(hosts).not.toContain("cdn.jsdelivr.net");
    expect(r.contentFindings).toEqual([]);
  });

  test("flags a games/proxy project as blocked", async () => {
    const r = await scanProject(join(fixtures, "games-site"), { as: "mygames.vercel.app" });
    expect(r.blocked).toBe(true);
    expect(r.contentFindings[0]!.signatures.length).toBeGreaterThan(0);
  });
});

describe("imported blocklists", () => {
  const dir = mkdtempSync(join(tmpdir(), "cbsim-lists-"));
  const prev = process.env.CHROMEBOOK_SIM_CACHE;
  process.env.CHROMEBOOK_SIM_CACHE = dir;
  const write = (id: string, category: string, domains: string[]) => {
    writeFileSync(join(dir, `${id}.txt`), domains.join("\n"));
    writeFileSync(join(dir, `${id}.json`), JSON.stringify({ id, name: id, project: "HaGeZi", category, url: "", license: null, entries: domains.length, lastModified: null, fetchedAt: new Date().toISOString() }));
  };
  write("hagezi-bypass", "proxy", ["sneaky-proxy.net", "evil.github.io"]);
  write("hagezi-nsfw", "adult", ["sneaky-proxy.net", "nsfw-example.com"]);
  configureLists({ enabled: true });

  afterAll(() => {
    configureLists({ enabled: false });
    if (prev === undefined) delete process.env.CHROMEBOOK_SIM_CACHE;
    else process.env.CHROMEBOOK_SIM_CACHE = prev;
    rmSync(dir, { recursive: true, force: true });
  });

  test("lists load from the cache dir in source order", () => {
    expect(listsDir()).toBe(dir);
    expect(installedLists().map((l) => l.id)).toEqual(["hagezi-bypass", "hagezi-nsfw"]);
    expect(lookupLists("cdn.sneaky-proxy.net")?.source.category).toBe("proxy"); // earlier list wins
  });

  test("a list entry categorizes an unknown domain and its subdomains", () => {
    const v = checkUrlSync("https://www.nsfw-example.com/");
    expect(v.action).toBe("block");
    expect(v.primaryReason?.code).toBe("blocklist_category");
  });

  test("a more specific list entry beats a broad hand rule", () => {
    expect(checkUrlSync("evil.github.io").category.id).toBe("proxy");
    expect(checkUrlSync("fine.github.io").category.id).toBe("web_hosting");
  });

  test("hand rules win ties", () => {
    expect(checkUrlSync("khanacademy.org").action).toBe("allow");
  });
});

describe("domain age", () => {
  test("registrable domain handles multi-label suffixes", () => {
    expect(registrableDomain("a.b.example.com")).toBe("example.com");
    expect(registrableDomain("www.bbc.co.uk")).toBe("bbc.co.uk");
    expect(registrableDomain("x.lakeview.k12.ca.us")).toBe("lakeview.k12.ca.us");
  });

  test("domains under 30 days old are blocked in deep mode", async () => {
    const realFetch = globalThis.fetch;
    const tenDaysAgo = new Date(Date.now() - 10 * 86_400_000).toISOString();
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.startsWith("https://rdap.org/")) return Response.json({ events: [{ eventAction: "registration", eventDate: tenDaysAgo }] });
      return new Response("<title>Hello</title>", { headers: { "content-type": "text/html" } });
    }) as typeof fetch;
    try {
      const v = await checkUrl("https://brand-new-launch.com", { deep: true });
      expect(v.registration?.ageDays).toBe(10);
      expect(v.action).toBe("block");
      expect(v.primaryReason?.code).toBe("newly_registered");
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
