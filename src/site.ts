import { readFileSync } from "node:fs";
import * as cheerio from "cheerio";
import { resolveAllowed } from "./paths.js";

const SITE_ORIGIN = "https://makeitland.studio";

export interface PageDoc {
  relPath: string;
  url: string;
  title: string;
  description: string;
  html: string;
  text: string;
  jsonld: unknown[];
  $: cheerio.CheerioAPI;
}

export interface SiteIndex {
  siteRoot: string;
  pages: Map<string, PageDoc>;
  llmsTxt: string | null;
}

const PAGES_TO_LOAD: string[] = [
  "index.html",
  "thesis.html",
  "work/adobe.html",
  "work/cuppa-lumpia.html",
  "work/house-style.html",
  "work/how-institutions-behave.html",
  "work/my-camino-financial.html",
  "writing/better-than-what-i-planned.html",
  "how-institutions-behave/index.html",
];

export function urlFor(relPath: string): string {
  if (relPath === "index.html") return `${SITE_ORIGIN}/`;
  if (relPath === "how-institutions-behave/index.html")
    return `${SITE_ORIGIN}/how-institutions-behave/`;
  return `${SITE_ORIGIN}/${relPath}`;
}

export function loadPage(siteRoot: string, relPath: string): PageDoc {
  const abs = resolveAllowed(siteRoot, relPath);
  const html = readFileSync(abs, "utf8");
  const $ = cheerio.load(html);
  const title = ($("title").first().text() || "").trim();
  const description = ($('meta[name="description"]').attr("content") || "").trim();

  const jsonld: unknown[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text();
    try {
      jsonld.push(JSON.parse(raw));
    } catch {
      // ignore malformed blocks; we don't invent what the site didn't ship
    }
  });

  const bodyClone = $("body").clone();
  bodyClone.find("script, style, nav, header, footer").remove();
  const text = normalizeWhitespace(bodyClone.text());

  return { relPath, url: urlFor(relPath), title, description, html, text, jsonld, $ };
}

export function loadSite(siteRoot: string): SiteIndex {
  const pages = new Map<string, PageDoc>();
  for (const rel of PAGES_TO_LOAD) {
    try {
      pages.set(rel, loadPage(siteRoot, rel));
    } catch (err) {
      // A page that is missing from disk is not fatal — tools that need it
      // will report "not stated on the site". We never fabricate content.
      console.error(`[makeitland-mcp] skipped ${rel}: ${(err as Error).message}`);
    }
  }

  let llmsTxt: string | null = null;
  try {
    const abs = resolveAllowed(siteRoot, "llms.txt");
    llmsTxt = readFileSync(abs, "utf8");
  } catch (err) {
    console.error(`[makeitland-mcp] skipped llms.txt: ${(err as Error).message}`);
  }

  return { siteRoot, pages, llmsTxt };
}

export function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

export function flattenGraph(jsonld: unknown[]): unknown[] {
  const out: unknown[] = [];
  for (const entry of jsonld) {
    if (entry && typeof entry === "object" && "@graph" in (entry as object)) {
      const graph = (entry as { "@graph": unknown })["@graph"];
      if (Array.isArray(graph)) {
        out.push(...graph);
        continue;
      }
    }
    out.push(entry);
  }
  return out;
}

export function findByType<T = Record<string, unknown>>(
  jsonld: unknown[],
  typeName: string,
): T[] {
  const items = flattenGraph(jsonld);
  const matches: T[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const t = (item as { "@type"?: unknown })["@type"];
    if (t === typeName || (Array.isArray(t) && t.includes(typeName))) {
      matches.push(item as T);
    }
  }
  return matches;
}
