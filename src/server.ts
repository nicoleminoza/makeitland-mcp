#!/usr/bin/env node
import * as os from "node:os";
import * as path from "node:path";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import {
  findByType,
  loadSite,
  normalizeWhitespace,
  type PageDoc,
  type SiteIndex,
  urlFor,
} from "./site.js";

const SITE_ROOT =
  process.env.MAKEITLAND_SITE_ROOT ??
  path.join(os.homedir(), "code", "makeitland");

const NOT_STATED = "not stated on the site";

const site: SiteIndex = loadSite(SITE_ROOT);

function page(relPath: string): PageDoc | undefined {
  return site.pages.get(relPath);
}

function missing(sourceRelPath: string, note: string) {
  return {
    answer: NOT_STATED,
    note,
    source_url: urlFor(sourceRelPath),
  };
}

function getPositioning() {
  const home = page("index.html");
  if (!home) return missing("index.html", "home page not loaded");

  const org = findByType<Record<string, unknown>>(home.jsonld, "Organization")[0];
  const service = findByType<Record<string, unknown>>(home.jsonld, "Service")[0];

  const slogan = (org?.slogan as string | undefined) ?? "";
  const description =
    (org?.description as string | undefined) ?? home.description ?? "";

  const heroHeadline = normalizeWhitespace(
    home.$("h1").first().text() || "",
  );
  const heroSubhead = normalizeWhitespace(
    home.$("h1").first().nextAll("p").first().text() || "",
  );
  const whoItsFor = normalizeWhitespace(
    home.$("h2").filter((_, el) =>
      home.$(el).text().toLowerCase().includes("founder-led"),
    ).first().next("p").text() || "",
  );
  const serviceType = (service?.serviceType as string | undefined) ?? "";

  return {
    slogan: slogan || NOT_STATED,
    hero_headline: heroHeadline || NOT_STATED,
    hero_subhead: heroSubhead || NOT_STATED,
    description: description || NOT_STATED,
    service_type: serviceType || NOT_STATED,
    who_its_for: whoItsFor || NOT_STATED,
    source_url: urlFor("index.html"),
  };
}

function getServicesAndPricing() {
  const home = page("index.html");
  if (!home) return missing("index.html", "home page not loaded");

  const services = findByType<Record<string, unknown>>(home.jsonld, "Service");
  const svc = services[0];

  const catalog =
    (svc?.hasOfferCatalog as { itemListElement?: unknown[] } | undefined) ??
    undefined;
  const offers = Array.isArray(catalog?.itemListElement)
    ? catalog!.itemListElement!
    : [];

  const serviceLines: Array<{ name: string; description: string }> = [];
  const pricing: Array<{
    name: string;
    description: string;
    price?: number;
    min_price?: number;
    currency?: string;
  }> = [];

  for (const raw of offers) {
    if (!raw || typeof raw !== "object") continue;
    const offer = raw as Record<string, unknown>;
    const itemOffered = offer.itemOffered as
      | Record<string, unknown>
      | undefined;

    if (itemOffered && typeof itemOffered === "object" && !("price" in offer)) {
      const name = (itemOffered.name as string | undefined) ?? "";
      const desc = (itemOffered.description as string | undefined) ?? "";
      if (name) serviceLines.push({ name, description: desc });
      continue;
    }

    const name =
      (offer.name as string | undefined) ??
      (itemOffered?.name as string | undefined) ??
      "";
    const desc =
      (offer.description as string | undefined) ??
      (itemOffered?.description as string | undefined) ??
      "";
    const price = typeof offer.price === "number" ? offer.price : undefined;
    const currency = offer.priceCurrency as string | undefined;
    const priceSpec = offer.priceSpecification as
      | Record<string, unknown>
      | undefined;
    const minPrice =
      typeof priceSpec?.minPrice === "number"
        ? (priceSpec!.minPrice as number)
        : undefined;

    if (name && (price !== undefined || minPrice !== undefined || desc)) {
      pricing.push({
        name,
        description: desc,
        price,
        min_price: minPrice,
        currency,
      });
    }
  }

  return {
    services: serviceLines.length ? serviceLines : NOT_STATED,
    pricing: pricing.length ? pricing : NOT_STATED,
    source_url: urlFor("index.html"),
  };
}

function getHowEngagementsWork() {
  const home = page("index.html");
  if (!home) return missing("index.html", "home page not loaded");

  const section = home.$("#engagements");
  if (section.length === 0) {
    return missing(
      "index.html",
      "no #engagements section on the home page",
    );
  }

  const cards: Array<{ heading: string; body: string }> = [];
  section.find("h2").each((_, el) => {
    const heading = normalizeWhitespace(home.$(el).text());
    const body = normalizeWhitespace(home.$(el).next("p").text());
    if (heading) cards.push({ heading, body });
  });

  return {
    cards: cards.length ? cards : NOT_STATED,
    source_url: `${urlFor("index.html")}#engagements`,
  };
}

function getFaq() {
  const home = page("index.html");
  if (!home) return missing("index.html", "home page not loaded");

  const faqPages = findByType<Record<string, unknown>>(home.jsonld, "FAQPage");
  const faqPage = faqPages[0];
  const entities =
    faqPage && Array.isArray(faqPage.mainEntity) ? faqPage.mainEntity : [];

  const items: Array<{ question: string; answer: string }> = [];
  for (const raw of entities) {
    if (!raw || typeof raw !== "object") continue;
    const q = raw as Record<string, unknown>;
    const answer = q.acceptedAnswer as Record<string, unknown> | undefined;
    const question = (q.name as string | undefined) ?? "";
    const text = (answer?.text as string | undefined) ?? "";
    if (question && text) items.push({ question, answer: text });
  }

  return {
    questions: items.length ? items : NOT_STATED,
    source_url: `${urlFor("index.html")}#faq`,
  };
}

const CASE_STUDY_SLUGS: Record<string, string> = {
  "my-camino-financial": "work/my-camino-financial.html",
  adobe: "work/adobe.html",
  "cuppa-lumpia": "work/cuppa-lumpia.html",
  "house-style": "work/house-style.html",
  "how-institutions-behave": "work/how-institutions-behave.html",
};

function listCaseStudies() {
  const studies: Array<{
    slug: string;
    headline: string;
    description: string;
    source_url: string;
  }> = [];
  for (const [slug, rel] of Object.entries(CASE_STUDY_SLUGS)) {
    const p = page(rel);
    if (!p) continue;
    const article = findByType<Record<string, unknown>>(p.jsonld, "Article")[0];
    const headline =
      (article?.headline as string | undefined) ??
      normalizeWhitespace(p.$("h1").first().text()) ??
      "";
    const description =
      (article?.description as string | undefined) ?? p.description ?? "";
    studies.push({
      slug,
      headline: headline || NOT_STATED,
      description: description || NOT_STATED,
      source_url: p.url,
    });
  }
  return {
    case_studies: studies.length ? studies : NOT_STATED,
    source_url: `${urlFor("index.html")}#work`,
  };
}

function getCaseStudy(slug: string) {
  const rel = CASE_STUDY_SLUGS[slug];
  if (!rel) {
    return {
      answer: NOT_STATED,
      note: `no case study with slug "${slug}". Known slugs: ${Object.keys(
        CASE_STUDY_SLUGS,
      ).join(", ")}`,
      source_url: `${urlFor("index.html")}#work`,
    };
  }
  const p = page(rel);
  if (!p) return missing(rel, "case study page not loaded");

  const article = findByType<Record<string, unknown>>(p.jsonld, "Article")[0];
  const headline =
    (article?.headline as string | undefined) ||
    normalizeWhitespace(p.$("h1").first().text()) ||
    "";
  const description =
    (article?.description as string | undefined) || p.description || "";

  const paragraphs: string[] = [];
  p.$("article p").each((_, el) => {
    const t = normalizeWhitespace(p.$(el).text());
    if (t) paragraphs.push(t);
  });
  if (paragraphs.length === 0) {
    p.$("section p").each((_, el) => {
      const t = normalizeWhitespace(p.$(el).text());
      if (t) paragraphs.push(t);
    });
  }

  return {
    slug,
    headline: headline || NOT_STATED,
    description: description || NOT_STATED,
    body: paragraphs.length ? paragraphs : NOT_STATED,
    source_url: p.url,
  };
}

function searchSite(query: string, limit = 10) {
  const q = query.trim().toLowerCase();
  if (!q) {
    return { query, matches: [], source_url: urlFor("index.html") };
  }
  const matches: Array<{
    url: string;
    title: string;
    snippet: string;
  }> = [];

  for (const p of site.pages.values()) {
    const idx = p.text.toLowerCase().indexOf(q);
    if (idx === -1) continue;
    const start = Math.max(0, idx - 80);
    const end = Math.min(p.text.length, idx + q.length + 80);
    const snippet =
      (start > 0 ? "…" : "") +
      p.text.slice(start, end).trim() +
      (end < p.text.length ? "…" : "");
    matches.push({ url: p.url, title: p.title || p.relPath, snippet });
    if (matches.length >= limit) break;
  }

  return { query, matches, source_url: urlFor("index.html") };
}

function getContact() {
  const home = page("index.html");
  const orgs = home
    ? findByType<Record<string, unknown>>(home.jsonld, "Organization")
    : [];
  const org = orgs[0];
  const email = (org?.email as string | undefined) ?? "";

  const sameAs = Array.isArray(org?.sameAs) ? (org!.sameAs as string[]) : [];
  const instagram = sameAs.find((u) => u.includes("instagram.com")) ?? "";
  const linkedin = sameAs.find((u) => u.includes("linkedin.com")) ?? "";

  let calendly = "";
  if (home) {
    const link = home
      .$('a[href*="calendly.com"]')
      .first()
      .attr("href");
    if (link) calendly = link.split("?")[0];
  }

  const founder = home
    ? findByType<Record<string, unknown>>(home.jsonld, "Person")[0]
    : undefined;
  const founderName = (founder?.name as string | undefined) ?? "";
  const founderUrl = (founder?.url as string | undefined) ?? "";

  return {
    email: email || NOT_STATED,
    calendly: calendly || NOT_STATED,
    instagram: instagram || NOT_STATED,
    linkedin: linkedin || NOT_STATED,
    founder: founderName
      ? { name: founderName, url: founderUrl || NOT_STATED }
      : NOT_STATED,
    source_url: urlFor("index.html"),
  };
}

const toolDefinitions = [
  {
    name: "get_positioning",
    description:
      "What Make It Land says it does and who it serves. Returns slogan, hero headline/subhead, description, service type, and who-it-is-for, each sourced from the home page.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_services_and_pricing",
    description:
      "The three service lines (Positioning, The site, The proof) and the pricing offers from the home-page structured data.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_how_engagements_work",
    description:
      "The two engagement cards on the home page: how engagements work, and the smaller 'start smaller' offer.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_faq",
    description:
      "The FAQ questions and answers published on the home page (sourced from the FAQPage JSON-LD).",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "list_case_studies",
    description:
      "The case studies on the site, each with slug, headline, description, and source URL.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_case_study",
    description:
      "Fetch a single case study by slug (e.g. 'my-camino-financial', 'adobe', 'cuppa-lumpia', 'house-style', 'how-institutions-behave').",
    inputSchema: {
      type: "object",
      properties: {
        slug: {
          type: "string",
          description: "The case study slug.",
        },
      },
      required: ["slug"],
      additionalProperties: false,
    },
  },
  {
    name: "search_site",
    description:
      "Case-insensitive keyword search across the public text of the allowed pages. Returns match snippets with source URLs.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Keyword or phrase to search for." },
        limit: {
          type: "integer",
          description: "Maximum number of matches (default 10).",
          minimum: 1,
          maximum: 50,
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "get_contact",
    description:
      "Contact details published on the site: email, Calendly fit-call link, Instagram, LinkedIn, and founder info.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
];

const SearchArgs = z.object({
  query: z.string(),
  limit: z.number().int().min(1).max(50).optional(),
});

const SlugArgs = z.object({ slug: z.string() });

const server = new Server(
  { name: "makeitland-mcp", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: toolDefinitions,
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const name = req.params.name;
  const args = req.params.arguments ?? {};

  let payload: unknown;
  try {
    switch (name) {
      case "get_positioning":
        payload = getPositioning();
        break;
      case "get_services_and_pricing":
        payload = getServicesAndPricing();
        break;
      case "get_how_engagements_work":
        payload = getHowEngagementsWork();
        break;
      case "get_faq":
        payload = getFaq();
        break;
      case "list_case_studies":
        payload = listCaseStudies();
        break;
      case "get_case_study":
        payload = getCaseStudy(SlugArgs.parse(args).slug);
        break;
      case "search_site": {
        const parsed = SearchArgs.parse(args);
        payload = searchSite(parsed.query, parsed.limit ?? 10);
        break;
      }
      case "get_contact":
        payload = getContact();
        break;
      default:
        return {
          content: [{ type: "text", text: `unknown tool: ${name}` }],
          isError: true,
        };
    }
  } catch (err) {
    return {
      content: [
        {
          type: "text",
          text: `error: ${(err as Error).message}`,
        },
      ],
      isError: true,
    };
  }

  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
  };
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(
  `[makeitland-mcp] ready. site=${SITE_ROOT} pages=${site.pages.size} llms=${
    site.llmsTxt ? "yes" : "no"
  }`,
);
