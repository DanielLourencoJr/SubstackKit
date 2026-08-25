import path from "node:path";
import fs from "node:fs";
import { getArg, getAliasArg, normalizeDir, ensureDir, hasFlag } from "../lib/args.js";
import { clientFromEnv } from "../lib/client.js";
import { fetchRssPreloads } from "../lib/posts.js";
import { buildExport } from "../lib/schema.js";
import { writeExport } from "../lib/export.js";
import { convertExport } from "../lib/convert/index.js";

export const description =
  "Downloads only NEW posts of a publication (RSS /feed + window._preloads), " +
  "comparing against slugs already present in the destination folder.";

export const usage =
  "substack fetch-new <handle> --author Name [--dir texts] [--limit N] [--out out] [--env .env]";

export async function run(positional) {
  const handle = positional[0] || getArg("handle");
  if (!handle) {
    console.error(`Usage: ${usage}`);
    process.exit(1);
  }

  const author = getAliasArg("author", "a", handle);
  const textsRoot = normalizeDir(getArg("dir", "texts"));
  const limit = Number(getArg("limit", "0")) || 0;
  const outDir = normalizeDir(getArg("out", "out"));
  const envFile = getArg("env", path.resolve(".env"));
  const skipConvert = hasFlag("skip-convert");

  const authorDir = path.join(textsRoot, author);
  const articlesDir = path.join(authorDir, "Articles");
  ensureDir(authorDir);
  const knownSlugs = new Set(
    fs.existsSync(articlesDir)
      ? fs
          .readdirSync(articlesDir)
          .filter((f) => f.endsWith(".md"))
          .map((f) => f.replace(/\.md$/, ""))
      : []
  );

  console.log(`[new] ${author}: checking slugs already present (${knownSlugs.size})...`);
  const posts = await fetchRssPreloads({ handle, knownSlugs, limit });

  if (!posts.length) {
    console.log(`[new] ${author}: no new posts.`);
    return { posts: 0 };
  }

  const data = buildExport({
    profile: { id: null, name: author, handle, url: `https://${handle}.substack.com` },
    source: { type: "publication", slug: handle, subdomain: handle, method: "rss+preloads" },
    posts,
    notes: [],
    options: { limit, includePosts: true, includeNotes: false, includeReplies: false, includeFullBodies: true }
  });

  const outFile = writeExport({ outDir, handle, data });
  console.log(`export: ${outFile} (${posts.length} posts)`);

  if (skipConvert) return { outFile, posts: posts.length };

  const result = convertExport(data, { mdDir: authorDir, includePosts: true, includeNotes: false });
  const mdCount = fs.existsSync(articlesDir)
    ? fs.readdirSync(articlesDir).filter((f) => f.endsWith(".md")).length
    : 0;
  console.log(`Articles .md in ${articlesDir}: ${mdCount}`);
  return { outFile, posts: posts.length, mdDir: articlesDir };
}
