import { realpathSync } from "node:fs";
import * as path from "node:path";

export class ForbiddenPathError extends Error {
  constructor(reason: string, requested: string) {
    super(`forbidden path: ${reason} (requested: ${requested})`);
    this.name = "ForbiddenPathError";
  }
}

const ROOT_HTML_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*\.html$/;
const SUBDIR_FILE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

const ALLOWED_ROOT_FILES = new Set<string>(["llms.txt", "sitemap.xml"]);
const ALLOWED_SUBDIRS = new Set<string>([
  "work",
  "writing",
  "how-institutions-behave",
]);

export function isPathAllowed(relPosix: string): boolean {
  if (relPosix === "" || relPosix === ".") return false;
  if (relPosix.startsWith("/")) return false;
  if (relPosix.includes("\0")) return false;

  const parts = relPosix.split("/");
  for (const part of parts) {
    if (part === "" || part === "." || part === "..") return false;
  }

  if (parts.length === 1) {
    const name = parts[0];
    if (ALLOWED_ROOT_FILES.has(name)) return true;
    return ROOT_HTML_PATTERN.test(name);
  }

  if (parts.length === 2) {
    const [dir, name] = parts;
    if (!ALLOWED_SUBDIRS.has(dir)) return false;
    return SUBDIR_FILE_PATTERN.test(name);
  }

  return false;
}

export function resolveAllowed(siteRoot: string, requested: string): string {
  const siteRootReal = realpathSync(siteRoot);

  if (typeof requested !== "string" || requested.length === 0) {
    throw new ForbiddenPathError("empty request", String(requested));
  }

  const normalized = requested.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!isPathAllowed(normalized)) {
    throw new ForbiddenPathError("not on allowlist", requested);
  }

  const joined = path.resolve(siteRootReal, normalized);

  let real: string;
  try {
    real = realpathSync(joined);
  } catch {
    throw new ForbiddenPathError("file does not exist", requested);
  }

  const rel = path.relative(siteRootReal, real);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new ForbiddenPathError("escapes site root", requested);
  }

  const relPosix = rel.split(path.sep).join("/");
  if (!isPathAllowed(relPosix)) {
    throw new ForbiddenPathError("resolved path not on allowlist", requested);
  }

  return real;
}

export const _internals = {
  ALLOWED_ROOT_FILES,
  ALLOWED_SUBDIRS,
  ROOT_HTML_PATTERN,
  SUBDIR_FILE_PATTERN,
};
