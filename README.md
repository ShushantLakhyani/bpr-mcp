# Best Productivity Resources MCP server

A small, free [Model Context Protocol](https://modelcontextprotocol.io) server that lets Claude, Cursor and other MCP clients search the [Best Productivity Resources](https://bestproductivityresources.com) directory: 1,000+ hand-picked productivity tools, apps, AI tools, courses, books and more.

- **No API keys, no account, no analytics.** The only network request it makes is a plain GET of the public catalogue at <https://bestproductivityresources.com/resources.json>, cached in memory for six hours. Your questions stay on your machine.
- **No dependencies.** One file, runs on Node.js 18 or newer.
- **Read-only.** It cannot change anything anywhere.
- **MIT licensed.** See [LICENSE](./LICENSE).

## Tools

| Tool               | What it does                                                                                                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `search_resources` | Keyword search with optional `category`, `type` and `pricing` (`Free`, `Freemium`, `Paid but Affordable`, `Expensive`) filters and a `limit` (1 to 25, default 10). |
| `get_resource`     | One resource by slug (`notion`), directory page URL or exact name.                                                                                                  |
| `list_categories`  | Every primary category with its resource count.                                                                                                                     |

Each result has the resource's name, slug, official `url`, directory `page`, category, type, pricing, platforms, a one-line description and the date it was last updated.

## Install

1. Download the server (one file):

   ```bash
   curl -o ~/bpr-mcp.mjs https://bestproductivityresources.com/downloads/bpr-mcp.mjs
   ```

   or `git clone https://github.com/ShushantLakhyani/bpr-mcp` and use `bpr-mcp.mjs` from the clone, or save it from <https://bestproductivityresources.com/mcp>. Check it runs with `node ~/bpr-mcp.mjs` (it waits for input; press Ctrl+C to stop).

2. Add it to your client. Use the **absolute** path to the file (for example `/Users/you/bpr-mcp.mjs`, or on Windows `C:\Users\you\bpr-mcp.mjs`, written as `C:\\Users\\you\\bpr-mcp.mjs` inside JSON).

### Claude Desktop

Open **Settings → Developer → Edit Config** (this opens `claude_desktop_config.json`), add the server and restart Claude Desktop:

```json
{
  "mcpServers": {
    "best-productivity-resources": {
      "command": "node",
      "args": ["/absolute/path/to/bpr-mcp.mjs"]
    }
  }
}
```

### Claude Code

```bash
claude mcp add best-productivity-resources -- node /absolute/path/to/bpr-mcp.mjs
```

Add `--scope user` to make it available in every project.

### Cursor

Add the same `mcpServers` block to `~/.cursor/mcp.json` (all projects) or `.cursor/mcp.json` (one project), then enable it under **Settings → MCP**.

### Other clients

Any MCP client that supports stdio servers works: the command is `node` and the only argument is the path to `bpr-mcp.mjs`.

## Try it

- "Find free note-taking apps in Best Productivity Resources."
- "What categories does Best Productivity Resources have?"
- "Get the Best Productivity Resources listing for Notion."

## Offline use

Set `BPR_RESOURCES_FILE` to a downloaded copy of `resources.json` and the server reads that file instead of the network.

## Develop

The source is TypeScript in `src/` (`catalog.ts` holds the search logic, `server.ts` the stdio JSON-RPC loop). `bpr-mcp.mjs` is the bundled build, kept in the repo so it runs with plain Node and no install step.

```bash
bun build.ts                # bundle src/ to bpr-mcp.mjs
npx -p typescript tsc -p . --noEmit   # typecheck (needs @types/node)
```

Issues and pull requests are welcome. This repository has no CI and no GitHub Actions.
