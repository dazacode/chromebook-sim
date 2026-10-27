// Minimal MCP server over stdio (newline-delimited JSON-RPC 2.0).
// stdout carries protocol messages only, so logs go to stderr.

import { renderBlockPage } from "./blockpage.ts";
import { checkAllProfiles, checkMany, checkUrl } from "./engine.ts";
import { scanProject } from "./scan.ts";
import { categoriesPayload } from "./server.ts";
import { installedLists, listsSummary, updateLists } from "./lists.ts";
import { PROFILES, type ProfileId } from "./rules.ts";

const PROTOCOL_VERSION = "2025-06-18";
const VERSION = "1.0.0";

const profileProp = { type: "string", enum: Object.keys(PROFILES), default: "high", description: "Grade-band policy profile to evaluate against." };

const TOOLS = [
  {
    name: "check_url",
    description:
      "Check whether a URL would be blocked on a managed K-12 school Chromebook, and why. Returns action (allow | restrict | flag | block), category, matched rules, and developer suggestions. Works on localhost URLs; pass `as` to evaluate them as their deployed host.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL or bare domain, e.g. tiktok.com or http://localhost:3000" },
        profile: profileProp,
        deep: { type: "boolean", default: false, description: "Fetch the page and classify its content (titles, keywords, proxy/game engine signatures), and check domain age via RDAP." },
        as: { type: "string", description: "Evaluate domain rules as if hosted here, e.g. myapp.vercel.app" },
        all_profiles: { type: "boolean", default: false, description: "Return results for every profile (elementary, middle, high, staff, guest)." },
      },
      required: ["url"],
    },
  },
  {
    name: "check_urls",
    description: "Batch-check many URLs against the school filter. Returns one compact verdict per URL.",
    inputSchema: {
      type: "object",
      properties: { urls: { type: "array", items: { type: "string" } }, profile: profileProp, deep: { type: "boolean", default: false } },
      required: ["urls"],
    },
  },
  {
    name: "scan_project",
    description:
      "Scan a local project directory for anything a school filter reacts to: page content that would get the site categorized as blocked (games, proxies, adult...), and third-party hosts the code calls that are blocked on school networks, so those features break for students.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Absolute path to the project directory or file." },
        profile: profileProp,
        as: { type: "string", description: "Deployed host to check, e.g. myapp.vercel.app" },
        include_build: { type: "boolean", default: false, description: "Also scan dist/build/out folders." },
      },
      required: ["path"],
    },
  },
  {
    name: "render_block_page",
    description: "Return the HTML block page a student would see for a URL (only meaningful if the URL is blocked).",
    inputSchema: {
      type: "object",
      properties: { url: { type: "string" }, profile: profileProp, style: { type: "string", enum: ["filter", "chrome"], default: "filter" } },
      required: ["url"],
    },
  },
  {
    name: "lists_status",
    description: "Show which real-world blocklists (HaGeZi, Block List Project) are downloaded and how many domains they cover. If none are installed, results rely on built-in rules only.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "update_lists",
    description: "Download or refresh the real-world blocklists into the local cache (~11 MB, or ~85 MB with full). Run once before checking, and occasionally after.",
    inputSchema: { type: "object", properties: { full: { type: "boolean", default: false, description: "Also fetch large lists: full gambling, porn, fraud, malware." } } },
  },
  {
    name: "list_categories",
    description: "List every filter category and the action each policy profile takes on it.",
    inputSchema: { type: "object", properties: {} },
  },
];

type Args = Record<string, unknown>;

async function callTool(name: string, a: Args): Promise<unknown> {
  const profile = (a.profile as ProfileId | undefined) ?? "high";
  if (!(profile in PROFILES)) throw new Error(`Unknown profile: ${profile}`);
  switch (name) {
    case "check_url": {
      const opts = { profile, deep: !!a.deep, as: a.as as string | undefined };
      if (a.all_profiles) return checkAllProfiles(String(a.url), opts);
      return checkUrl(String(a.url), opts);
    }
    case "check_urls": {
      const urls = (a.urls as unknown[]).map(String);
      const results = await checkMany(urls, { profile, deep: !!a.deep });
      return results.map((v) => ({ input: v.input, action: v.action, category: v.category.id, reason: v.primaryReason?.detail ?? v.message, code: v.primaryReason?.code }));
    }
    case "scan_project":
      return scanProject(String(a.path), { profile, as: a.as as string | undefined, includeBuild: !!a.include_build });
    case "render_block_page": {
      const v = await checkUrl(String(a.url), { profile });
      return { blocked: v.blocked, action: v.action, html: renderBlockPage(v, a.style === "chrome" ? "chrome" : "filter") };
    }
    case "list_categories":
      return categoriesPayload();
    case "lists_status":
      return { summary: listsSummary(), installed: installedLists() };
    case "update_lists": {
      const results = await updateLists({ full: !!a.full });
      return { results, summary: listsSummary() };
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

interface RpcMessage {
  jsonrpc: "2.0";
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

function send(msg: unknown) {
  process.stdout.write(JSON.stringify(msg) + "\n");
}

async function handle(msg: RpcMessage) {
  const { id, method, params } = msg;
  const reply = (result: unknown) => id !== undefined && send({ jsonrpc: "2.0", id, result });
  const fail = (code: number, message: string) => id !== undefined && send({ jsonrpc: "2.0", id, error: { code, message } });

  switch (method) {
    case "initialize":
      return reply({
        protocolVersion: (params?.protocolVersion as string) ?? PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: "chromebook-sim", version: VERSION },
        instructions:
          "Simulates a K-12 school Chromebook web filter. Use check_url to see if a site would be blocked and why, scan_project to audit a local codebase before deploying it for students.",
      });
    case "ping":
      return reply({});
    case "tools/list":
      return reply({ tools: TOOLS });
    case "tools/call": {
      const name = String(params?.name ?? "");
      try {
        const result = await callTool(name, (params?.arguments as Args) ?? {});
        return reply({ content: [{ type: "text", text: JSON.stringify(result, null, 2) }], structuredContent: Array.isArray(result) ? { results: result } : result, isError: false });
      } catch (err) {
        return reply({ content: [{ type: "text", text: err instanceof Error ? err.message : String(err) }], isError: true });
      }
    }
    default:
      if (method?.startsWith("notifications/")) return;
      return fail(-32601, `Method not found: ${method}`);
  }
}

export async function startMcp() {
  console.error("chromebook-sim MCP server ready on stdio");
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of Bun.stdin.stream()) {
    buffer += decoder.decode(chunk, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      let msg: RpcMessage;
      try {
        msg = JSON.parse(line);
      } catch {
        send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
        continue;
      }
      handle(msg).catch((err) => console.error(err));
    }
  }
}
