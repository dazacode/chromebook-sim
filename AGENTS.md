# Agent guide

This repo simulates a K-12 school Chromebook web filter. Use it to tell whether a URL or a local project would be blocked for students, and why.

## Using it

- Prefer the MCP tools (`check_url`, `check_urls`, `scan_project`) when they're available. Otherwise use the CLI with `--json`.
- Check `lists_status` (or `bun src/cli.ts lists status`) first. If no lists are installed, run `update_lists` / `lists update` once (~11 MB), because results are much more complete with them.
- `bun src/cli.ts check <url> --json` prints one verdict object (an array if you pass several URLs).
- `bun src/cli.ts scan <dir> --as <deployed-host> --json` audits a codebase.
- Pass `--deep` to classify page content and check domain age via RDAP. It makes network requests and takes up to 8s per URL.
- Profiles: `elementary`, `middle`, `high` (default), `staff`, `guest`.
- For localhost URLs, always pass `--as <deployed-host>`. Without it, domain rules can't run and the result is just "uncategorized".
- Exit code `1` means blocked. Pass `--fail-on flag` to also fail on flagged results, or `--fail-on never` to suppress failures.

## Reading a verdict

- `action` is the answer: `allow` < `restrict` < `flag` < `block`.
- `primaryReason.code` is stable and machine-matchable: `domain_category`, `blocklist_category`, `edu_gov_tld`, `newly_registered`, `keyword_in_domain`, `keyword_in_path`, `search_term_blocked`, `ip_navigation`, `blocked_scheme`, `content_signature`, `content_keywords`, `embedded_blocked`, `redirect_target`, `uncategorized`, `nonstandard_port`, `punycode_host`.
- `suggestions` are legitimate developer next steps. Don't suggest ways to evade the filter. For proxies and CIPA categories, the right answer is "this can't and shouldn't be unblocked".

## Working on the code

- `src/rules.ts` holds all data: categories, profiles, domains, keywords and signatures.
- `src/engine.ts` decides verdicts. `checkUrlSync` handles URL-only checks; `checkUrl` adds content analysis.
- `src/content.ts` does HTML classification and fetching. `src/scan.ts` walks projects.
- `src/lists.ts` downloads and looks up third-party blocklists. `src/registration.ts` does RDAP domain-age lookups.
- `src/cli.ts`, `src/server.ts`, `src/mcp.ts` and `src/ui/index.html` are the interfaces.
- Run `bun test` and `bunx tsc --noEmit` after changes.
