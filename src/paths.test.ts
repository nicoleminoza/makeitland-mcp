import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";

import {
  isPathAllowed,
  resolveAllowed,
  ForbiddenPathError,
} from "./paths.js";

function makeFakeSite(): string {
  const root = mkdtempSync(path.join(tmpdir(), "mil-site-"));
  writeFileSync(path.join(root, "index.html"), "<html></html>");
  writeFileSync(path.join(root, "thesis.html"), "<html></html>");
  writeFileSync(path.join(root, "brand-guidelines.html"), "<html></html>");
  writeFileSync(path.join(root, "llms.txt"), "# site");
  writeFileSync(path.join(root, "sitemap.xml"), "<urlset/>");

  mkdirSync(path.join(root, "work"));
  writeFileSync(path.join(root, "work", "adobe.html"), "<html></html>");
  writeFileSync(path.join(root, "work", "cuppa-lumpia.html"), "<html></html>");

  mkdirSync(path.join(root, "writing"));
  writeFileSync(
    path.join(root, "writing", "better-than-what-i-planned.html"),
    "<html></html>",
  );

  mkdirSync(path.join(root, "how-institutions-behave"));
  writeFileSync(
    path.join(root, "how-institutions-behave", "index.html"),
    "<html></html>",
  );

  mkdirSync(path.join(root, "for"));
  mkdirSync(path.join(root, "for", "example-person"));
  writeFileSync(
    path.join(root, "for", "example-person", "index.html"),
    "<html>secret</html>",
  );

  mkdirSync(path.join(root, "assets"));
  writeFileSync(path.join(root, "assets", "mil.css"), "body{}");

  mkdirSync(path.join(root, "work", "nested"));
  writeFileSync(
    path.join(root, "work", "nested", "deeper.html"),
    "<html></html>",
  );

  return root;
}

test("isPathAllowed: allows root-level HTML pages", () => {
  assert.equal(isPathAllowed("index.html"), true);
  assert.equal(isPathAllowed("thesis.html"), true);
  assert.equal(isPathAllowed("brand-guidelines.html"), true);
  assert.equal(isPathAllowed("404.html"), true);
});

test("isPathAllowed: allows llms.txt and sitemap.xml", () => {
  assert.equal(isPathAllowed("llms.txt"), true);
  assert.equal(isPathAllowed("sitemap.xml"), true);
});

test("isPathAllowed: allows work/, writing/, how-institutions-behave/", () => {
  assert.equal(isPathAllowed("work/adobe.html"), true);
  assert.equal(isPathAllowed("writing/better-than-what-i-planned.html"), true);
  assert.equal(isPathAllowed("how-institutions-behave/index.html"), true);
});

test("isPathAllowed: denies anything under for/", () => {
  assert.equal(isPathAllowed("for/example-person/index.html"), false);
  assert.equal(isPathAllowed("for/another-person/index.html"), false);
  assert.equal(isPathAllowed("for"), false);
});

test("isPathAllowed: denies traversal segments", () => {
  assert.equal(isPathAllowed("../index.html"), false);
  assert.equal(isPathAllowed("work/../for/x.html"), false);
  assert.equal(isPathAllowed("./index.html"), false);
  assert.equal(isPathAllowed(""), false);
  assert.equal(isPathAllowed("/etc/passwd"), false);
});

test("isPathAllowed: denies non-HTML root files beyond allowlist", () => {
  assert.equal(isPathAllowed("robots.txt"), false);
  assert.equal(isPathAllowed("CNAME"), false);
  assert.equal(isPathAllowed("favicon.ico"), false);
  assert.equal(isPathAllowed(".DS_Store"), false);
});

test("isPathAllowed: denies assets and other subdirs", () => {
  assert.equal(isPathAllowed("assets/mil.css"), false);
  assert.equal(isPathAllowed(".git/config"), false);
});

test("isPathAllowed: denies deeply nested paths in allowed subdirs", () => {
  assert.equal(isPathAllowed("work/nested/deeper.html"), false);
  assert.equal(isPathAllowed("writing/a/b.html"), false);
});

test("isPathAllowed: rejects null bytes and empty segments", () => {
  assert.equal(isPathAllowed("index.html\0.png"), false);
  assert.equal(isPathAllowed("work//adobe.html"), false);
});

test("resolveAllowed: resolves allowed files", () => {
  const site = makeFakeSite();
  assert.ok(resolveAllowed(site, "index.html").endsWith("index.html"));
  assert.ok(resolveAllowed(site, "work/adobe.html").endsWith("work/adobe.html"));
  assert.ok(resolveAllowed(site, "llms.txt").endsWith("llms.txt"));
});

test("resolveAllowed: refuses for/ with ForbiddenPathError", () => {
  const site = makeFakeSite();
  assert.throws(
    () => resolveAllowed(site, "for/example-person/index.html"),
    ForbiddenPathError,
  );
});

test("resolveAllowed: refuses traversal with ForbiddenPathError", () => {
  const site = makeFakeSite();
  assert.throws(() => resolveAllowed(site, "../etc/passwd"), ForbiddenPathError);
  assert.throws(() => resolveAllowed(site, "/etc/passwd"), ForbiddenPathError);
  assert.throws(
    () => resolveAllowed(site, "work/../for/example-person/index.html"),
    ForbiddenPathError,
  );
});

test("resolveAllowed: refuses non-allowlisted files", () => {
  const site = makeFakeSite();
  assert.throws(() => resolveAllowed(site, "robots.txt"), ForbiddenPathError);
  assert.throws(
    () => resolveAllowed(site, "assets/mil.css"),
    ForbiddenPathError,
  );
});

test("resolveAllowed: refuses symlink escape via for/", () => {
  const site = makeFakeSite();
  symlinkSync(
    path.join(site, "for", "example-person", "index.html"),
    path.join(site, "sneak.html"),
  );
  assert.throws(() => resolveAllowed(site, "sneak.html"), ForbiddenPathError);
});

test("resolveAllowed: refuses symlink escape outside site root", () => {
  const site = makeFakeSite();
  const outside = mkdtempSync(path.join(tmpdir(), "mil-outside-"));
  writeFileSync(path.join(outside, "secret.html"), "<html>secret</html>");
  symlinkSync(path.join(outside, "secret.html"), path.join(site, "secret.html"));
  assert.throws(() => resolveAllowed(site, "secret.html"), ForbiddenPathError);
});

test("resolveAllowed: refuses nested html inside allowed subdir", () => {
  const site = makeFakeSite();
  assert.throws(
    () => resolveAllowed(site, "work/nested/deeper.html"),
    ForbiddenPathError,
  );
});
