/**
 * Best Productivity Resources MCP server (MIT licence, see mcp/LICENSE).
 *
 * A dependency-free Model Context Protocol server over stdio. It reads the public catalogue at
 * https://bestproductivityresources.com/resources.json and exposes three read-only tools:
 * search_resources, get_resource and list_categories.
 *
 * Privacy: no API keys, no accounts, no analytics. The only network request is a plain GET of
 * the public catalogue (cached in memory for six hours). Your queries never leave your machine.
 */
import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import {
  type Catalog,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  findResource,
  listCategories,
  parseCatalog,
  searchCatalog,
} from "./catalog";

const SERVER_NAME = "best-productivity-resources";
const SERVER_VERSION = "1.0.0";
const CATALOG_URL = "https://bestproductivityresources.com/resources.json";
const CACHE_MS = 6 * 60 * 60 * 1000;
const SUPPORTED_PROTOCOLS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];

const PRICING = ["Free", "Freemium", "Paid but Affordable", "Expensive"];

const TOOLS = [
  {
    name: "search_resources",
    title: "Search productivity resources",
    description:
      "Search the Best Productivity Resources directory (1,000+ hand-picked productivity tools, apps, AI tools, courses, books and more). Returns matching resources with their directory page, official URL, category, type, pricing and a one-line description. Use list_categories to see valid category names.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Keywords, e.g. 'pomodoro timer', 'note taking', 'notion alternative'.",
        },
        category: {
          type: "string",
          description: "Optional exact primary category, e.g. 'Task Management'.",
        },
        type: {
          type: "string",
          description: "Optional resource type, e.g. 'Web App', 'AI Tool', 'Book', 'Course'.",
        },
        pricing: { type: "string", enum: PRICING, description: "Optional pricing filter." },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: MAX_LIMIT,
          description: `How many results to return (default ${DEFAULT_LIMIT}).`,
        },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  {
    name: "get_resource",
    title: "Get one productivity resource",
    description:
      "Get one resource from the Best Productivity Resources directory by its slug (e.g. 'notion'), its directory page URL or its exact name.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "Slug, directory page URL or exact name of the resource.",
        },
      },
      required: ["id"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  {
    name: "list_categories",
    title: "List directory categories",
    description:
      "List every primary category in the Best Productivity Resources directory with how many resources it holds.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
] as const;

let cache: { at: number; catalog: Catalog } | undefined;
let loading: Promise<Catalog> | undefined;

/** The cached catalogue; parallel calls share one download. */
function getCatalog(): Promise<Catalog> {
  if (cache && Date.now() - cache.at < CACHE_MS) return Promise.resolve(cache.catalog);
  loading ??= loadCatalog().finally(() => {
    loading = undefined;
  });
  return loading;
}

/** The catalogue, from BPR_RESOURCES_FILE (offline use and tests) or the public URL. */
async function loadCatalog(): Promise<Catalog> {
  const file = process.env["BPR_RESOURCES_FILE"];
  let json: unknown;
  if (file) {
    json = JSON.parse(await readFile(file, "utf8")) as unknown;
  } else {
    const res = await fetch(CATALOG_URL, {
      headers: { accept: "application/json", "user-agent": `bpr-mcp/${SERVER_VERSION}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Could not load ${CATALOG_URL} (HTTP ${res.status})`);
    json = (await res.json()) as unknown;
  }
  const catalog = parseCatalog(json);
  cache = { at: Date.now(), catalog };
  return catalog;
}

type Args = Record<string, unknown>;
const optString = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

async function callTool(name: string, args: Args): Promise<unknown> {
  const catalog = await getCatalog();
  switch (name) {
    case "search_resources": {
      const limit = typeof args["limit"] === "number" ? args["limit"] : undefined;
      const query = optString(args["query"]);
      const category = optString(args["category"]);
      const type = optString(args["type"]);
      const pricing = optString(args["pricing"]);
      const { total, results } = searchCatalog(catalog, {
        ...(query && { query }),
        ...(category && { category }),
        ...(type && { type }),
        ...(pricing && { pricing }),
        ...(limit !== undefined && { limit }),
      });
      return { total, returned: results.length, catalogUpdated: catalog.updated, results };
    }
    case "get_resource": {
      const id = optString(args["id"]);
      if (!id) throw new ToolInputError("Pass `id`: a slug, directory page URL or name.");
      const found = findResource(catalog, id);
      if (!found) {
        throw new ToolInputError(`No resource matches "${id}". Try search_resources instead.`);
      }
      return found;
    }
    case "list_categories":
      return { total: catalog.count, categories: listCategories(catalog) };
    default:
      throw new UnknownToolError(name);
  }
}

class ToolInputError extends Error {}
class UnknownToolError extends Error {}

type Request = { jsonrpc: "2.0"; id?: string | number | null; method?: string; params?: unknown };

/** Handle one JSON-RPC message; returns the response, or undefined for notifications. */
async function handle(message: Request): Promise<object | undefined> {
  const { id, method } = message;
  const isNotification = id === undefined;
  const ok = (result: unknown) => ({ jsonrpc: "2.0", id, result });
  const fail = (code: number, msg: string) => ({
    jsonrpc: "2.0",
    id: id ?? null,
    error: { code, message: msg },
  });
  const params = (message.params ?? {}) as Args;

  if (typeof method !== "string")
    return isNotification ? undefined : fail(-32600, "Invalid request");
  if (isNotification) return undefined;

  switch (method) {
    case "initialize": {
      const asked = typeof params["protocolVersion"] === "string" ? params["protocolVersion"] : "";
      return ok({
        protocolVersion: SUPPORTED_PROTOCOLS.includes(asked) ? asked : SUPPORTED_PROTOCOLS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: {
          name: SERVER_NAME,
          title: "Best Productivity Resources",
          version: SERVER_VERSION,
        },
        instructions:
          "Search a hand-picked directory of productivity tools. Cite the `page` URL when you recommend a resource.",
      });
    }
    case "ping":
      return ok({});
    case "tools/list":
      return ok({ tools: TOOLS });
    case "tools/call": {
      const name = typeof params["name"] === "string" ? params["name"] : "";
      const args = (params["arguments"] ?? {}) as Args;
      try {
        const result = await callTool(name, args);
        return ok({ content: [{ type: "text", text: JSON.stringify(result, null, 2) }] });
      } catch (error) {
        if (error instanceof UnknownToolError) return fail(-32602, `Unknown tool: ${name}`);
        const text = error instanceof Error ? error.message : String(error);
        return ok({ content: [{ type: "text", text }], isError: true });
      }
    }
    default:
      return fail(-32601, `Method not found: ${method}`);
  }
}

function send(response: object) {
  process.stdout.write(`${JSON.stringify(response)}\n`);
}

/** Newline-delimited JSON-RPC over stdin/stdout, as the MCP stdio transport specifies. */
function main() {
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
  lines.on("line", (line) => {
    if (!line.trim()) return;
    let message: unknown;
    try {
      message = JSON.parse(line) as unknown;
    } catch {
      send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
      return;
    }
    const batch = Array.isArray(message) ? message : [message];
    for (const m of batch) {
      void handle(m as Request).then((res) => res && send(res));
    }
  });
  // No exit on stdin close: Node exits by itself once in-flight replies are written.
}

main();
