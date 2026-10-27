import { DISTRICT_NAME, renderAllowedPage, renderBlockPage, type BlockStyle } from "./blockpage.ts";
import { checkAllProfiles, checkMany, checkUrl, type CheckOptions } from "./engine.ts";
import { installedLists, listsSummary } from "./lists.ts";
import { CATEGORIES, PROFILES, actionFor, type CategoryId, type ProfileId } from "./rules.ts";

const UI = new URL("./ui/index.html", import.meta.url);

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*" },
  });

const html = (body: string) => new Response(body, { headers: { "content-type": "text/html; charset=utf-8" } });

function optsFrom(p: URLSearchParams | Record<string, unknown>): CheckOptions & { error?: string } {
  const get = (k: string) => (p instanceof URLSearchParams ? p.get(k) : (p[k] as string | undefined)) ?? undefined;
  const profile = (get("profile") ?? "high") as ProfileId;
  if (!(profile in PROFILES)) return { error: `Unknown profile "${profile}". Use one of: ${Object.keys(PROFILES).join(", ")}` };
  const deep = get("deep");
  return { profile, deep: deep === "1" || deep === "true" || (deep as unknown) === true, as: get("as") || undefined };
}

export function categoriesPayload() {
  return Object.values(CATEGORIES).map((c) => ({
    ...c,
    actions: Object.fromEntries((Object.keys(PROFILES) as ProfileId[]).map((p) => [p, actionFor(p, c.id as CategoryId)])),
  }));
}

export function startServer(port = 4321, hostname = "127.0.0.1") {
  const server = Bun.serve({
    port,
    hostname,
    routes: {
      "/": () => new Response(Bun.file(UI)),
      "/health": () => json({ ok: true }),
      "/api/config": () => json({ district: DISTRICT_NAME, profiles: PROFILES, lists: listsSummary() }),
      "/api/lists": () => json({ summary: listsSummary(), installed: installedLists() }),
      "/api/profiles": () => json(PROFILES),
      // One round trip for the UI: the verdict, every profile's outcome, and the rendered page.
      "/api/simulate": async (req) => {
        const p = new URL(req.url).searchParams;
        const url = p.get("url");
        if (!url) return json({ error: "Missing ?url=" }, 400);
        const opts = optsFrom(p);
        if (opts.error) return json({ error: opts.error }, 400);
        const all = await checkAllProfiles(url, opts);
        const verdict = all[opts.profile!];
        const style = (p.get("style") === "chrome" ? "chrome" : "filter") as BlockStyle;
        const page = verdict.blocked ? renderBlockPage(verdict, style) : renderAllowedPage(verdict);
        const profiles = Object.fromEntries(Object.entries(all).map(([k, v]) => [k, { action: v.action, category: v.category.name }]));
        return json({ verdict, profiles, page });
      },
      "/api/categories": () => json(categoriesPayload()),
      "/api/check": {
        GET: async (req) => {
          const p = new URL(req.url).searchParams;
          const url = p.get("url");
          if (!url) return json({ error: "Missing ?url=" }, 400);
          const opts = optsFrom(p);
          if (opts.error) return json({ error: opts.error }, 400);
          if (p.get("all") === "1") return json(await checkAllProfiles(url, opts));
          return json(await checkUrl(url, opts));
        },
        POST: async (req) => {
          let body: Record<string, unknown>;
          try {
            body = (await req.json()) as Record<string, unknown>;
          } catch {
            return json({ error: "Body must be JSON: { \"url\": \"...\" } or { \"urls\": [...] }" }, 400);
          }
          const opts = optsFrom(body);
          if (opts.error) return json({ error: opts.error }, 400);
          if (typeof body.html === "string") opts.html = body.html;
          if (Array.isArray(body.urls)) return json(await checkMany(body.urls.map(String), opts));
          if (typeof body.url === "string") return json(await checkUrl(body.url, opts));
          return json({ error: "Provide \"url\" or \"urls\"" }, 400);
        },
      },
      // Renders exactly what the student would see: a block page or the allowed notice.
      "/view": async (req) => {
        const p = new URL(req.url).searchParams;
        const url = p.get("url");
        if (!url) return html("<p>Missing ?url=</p>");
        const opts = optsFrom(p);
        if (opts.error) return html(`<p>${opts.error}</p>`);
        const v = await checkUrl(url, opts);
        const style = (p.get("style") === "chrome" ? "chrome" : "filter") as BlockStyle;
        return html(v.blocked ? renderBlockPage(v, style) : renderAllowedPage(v));
      },
    },
    fetch: () => json({ error: "Not found" }, 404),
  });
  return server;
}
