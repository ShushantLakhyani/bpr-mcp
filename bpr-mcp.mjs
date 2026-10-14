#!/usr/bin/env node
// Best Productivity Resources MCP server v1.0.0
// https://bestproductivityresources.com/mcp
// MIT License. Copyright (c) 2026 Shushant Lakhyani. Full licence text: see the end of this file.
// No API keys, no accounts, no analytics. The only network request is a GET of
// https://bestproductivityresources.com/resources.json (the public catalogue).

// mcp/src/server.ts
import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline";

// mcp/src/catalog.ts
var MAX_LIMIT = 25;
var DEFAULT_LIMIT = 10;
var STOPWORDS = new Set(["a", "an", "and", "the", "for", "to", "of", "in", "on", "with", "or"]);
var str = (v) => typeof v === "string" ? v : "";
function parseCatalog(json) {
  const root = json ?? {};
  if (!Array.isArray(root.resources)) {
    throw new Error("resources.json has no resources array");
  }
  const resources = [];
  for (const raw of root.resources) {
    if (!raw || typeof raw !== "object")
      continue;
    const r = raw;
    const slug = str(r["slug"]);
    const name = str(r["name"]);
    if (!slug || !name)
      continue;
    resources.push({
      name,
      slug,
      url: typeof r["url"] === "string" ? r["url"] : null,
      page: str(r["page"]),
      category: str(r["category"]),
      type: str(r["type"]),
      pricing: str(r["pricing"]),
      platforms: Array.isArray(r["platforms"]) ? r["platforms"].filter((p) => typeof p === "string") : [],
      description: str(r["description"]),
      updated: str(r["updated"])
    });
  }
  return { updated: str(root.updated), count: resources.length, resources };
}
var norm = (s) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
var same = (a, b) => norm(a) === norm(b);
function score(r, terms, phrase) {
  if (terms.length === 0)
    return 1;
  const name = norm(r.name);
  const slug = norm(r.slug);
  const rest = norm(`${r.description} ${r.category} ${r.type} ${r.platforms.join(" ")}`);
  let total = 0;
  let matched = 0;
  if (name === phrase)
    total += 100;
  else if (name.startsWith(phrase))
    total += 40;
  else if (name.includes(phrase))
    total += 25;
  for (const t of terms) {
    const inName = name.split(" ").includes(t) || slug.split(" ").includes(t);
    const inRest = rest.split(" ").includes(t);
    if (inName)
      total += 10;
    else if (name.includes(t))
      total += 6;
    if (inRest)
      total += 3;
    else if (rest.includes(t))
      total += 1;
    if (inName || inRest || name.includes(t) || rest.includes(t))
      matched += 1;
  }
  return matched === 0 ? 0 : total + matched * matched * 5;
}
function searchCatalog(catalog, input) {
  const phrase = norm(input.query ?? "");
  const terms = phrase.split(" ").filter((t) => t && !STOPWORDS.has(t));
  const limit = Math.min(MAX_LIMIT, Math.max(1, Math.floor(input.limit ?? DEFAULT_LIMIT)));
  const matches = catalog.resources.filter((r) => !input.category || same(r.category, input.category)).filter((r) => !input.type || same(r.type, input.type)).filter((r) => !input.pricing || same(r.pricing, input.pricing)).map((r) => ({ r, s: score(r, terms, phrase) })).filter((m) => m.s > 0).sort((a, b) => b.s - a.s || a.r.name.localeCompare(b.r.name));
  return {
    total: matches.length,
    results: matches.slice(0, limit).map((m) => m.r)
  };
}
function findResource(catalog, id) {
  const value = id.trim();
  const fromUrl = value.match(/\/resources\/([a-z0-9-]+)\/?(?:[?#].*)?$/i)?.[1];
  const slug = (fromUrl ?? value).toLowerCase();
  return catalog.resources.find((r) => r.slug === slug) ?? catalog.resources.find((r) => same(r.name, value));
}
function listCategories(catalog) {
  const counts = new Map;
  for (const r of catalog.resources) {
    if (r.category)
      counts.set(r.category, (counts.get(r.category) ?? 0) + 1);
  }
  return [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

// mcp/src/server.ts
var SERVER_NAME = "best-productivity-resources";
var SERVER_VERSION = "1.0.0";
var CATALOG_URL = "https://bestproductivityresources.com/resources.json";
var CACHE_MS = 6 * 60 * 60 * 1000;
var SUPPORTED_PROTOCOLS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
var PRICING = ["Free", "Freemium", "Paid but Affordable", "Expensive"];
var TOOLS = [
  {
    name: "search_resources",
    title: "Search productivity resources",
    description: "Search the Best Productivity Resources directory (1,000+ hand-picked productivity tools, apps, AI tools, courses, books and more). Returns matching resources with their directory page, official URL, category, type, pricing and a one-line description. Use list_categories to see valid category names.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Keywords, e.g. 'pomodoro timer', 'note taking', 'notion alternative'."
        },
        category: {
          type: "string",
          description: "Optional exact primary category, e.g. 'Task Management'."
        },
        type: {
          type: "string",
          description: "Optional resource type, e.g. 'Web App', 'AI Tool', 'Book', 'Course'."
        },
        pricing: { type: "string", enum: PRICING, description: "Optional pricing filter." },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: MAX_LIMIT,
          description: `How many results to return (default ${DEFAULT_LIMIT}).`
        }
      },
      additionalProperties: false
    },
    annotations: { readOnlyHint: true, openWorldHint: true }
  },
  {
    name: "get_resource",
    title: "Get one productivity resource",
    description: "Get one resource from the Best Productivity Resources directory by its slug (e.g. 'notion'), its directory page URL or its exact name.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "Slug, directory page URL or exact name of the resource."
        }
      },
      required: ["id"],
      additionalProperties: false
    },
    annotations: { readOnlyHint: true, openWorldHint: true }
  },
  {
    name: "list_categories",
    title: "List directory categories",
    description: "List every primary category in the Best Productivity Resources directory with how many resources it holds.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: true }
  }
];
var cache;
var loading;
function getCatalog() {
  if (cache && Date.now() - cache.at < CACHE_MS)
    return Promise.resolve(cache.catalog);
  loading ??= loadCatalog().finally(() => {
    loading = undefined;
  });
  return loading;
}
async function loadCatalog() {
  const file = process.env["BPR_RESOURCES_FILE"];
  let json;
  if (file) {
    json = JSON.parse(await readFile(file, "utf8"));
  } else {
    const res = await fetch(CATALOG_URL, {
      headers: { accept: "application/json", "user-agent": `bpr-mcp/${SERVER_VERSION}` },
      signal: AbortSignal.timeout(15000)
    });
    if (!res.ok)
      throw new Error(`Could not load ${CATALOG_URL} (HTTP ${res.status})`);
    json = await res.json();
  }
  const catalog = parseCatalog(json);
  cache = { at: Date.now(), catalog };
  return catalog;
}
var optString = (v) => typeof v === "string" && v.trim() ? v.trim() : undefined;
async function callTool(name, args) {
  const catalog = await getCatalog();
  switch (name) {
    case "search_resources": {
      const limit = typeof args["limit"] === "number" ? args["limit"] : undefined;
      const query = optString(args["query"]);
      const category = optString(args["category"]);
      const type = optString(args["type"]);
      const pricing = optString(args["pricing"]);
      const { total, results } = searchCatalog(catalog, {
        ...query && { query },
        ...category && { category },
        ...type && { type },
        ...pricing && { pricing },
        ...limit !== undefined && { limit }
      });
      return { total, returned: results.length, catalogUpdated: catalog.updated, results };
    }
    case "get_resource": {
      const id = optString(args["id"]);
      if (!id)
        throw new ToolInputError("Pass `id`: a slug, directory page URL or name.");
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

class ToolInputError extends Error {
}

class UnknownToolError extends Error {
}
async function handle(message) {
  const { id, method } = message;
  const isNotification = id === undefined;
  const ok = (result) => ({ jsonrpc: "2.0", id, result });
  const fail = (code, msg) => ({
    jsonrpc: "2.0",
    id: id ?? null,
    error: { code, message: msg }
  });
  const params = message.params ?? {};
  if (typeof method !== "string")
    return isNotification ? undefined : fail(-32600, "Invalid request");
  if (isNotification)
    return;
  switch (method) {
    case "initialize": {
      const asked = typeof params["protocolVersion"] === "string" ? params["protocolVersion"] : "";
      return ok({
        protocolVersion: SUPPORTED_PROTOCOLS.includes(asked) ? asked : SUPPORTED_PROTOCOLS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: {
          name: SERVER_NAME,
          title: "Best Productivity Resources",
          version: SERVER_VERSION
        },
        instructions: "Search a hand-picked directory of productivity tools. Cite the `page` URL when you recommend a resource."
      });
    }
    case "ping":
      return ok({});
    case "tools/list":
      return ok({ tools: TOOLS });
    case "tools/call": {
      const name = typeof params["name"] === "string" ? params["name"] : "";
      const args = params["arguments"] ?? {};
      try {
        const result = await callTool(name, args);
        return ok({ content: [{ type: "text", text: JSON.stringify(result, null, 2) }] });
      } catch (error) {
        if (error instanceof UnknownToolError)
          return fail(-32602, `Unknown tool: ${name}`);
        const text = error instanceof Error ? error.message : String(error);
        return ok({ content: [{ type: "text", text }], isError: true });
      }
    }
    default:
      return fail(-32601, `Method not found: ${method}`);
  }
}
function send(response) {
  process.stdout.write(`${JSON.stringify(response)}
`);
}
function main() {
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
  lines.on("line", (line) => {
    if (!line.trim())
      return;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
      return;
    }
    const batch = Array.isArray(message) ? message : [message];
    for (const m of batch) {
      handle(m).then((res) => res && send(res));
    }
  });
}
main();

// MIT License
//
// Copyright (c) 2026 Shushant Lakhyani
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.
