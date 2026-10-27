# chromebook-sim

Would a school Chromebook block this site? Paste a URL and find out: allowed, restricted, flagged, or blocked. You get the reason, the rule that matched, and the block page a student would actually see.

It's built for developers who make things students use. You can point it at your own project, either a deployed URL, `localhost`, or the source folder, to find out before launch whether the school filter will block it or break parts of it.

Zero dependencies. Runs on [Bun](https://bun.sh).

```sh
bun install
bun link                     # puts `chromebook-sim` on your PATH (optional)
chromebook-sim lists update  # download ~600k real blocklist domains (recommended)
bun start                    # simulator UI at http://127.0.0.1:4321
```

## How it decides

It models how K-12 filters are typically configured: a category database, keyword filtering, SafeSearch, and grade-band policy profiles.

| Layer | What it does |
|---|---|
| **Hand-curated rules** | ~700 domains across 38 categories, plus path rules (`youtube.com/shorts` → Social, `translate.google.com/translate` → Proxy). |
| **Real blocklists** | After `lists update`: ~600k domains from [HaGeZi](https://github.com/hagezi/dns-blocklists) and the [Block List Project](https://github.com/blocklistproject/Lists), the lists admins actually load into DNS filters and firewalls. These cover proxy/VPN/DoH bypass, NSFW, gambling, drugs and vaping, piracy and torrents, URL shorteners, dynamic DNS, social, ads and trackers, phishing, scams and badware hosts. The most specific match wins between hand rules and lists, and hand rules win ties. |
| **Allowlist** | Education, reference and productivity tools are trusted, and that overrides heuristics. `.edu`/`.gov` domains are categorized but **not** blindly trusted, because real districts still filter them. |
| **URL keywords** | Whole-word matching on the hostname and path (`sussex` doesn't trip `sex`), plus run-together hostnames like `unblockedgames76`. |
| **SafeSearch** | Google and Bing are allowed with SafeSearch enforced, and search queries are filtered. Other search engines are blocked. |
| **Heuristics** | Raw IP navigation, `chrome://` and `javascript:` URLs, punycode look-alike domains, non-standard ports, URL shorteners, and free-hosting subdomains. |
| **Content (`--deep`)** | Fetches the page with a Chromebook user agent and scores the title, meta tags, headings and body. It also detects Ultraviolet/Scramjet/Rammerhead proxies, tab cloaking, Unity WebGL, Ruffle, EmulatorJS and Eaglercraft, and checks embedded iframes and redirects. |
| **Domain age (`--deep`)** | Looks up the registration date over RDAP. Domains under 30 days old are blocked, as many vendors do. |

**Actions**

- `allow`: the page loads.
- `restrict`: the page loads with SafeSearch or YouTube Restricted Mode enforced.
- `flag`: the page loads, but the visit is logged for a teacher or admin.
- `block`: the student sees the block page.

**Profiles:** `elementary`, `middle`, `high` (default), `staff` and `guest` (visitor Wi-Fi, the strictest). CIPA categories (adult, gambling, drugs, weapons, violence/hate, dating) and malware/phishing are blocked under every profile. Run `chromebook-sim categories` to see the full matrix.

Some profile behavior comes from real district records in [The Markup's 2024 investigation](https://themarkup.org/show-your-work/2024/04/13/how-we-investigated-web-censorship-in-schools):
- Sex-ed and LGBTQ+ resources are "High School Allowed", meaning blocked for younger grades.
- Entertainment is a heavily blocked category.
- The guest network blocks health sites like cdc.gov.

Every non-allowlisted verdict also links to vendors' public lookup pages (Palo Alto, FortiGuard, Talos), so you can compare against a real categorization.

## CLI

```sh
chromebook-sim check tiktok.com khanacademy.org
chromebook-sim youtube.com --all-profiles             # bare URL works too
chromebook-sim check "google.com/search?q=vape" --json
chromebook-sim check http://localhost:3000 --as mygame.vercel.app --deep
chromebook-sim scan ./my-project --as myapp.vercel.app --profile middle
cat urls.txt | chromebook-sim batch --json --fail-on flag    # JSON Lines
chromebook-sim page discord.com --style chrome > blocked.html
chromebook-sim categories
chromebook-sim lists update [--full]                          # --full adds ~85 MB more (full gambling, porn, malware, fraud)
chromebook-sim lists status
chromebook-sim check stake.com --no-lists                     # built-in rules only
```

Lists are cached in `~/.cache/chromebook-sim/lists` (override with `CHROMEBOOK_SIM_CACHE`). They're downloaded rather than bundled, so each list keeps its own license: HaGeZi is GPL-3.0, and the Block List Project is MIT per its file headers.

Without `bun link`, use `bun src/cli.ts …` instead.

**Exit codes:** `0` means nothing crossed the threshold. `1` means something was blocked (or flagged, with `--fail-on flag`). `2` is a usage error or an invalid URL. Pass `--fail-on never` to always exit 0.

### Checking your own project

1. **Deployed site:** `chromebook-sim check https://mysite.com --deep`
2. **Local dev server:** `chromebook-sim check http://localhost:5173 --deep --as mysite.vercel.app`. `--as` applies the domain rules for the host you'll deploy to, and `--deep` classifies what the page actually serves.
3. **Source folder:** `chromebook-sim scan . --as mysite.vercel.app` reads HTML/JS/TS/etc. and reports:
   - page content that would get the site categorized as Games, Proxy, and so on;
   - third-party hosts your code calls that are blocked for students (an AI API called straight from the browser, a Discord invite, a YouTube embed for elementary), because those features will break on a school network.

In CI:

```yaml
- run: bunx --bun chromebook-sim scan . --as myapp.vercel.app --profile middle --fail-on block
```

## HTTP API

Start the server with `chromebook-sim serve [--port 4321] [--host 127.0.0.1]`.

| Endpoint | |
|---|---|
| `GET /api/check?url=…&profile=high&deep=1&as=host&all=1` | Verdict JSON (`all=1` returns every profile) |
| `POST /api/check` `{ "url" \| "urls", "profile", "deep", "as", "html" }` | Single or batch check. `html` classifies markup you pass in |
| `GET /api/simulate?url=…` | Verdict, per-profile matrix, and the rendered page (what the UI uses) |
| `GET /view?url=…&style=filter\|chrome` | The literal block page or allowed page as HTML |
| `GET /api/lists` | Installed blocklists and domain count |
| `GET /api/categories`, `GET /api/profiles`, `GET /health` | |

## MCP (for agents)

`.mcp.json` in this repo registers the server for Claude Code when you're working in this folder. To use it from any other project:

```sh
claude mcp add chromebook-sim -- bun "/absolute/path/to/schoolchromebook sim/src/cli.ts" mcp
```

| Tool | Purpose |
|---|---|
| `check_url` | One URL, with `profile`, `deep`, `as` and `all_profiles` |
| `check_urls` | Batch check, returning compact results |
| `scan_project` | Audit a local directory before deploying |
| `render_block_page` | The HTML a student would see |
| `lists_status` / `update_lists` | See or refresh the downloaded blocklists |
| `list_categories` | Categories × profile actions |

## Verdict shape

```jsonc
{
  "input": "unblockedgames76.github.io",
  "url": "https://unblockedgames76.github.io/",
  "host": "unblockedgames76.github.io",
  "evaluatedHost": "unblockedgames76.github.io",
  "profile": "high",
  "action": "block",              // allow | restrict | flag | block
  "blocked": true,
  "category": { "id": "games", "name": "Games", "cipa": false },
  "message": "Gaming sites are blocked during instructional time.",
  "primaryReason": { "code": "keyword_in_domain", "source": "url_keyword", "category": "games", "action": "block", "detail": "…", "matched": "unblocked" },
  "reasons": [ /* every rule that matched */ ],
  "enforcement": [],              // e.g. SafeSearch / Restricted Mode
  "riskScore": 88,
  "suggestions": [ "…" ],         // legitimate next steps for a developer
  "local": false,
  "content": { "fetched": true, "status": 200, "finalUrl": "…", "report": { "title": "…", "scores": {}, "signatures": [], "detected": [] } },
  "checkedAt": "2026-10-26T22:01:00.000Z"
}
```

## Customizing

- `src/rules.ts` holds the categories, profile actions, domain lists, keywords and content signatures. Edit it to match your district.
- `CHROMEBOOK_SIM_DISTRICT="Your District"` changes the name on the block page.

## Limits

This is a simulation. The blocklists are real, but they're community DNS lists, not a filter vendor's proprietary database. Real filters also use ML classifiers and district-specific allow and block lists, and no public dataset of actual district blocklists exists. Treat a result here as a realistic estimate, not a guarantee. The fix for an unfair block is to ask district IT or your filter vendor to recategorize the site.

```sh
bun test
```
