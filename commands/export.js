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
  "Downloads posts + notes (+ replies) from a profile/publication and exports in the standard format.";

export const usage =
  "substack export <handle> [--author Name] [--posts|--no-posts] [--notes|--no-notes] " +
  "[--no-replies] [--no-full-bodies] [--limit N] [--source auto|publication|profile] " +
  "[--dedupe] [--out out] [--env .env] [--skip-convert] [--md-dir texts/<author>]";

export async function run(positional) {
  const handle = positional[0] || getArg("handle");
  if (!handle) {
    console.error(`Usage: ${usage}`);
    process.exit(1);
  }

  const author = getAliasArg("author", "a", handle);
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
  const mdDir = normalizeDir(getArg("md-dir", path.join("texts", author)));

  const client = clientFromEnv({ envFile });

  console.log(`Resolving profile "${handle}"...`);
  const { profile, rawProfile, source } = await resolveProfile(client, handle);
  console.log(`Profile: ${profile.name} (@${profile.handle}), id=${profile.id}`);

  if (sourceArg !== "auto" && sourceArg !== source.type) {
    if (sourceArg === "profile") {
      source.type = "profile";
      source.method = "profile/posts";
      source.subdomain = null;
    } else if (sourceArg === "publication") {
      source.type = "publication";
      source.method = "archive";
    } else {
      console.error(`Invalid --source: "${sourceArg}" (use auto|publication|profile)`);
      process.exit(1);
    }
  }

  console.log(
    `Source: ${
      source.type === "publication"
        ? `publication "${source.publication.name}" (${source.subdomain}.substack.com)`
        : "profile via /profile/posts"
    }`
  );

  let posts = [];
  let notes = [];

  if (includePosts) {
    console.log("Fetching posts...");
    posts = await fetchPosts({ client, profile: rawProfile, source, limit });
    if (dedupe && posts.length) {
      posts = dedupePosts(posts);
    }
    console.log(`Posts fetched: ${posts.length}`);
  }

  if (includePosts && includeFullBodies && posts.length) {
    console.log(`Enriching ${posts.length} posts with full body...`);
    await enrichPostBodies({ client, posts });
  }

  if (includeNotes) {
    console.log("Fetching notes...");
    notes = await fetchNotes({
      client,
      profile: rawProfile,
      limit,
      includeReplies
    });
    console.log(`Notes fetched: ${notes.length}`);
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
  console.log(`Export saved: ${outFile}`);

  if (skipConvert) {
    console.log("Conversion skipped (--skip-convert).");
    return { outFile, mdFiles: [] };
  }

  ensureDir(mdDir);
  const result = convertExport(data, {
    mdDir,
    includePosts: includePosts && posts.length > 0,
    includeNotes: includeNotes && notes.length > 0
  });
  console.log(
    `Converted: ${result.posts} article .md + ${result.notes} note file(s) to ${mdDir}/Articles and ${mdDir}/Notes`
  );
  return { outFile, mdDir, converted: result };
}
