import type { Verdict } from "./engine.ts";
import { PROFILES } from "./rules.ts";

export type BlockStyle = "filter" | "chrome";

export const DISTRICT_NAME = process.env.CHROMEBOOK_SIM_DISTRICT ?? "Lakeview Unified School District";

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function refId(v: Verdict) {
  const h = new Bun.CryptoHasher("sha1").update(`${v.url}|${v.profile}|${v.checkedAt}`).digest("hex");
  return `WF-${h.slice(0, 4).toUpperCase()}-${h.slice(4, 8).toUpperCase()}`;
}

const shell = (title: string, css: string, body: string) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><style>${css}</style></head><body>${body}</body></html>`;

const reasonsTable = (v: Verdict) =>
  v.reasons
    .map((r) => `<tr><td><code>${esc(r.code)}</code></td><td><span class="act act-${r.action}">${r.action}</span></td><td>${esc(r.detail)}</td></tr>`)
    .join("");

export function renderBlockPage(v: Verdict, style: BlockStyle = "filter"): string {
  return style === "chrome" ? chromeStyle(v) : filterStyle(v);
}

function chromeStyle(v: Verdict): string {
  const host = v.host ?? v.input;
  return shell(
    `${host} is blocked`,
    `
    body{margin:0;background:#fff;color:#202124;font:15px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
    main{max-width:600px;margin:14vh auto 0;padding:0 24px}
    .icon{width:72px;height:72px;margin-bottom:36px;color:#5f6368}
    h1{font-size:1.6em;font-weight:500;margin:0 0 16px;word-break:break-all}
    p{color:#5f6368;margin:0 0 12px}
    .code{font-size:.82em;color:#5f6368;text-transform:uppercase;margin-top:20px;letter-spacing:.02em}
    details{margin-top:28px;color:#5f6368;font-size:.9em} summary{cursor:pointer;color:#1a73e8}
    @media (prefers-color-scheme:dark){body{background:#202124;color:#e8eaed}p,.code,.icon,details{color:#9aa0a6}summary{color:#8ab4f8}}`,
    `<main>
      <svg class="icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 7V3H2v18h20V7H12zM6 19H4v-2h2v2zm0-4H4v-2h2v2zm0-4H4V9h2v2zm0-4H4V5h2v2zm4 12H8v-2h2v2zm0-4H8v-2h2v2zm0-4H8V9h2v2zm0-4H8V5h2v2zm10 12h-8v-2h2v-2h-2v-2h2v-2h-2V9h8v10zm-2-8h-2v2h2v-2zm0 4h-2v2h2v-2z"/></svg>
      <h1>${esc(host)} is blocked</h1>
      <p>Your organization doesn't allow you to view this site.</p>
      <p>${esc(v.message)}</p>
      <div class="code">ERR_BLOCKED_BY_ADMINISTRATOR</div>
      <details><summary>Details</summary><p>Category: ${esc(v.category.name)} · Policy: ${esc(PROFILES[v.profile].name)}</p>
      ${v.reasons.map((r) => `<p>• ${esc(r.detail)}</p>`).join("")}</details>
    </main>`,
  );
}

function filterStyle(v: Verdict): string {
  const ref = refId(v);
  const time = new Date(v.checkedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
  return shell(
    "Site Blocked",
    `
    :root{--bg:#f3f5f9;--card:#fff;--ink:#1d2433;--muted:#5d6678;--line:#e3e7ef;--accent:#c62828;--accent-soft:#fdecea;--brand:#24407a;--on-brand:#fff}
    @media (prefers-color-scheme:dark){:root{--bg:#12151c;--card:#1b2029;--ink:#e7eaf0;--muted:#9aa3b5;--line:#2b3240;--accent:#ff6b6b;--accent-soft:#3a1f22;--brand:#8fb0ff;--on-brand:#0f1a33}}
    *{box-sizing:border-box} body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
    header{display:flex;align-items:center;gap:10px;padding:14px 24px;border-bottom:1px solid var(--line);background:var(--card)}
    header .seal{width:30px;height:30px;border-radius:8px;background:var(--brand);color:var(--on-brand);display:grid;place-items:center;font-weight:700;font-size:13px}
    header b{font-size:14px} header span{color:var(--muted);font-size:13px}
    main{max-width:720px;margin:48px auto;padding:0 16px}
    .card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:36px;box-shadow:0 8px 30px rgba(20,30,60,.06)}
    .badge{display:inline-flex;align-items:center;gap:8px;background:var(--accent-soft);color:var(--accent);font-weight:600;font-size:13px;padding:6px 12px;border-radius:999px}
    h1{font-size:28px;margin:18px 0 8px;letter-spacing:-.01em}
    .url{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13.5px;background:var(--bg);border:1px solid var(--line);padding:10px 12px;border-radius:10px;word-break:break-all;margin:16px 0}
    .why{font-size:16px;margin:0 0 22px}
    dl{display:grid;grid-template-columns:140px 1fr;gap:8px 16px;margin:0 0 24px;font-size:14px} dt{color:var(--muted)} dd{margin:0}
    .actions{display:flex;gap:10px;flex-wrap:wrap}
    button{font:inherit;font-size:14px;font-weight:600;padding:10px 18px;border-radius:10px;border:1px solid var(--line);background:var(--card);color:var(--ink);cursor:pointer}
    button.primary{background:var(--brand);border-color:var(--brand);color:var(--on-brand)}
    .toast{display:none;margin-top:16px;padding:10px 14px;border-radius:10px;background:var(--bg);font-size:14px}
    details{margin-top:28px;font-size:13.5px} summary{cursor:pointer;color:var(--muted)}
    table{width:100%;border-collapse:collapse;margin-top:10px} td{border-top:1px solid var(--line);padding:8px 6px;vertical-align:top}
    code{font-size:12px} .act{font-size:11px;font-weight:700;text-transform:uppercase;padding:2px 6px;border-radius:6px;background:var(--bg)}
    .act-block{color:var(--accent)} .act-flag{color:#b26a00}
    footer{color:var(--muted);font-size:12.5px;text-align:center;margin-top:20px}
    @media (max-width:560px){.card{padding:24px}dl{grid-template-columns:1fr}dt{margin-top:6px}}`,
    `<header><div class="seal">WF</div><div><b>${esc(DISTRICT_NAME)}</b><br><span>Web Filter · Managed Chromebook</span></div></header>
    <main><div class="card">
      <span class="badge">● Blocked by your school</span>
      <h1>This site is blocked</h1>
      <div class="url">${esc(v.url ?? v.input)}</div>
      <p class="why">${esc(v.message)}</p>
      <dl>
        <dt>Category</dt><dd>${esc(v.category.name)}${v.category.cipa ? " · CIPA protected" : ""}</dd>
        <dt>Reason</dt><dd>${esc(v.primaryReason?.detail ?? "Blocked by policy")}</dd>
        <dt>Policy</dt><dd>${esc(PROFILES[v.profile].name)}</dd>
        <dt>Time</dt><dd>${esc(time)}</dd>
        <dt>Reference</dt><dd><code>${ref}</code></dd>
      </dl>
      <div class="actions">
        <button onclick="window.parent!==window?window.parent.postMessage({type:'sim-back'},'*'):history.back()">Go back</button>
        ${v.category.cipa ? "" : `<button class="primary" onclick="document.querySelector('.toast').style.display='block';this.disabled=true">Request access</button>`}
      </div>
      <div class="toast">Request sent to your teacher for review (simulated). Reference <code>${ref}</code>.</div>
      <details><summary>Technical details (${v.reasons.length} rule${v.reasons.length === 1 ? "" : "s"} matched)</summary>
        <table>${reasonsTable(v)}</table></details>
    </div>
    <footer>Activity on school devices is monitored per the district Acceptable Use Policy. · Simulated by chromebook-sim</footer></main>`,
  );
}

/** What the simulator shows for allowed / restricted / flagged sites. */
export function renderAllowedPage(v: Verdict): string {
  const tone = v.action === "flag" ? ["#b26a00", "#fff4e0", "Allowed · Flagged"] : v.action === "restrict" ? ["#1a5fb4", "#e7f0fc", "Allowed · Restricted"] : ["#1e7b34", "#e6f4ea", "Allowed"];
  return shell(
    "Allowed",
    `
    *{box-sizing:border-box} body{margin:0;background:#f3f5f9;color:#1d2433;font:15px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
    @media (prefers-color-scheme:dark){body{background:#12151c;color:#e7eaf0}.card{background:#1b2029!important;border-color:#2b3240!important}.url{background:#12151c!important;border-color:#2b3240!important}}
    main{max-width:680px;margin:56px auto;padding:0 16px}
    .card{background:#fff;border:1px solid #e3e7ef;border-radius:16px;padding:32px}
    .badge{display:inline-block;font-weight:700;font-size:13px;padding:6px 12px;border-radius:999px;color:${tone[0]};background:${tone[1]}}
    h1{font-size:24px;margin:16px 0 6px} .url{font-family:ui-monospace,Menlo,monospace;font-size:13px;background:#f3f5f9;border:1px solid #e3e7ef;padding:10px 12px;border-radius:10px;word-break:break-all;margin:14px 0}
    ul{padding-left:20px} a{color:#1a73e8;font-weight:600}`,
    `<main><div class="card">
      <span class="badge">${tone[2]}</span>
      <h1>${esc(v.host ?? v.input)} would load on a student Chromebook</h1>
      <div class="url">${esc(v.url)}</div>
      <p>${esc(v.message)}</p>
      ${v.enforcement.length ? `<ul>${v.enforcement.map((e) => `<li>${esc(e)}</li>`).join("")}</ul>` : ""}
      <p><a href="${esc(v.url)}" target="_blank" rel="noopener noreferrer">Open the real site in a new tab ↗</a></p>
    </div></main>`,
  );
}
