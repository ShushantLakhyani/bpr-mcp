/**
 * Pure helpers over the public Best Productivity Resources catalogue
 * (https://bestproductivityresources.com/resources.json). No I/O here, so they are easy to test.
 */

export type CatalogEntry = {
  name: string;
  slug: string;
  url: string | null;
  page: string;
  category: string;
  type: string;
  pricing: string;
  platforms: string[];
  description: string;
  updated: string;
};

export type Catalog = {
  updated: string;
  count: number;
  resources: CatalogEntry[];
};

export type SearchInput = {
  query?: string;
  category?: string;
  type?: string;
  pricing?: string;
  limit?: number;
};

export const MAX_LIMIT = 25;
export const DEFAULT_LIMIT = 10;

const STOPWORDS = new Set(["a", "an", "and", "the", "for", "to", "of", "in", "on", "with", "or"]);

const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** Validate the downloaded JSON and keep only the documented fields. */
export function parseCatalog(json: unknown): Catalog {
  const root = (json ?? {}) as { updated?: unknown; resources?: unknown };
  if (!Array.isArray(root.resources)) {
    throw new Error("resources.json has no resources array");
  }
  const resources: CatalogEntry[] = [];
  for (const raw of root.resources) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const slug = str(r["slug"]);
    const name = str(r["name"]);
    if (!slug || !name) continue;
    resources.push({
      name,
      slug,
      url: typeof r["url"] === "string" ? r["url"] : null,
      page: str(r["page"]),
      category: str(r["category"]),
      type: str(r["type"]),
      pricing: str(r["pricing"]),
      platforms: Array.isArray(r["platforms"])
        ? r["platforms"].filter((p): p is string => typeof p === "string")
        : [],
      description: str(r["description"]),
      updated: str(r["updated"]),
    });
  }
  return { updated: str(root.updated), count: resources.length, resources };
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const same = (a: string, b: string) => norm(a) === norm(b);

function score(r: CatalogEntry, terms: string[], phrase: string): number {
  if (terms.length === 0) return 1;
  const name = norm(r.name);
  const slug = norm(r.slug);
  const rest = norm(`${r.description} ${r.category} ${r.type} ${r.platforms.join(" ")}`);
  let total = 0;
  let matched = 0;
  if (name === phrase) total += 100;
  else if (name.startsWith(phrase)) total += 40;
  else if (name.includes(phrase)) total += 25;
  for (const t of terms) {
    const inName = name.split(" ").includes(t) || slug.split(" ").includes(t);
    const inRest = rest.split(" ").includes(t);
    if (inName) total += 10;
    else if (name.includes(t)) total += 6;
    if (inRest) total += 3;
    else if (rest.includes(t)) total += 1;
    if (inName || inRest || name.includes(t) || rest.includes(t)) matched += 1;
  }
  // Any matching term counts; results that match more of the query rank higher.
  return matched === 0 ? 0 : total + matched * matched * 5;
}

/** Keyword search with optional exact filters, best matches first. */
export function searchCatalog(catalog: Catalog, input: SearchInput) {
  const phrase = norm(input.query ?? "");
  const terms = phrase.split(" ").filter((t) => t && !STOPWORDS.has(t));
  const limit = Math.min(MAX_LIMIT, Math.max(1, Math.floor(input.limit ?? DEFAULT_LIMIT)));
  const matches = catalog.resources
    .filter((r) => !input.category || same(r.category, input.category))
    .filter((r) => !input.type || same(r.type, input.type))
    .filter((r) => !input.pricing || same(r.pricing, input.pricing))
    .map((r) => ({ r, s: score(r, terms, phrase) }))
    .filter((m) => m.s > 0)
    .sort((a, b) => b.s - a.s || a.r.name.localeCompare(b.r.name));
  return {
    total: matches.length,
    results: matches.slice(0, limit).map((m) => m.r),
  };
}

/** Find one resource by slug, directory page URL or exact name. */
export function findResource(catalog: Catalog, id: string): CatalogEntry | undefined {
  const value = id.trim();
  const fromUrl = value.match(/\/resources\/([a-z0-9-]+)\/?(?:[?#].*)?$/i)?.[1];
  const slug = (fromUrl ?? value).toLowerCase();
  return (
    catalog.resources.find((r) => r.slug === slug) ??
    catalog.resources.find((r) => same(r.name, value))
  );
}

/** Every primary category with how many resources it holds, largest first. */
export function listCategories(catalog: Catalog) {
  const counts = new Map<string, number>();
  for (const r of catalog.resources) {
    if (r.category) counts.set(r.category, (counts.get(r.category) ?? 0) + 1);
  }
  return [...counts]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
