# makeitland-mcp

A tiny local MCP server that answers questions about the Make It Land site
(`~/code/makeitland`) by reading a strict allowlist of files. Stdio only.
No network calls. Read-only.

## What it can read, enforced in code

`src/paths.ts` is the only gate to the filesystem. Every read goes through
`resolveAllowed(siteRoot, relPath)`, which:

- Rejects empty paths, absolute paths, null bytes, `.` / `..` segments.
- Allows only this set (checked twice: once on the requested path, and once
  again on the realpath after symlink resolution):
  - Any `*.html` directly in the site root (e.g. `index.html`, `thesis.html`,
    `brand-guidelines.html`, `404.html`).
  - `llms.txt`, `sitemap.xml`.
  - Any single file under `work/`, `writing/`, or
    `how-institutions-behave/`.
- Rejects anything under the private client-pages folder and anything that
  resolves outside the site root (including via symlink).

The server has no other filesystem code path that reads site files; the
site loader (`src/site.ts`) imports `resolveAllowed` for every open.

### Tests

`src/paths.test.ts` proves the allowlist, including:

- Anything under the private client-pages folder is denied.
- A symlink in the site root that targets a file inside the private
  client-pages folder is denied.
- A symlink in the site root that targets a file outside the site root is
  denied.
- Nested paths inside allowed subdirs (`work/nested/x.html`) are denied.
- `..` traversal is denied.

Run them:

```sh
npm test
```

16 tests pass. Output from the run on October 17, 2026 is in
`docs/test-output-2026-10-17.txt`.

## Tools

Every tool returns `source_url` (the public page it came from). If the site
does not state something, the tool returns the string
`"not stated on the site"` and does not guess.

| Tool | Returns |
| --- | --- |
| `get_positioning` | `{ slogan, hero_headline, hero_subhead, description, service_type, who_its_for, source_url }` from the home page. |
| `get_services_and_pricing` | `{ services: [{name, description}], pricing: [{name, description, price?, min_price?, currency?}], source_url }` from the home-page `Service` + `Offer` JSON-LD. |
| `get_how_engagements_work` | `{ cards: [{heading, body}], source_url }` from the `#engagements` section of the home page (two cards: "How engagements work" and "Start smaller"). |
| `get_faq` | `{ questions: [{question, answer}], source_url }` from the home-page `FAQPage` JSON-LD. |
| `list_case_studies` | `{ case_studies: [{slug, headline, description, source_url}], source_url }`. Slugs: `my-camino-financial`, `adobe`, `cuppa-lumpia`, `house-style`, `how-institutions-behave`. |
| `get_case_study` | Args: `{ slug }`. Returns `{ slug, headline, description, body: [paragraphs], source_url }`. Unknown slug returns `"not stated on the site"` with the list of known slugs. |
| `search_site` | Args: `{ query, limit? }` (default 10, max 50). Case-insensitive substring search over the text of each allowed page. Returns `{ query, matches: [{url, title, snippet}], source_url }`. |
| `get_contact` | `{ email, calendly, instagram, linkedin, founder: {name, url}, source_url }`. |

## Build

```sh
npm install
npm run build
```

Produces `dist/server.js`.

## Register with Claude Code

From any directory:

```sh
claude mcp add makeitland-mcp -- node /path/to/makeitland-mcp/dist/server.js
```

The server reads `~/code/makeitland` by default. To point it elsewhere, pass
`MAKEITLAND_SITE_ROOT`:

```sh
claude mcp add makeitland-mcp -e MAKEITLAND_SITE_ROOT=/path/to/site -- node /path/to/makeitland-mcp/dist/server.js
```

Confirm it's registered:

```sh
claude mcp list
```

## Not a goal

- No network calls. No HTTP server. No analytics.
- No writes to the site repo. Node is launched by Claude Code; this process
  never calls any write-capable fs API against `~/code/makeitland`.
- No deployment. Stdio only.