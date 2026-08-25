import path from "node:path";
import { getArg, getAliasArg, hasFlag, normalizeDir, ensureDir } from "../lib/args.js";
import { clientFromEnv } from "../lib/client.js";
import { resolveProfile } from "../lib/profile.js";
import { fetchPosts, enrichPostBodies } from "../lib/posts.js";
import { fetchNotes } from "../lib/notes.js";
import { dedupePosts } from "../lib/enrich.js";
import { buildExport } from "../lib/schema.js";
import { writeExport } from "../lib/export.js";
import { convertExport } from "../lib/convert/index.js";

export const description =
  "Baixa posts + notas (+ replies) de um perfil/publicação e exporta no formato padrão.";

export const usage =
  "substack export <handle> [--autor Nome] [--posts|--no-posts] [--notes|--no-notes] " +
  "[--no-replies] [--no-full-bodies] [--limit N] [--source auto|publication|profile] " +
  "[--dedupe] [--out out] [--env .env] [--skip-convert] [--md-dir textos/<autor>]";

export async function run(positional) {
  const handle = positional[0] || getArg("handle");
  if (!handle) {
    console.error(`Uso: ${usage}`);
    process.exit(1);
  }

  const autor = getAliasArg("autor", "a", handle);
  const limit = Number(getArg("limit", "0")) || 0;
  const sourceArg = getArg("source", "auto");
  const includePosts = hasFlag("posts") ? true : hasFlag("no-posts") ? false : true;
  const includeNotes = hasFlag("notes") ? true : hasFlag("no-notes") ? false : true;
  const includeReplies = !hasFlag("no-replies");
  const includeFullBodies = !hasFlag("no-full-bodies");
  const dedupe = hasFlag("dedupe");
  const outDir = normalizeDir(getArg("out", "out"));
  const envFile = getArg("env", path.resolve(".env"));
  const skipConvert = hasFlag("skip-convert");
  const mdDir = normalizeDir(getArg("md-dir", path.join("textos", autor)));

  const client = clientFromEnv({ envFile });

  console.log(`Resolvendo perfil "${handle}"...`);
  const { profile, rawProfile, source } = await resolveProfile(client, handle);
  console.log(`Perfil: ${profile.name} (@${profile.handle}), id=${profile.id}`);

  if (sourceArg !== "auto" && sourceArg !== source.type) {
    if (sourceArg === "profile") {
      source.type = "profile";
      source.method = "profile/posts";
      source.subdomain = null;
    } else if (sourceArg === "publication") {
      source.type = "publication";
      source.method = "archive";
    } else {
      console.error(`--source inválido: "${sourceArg}" (use auto|publication|profile)`);
      process.exit(1);
    }
  }

  console.log(`Fonte: ${source.type === "publication" ? `publicação "${source.publication.name}" (${source.subdomain}.substack.com)` : "perfil via /profile/posts"}`);

  let posts = [];
  let notes = [];

  if (includePosts) {
    console.log("Baixando posts...");
    posts = await fetchPosts({ client, profile: rawProfile, source, limit });
    if (dedupe && posts.length) {
      posts = dedupePosts(posts);
    }
    console.log(`Posts baixados: ${posts.length}`);
  }

  if (includePosts && includeFullBodies && posts.length) {
    console.log(`Enriquecendo ${posts.length} posts com corpo completo...`);
    await enrichPostBodies({ client, posts });
  }

  if (includeNotes) {
    console.log("Baixando notas...");
    notes = await fetchNotes({
      client,
      profile: rawProfile,
      limit,
      includeReplies
    });
    console.log(`Notas baixadas: ${notes.length}`);
  }

  const data = buildExport({
    profile,
    source,
    posts,
    notes,
    options: {
      limit,
      includePosts,
      includeNotes,
      includeReplies,
      includeFullBodies,
      dedupe
    }
  });

  const outFile = writeExport({ outDir, handle, data });
  console.log(`Export salvo: ${outFile}`);

  if (skipConvert) {
    console.log("Conversão pulada (--skip-convert).");
    return { outFile, mdFiles: [] };
  }

  ensureDir(mdDir);
  const result = convertExport(data, {
    mdDir,
    includePosts: includePosts && posts.length > 0,
    includeNotes: includeNotes && notes.length > 0
  });
  console.log(
    `Convertido: ${result.posts} posts .md + ${result.notes} arquivo(s) de notas em ${mdDir}`
  );
  return { outFile, mdDir, converted: result };
}
