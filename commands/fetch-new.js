import path from "node:path";
import fs from "node:fs";
import { getArg, getAliasArg, normalizeDir, ensureDir, hasFlag } from "../lib/args.js";
import { clientFromEnv } from "../lib/client.js";
import { fetchRssPreloads } from "../lib/posts.js";
import { buildExport } from "../lib/schema.js";
import { writeExport } from "../lib/export.js";
import { convertExport } from "../lib/convert/index.js";

export const description =
  "Baixa apenas posts NOVOS de uma publicação (RSS /feed + window._preloads), " +
  "comparando com os slugs já presentes na pasta de destino.";

export const usage =
  "substack fetch-new <handle> --autor Nome [--dir textos] [--limit N] [--out out] [--env .env]";

export async function run(positional) {
  const handle = positional[0] || getArg("handle");
  if (!handle) {
    console.error(`Uso: ${usage}`);
    process.exit(1);
  }

  const autor = getAliasArg("autor", "a", handle);
  const textosRoot = normalizeDir(getArg("dir", "textos"));
  const limit = Number(getArg("limit", "0")) || 0;
  const outDir = normalizeDir(getArg("out", "out"));
  const envFile = getArg("env", path.resolve(".env"));
  const skipConvert = hasFlag("skip-convert");

  const autorDir = path.join(textosRoot, autor);
  ensureDir(autorDir);
  const knownSlugs = new Set(
    fs
      .readdirSync(autorDir)
      .filter((f) => f.endsWith(".md"))
      .map((f) => f.replace(/\.md$/, ""))
  );

  console.log(`[novos] ${autor}: checando slugs já presentes (${knownSlugs.size})...`);
  const posts = await fetchRssPreloads({ handle, knownSlugs, limit });

  if (!posts.length) {
    console.log(`[novos] ${autor}: nenhum post novo.`);
    return { posts: 0 };
  }

  const data = buildExport({
    profile: { id: null, name: autor, handle, url: `https://${handle}.substack.com` },
    source: { type: "publication", slug: handle, subdomain: handle, method: "rss+preloads" },
    posts,
    notes: [],
    options: { limit, includePosts: true, includeNotes: false, includeReplies: false, includeFullBodies: true }
  });

  const outFile = writeExport({ outDir, handle, data });
  console.log(`export: ${outFile} (${posts.length} posts)`);

  if (skipConvert) return { outFile, posts: posts.length };

  const result = convertExport(data, { mdDir: autorDir, includePosts: true, includeNotes: false });
  const mdCount = fs.readdirSync(autorDir).filter((f) => f.endsWith(".md")).length;
  console.log(`Artigos .md em ${autorDir}: ${mdCount}`);
  return { outFile, posts: posts.length, mdDir: autorDir };
}
