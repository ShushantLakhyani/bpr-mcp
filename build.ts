/**
 * Bundles src/ into one dependency-free file (the same file bestproductivityresources.com serves):
 *   bpr-mcp.mjs  (run it with `node bpr-mcp.mjs`, Node 18 or newer)
 *
 *   bun build.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = import.meta.dirname;
// BPR_MCP_OUT lets the freshness test build to a temporary file.
const out = process.env["BPR_MCP_OUT"] ?? join(root, "bpr-mcp.mjs");
const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
  version: string;
};

const result = await Bun.build({
  entrypoints: [join(root, "src", "server.ts")],
  target: "node",
  format: "esm",
  minify: false,
});
if (!result.success) {
  console.error(result.logs);
  process.exit(1);
}
const code = await result.outputs[0]!.text();
const header = `#!/usr/bin/env node
// Best Productivity Resources MCP server v${version}
// https://bestproductivityresources.com/mcp
// MIT License. Copyright (c) 2026 Shushant Lakhyani. Full licence text: see the end of this file.
// No API keys, no accounts, no analytics. The only network request is a GET of
// https://bestproductivityresources.com/resources.json (the public catalogue).
`;
const licence = readFileSync(join(root, "LICENSE"), "utf8")
  .trim()
  .split("\n")
  .map((l) => `// ${l}`.trimEnd())
  .join("\n");
writeFileSync(out, `${header}\n${code.trim()}\n\n${licence}\n`);
console.log(`Wrote ${out}`);
