import { getArg, normalizeDir, hasFlag } from "../lib/args.js";
import { findLatestExport, readExport } from "../lib/export.js";
import { convertExport } from "../lib/convert/index.js";

export const description = "Converts an export JSON to Markdown (posts + notes).";

export const usage =
  "substack convert <export.json> [--md-dir md] [--include-meta basic|full] " +
  "[--include-restacks true|false] [--include-posts true|false] [--no-notes]";

export async function run(positional) {
  let input = positional[0] || getArg("in");
  if (!input) {
    const dir = getArg("dir", "out");
    input = findLatestExport(dir);
  }
  if (!input) {
    console.error(`Usage: ${usage}`);
    console.error("No export found; pass a JSON path or use --dir <out>.");
    process.exit(1);
  }

  const data = readExport(input);
  const mdDir = normalizeDir(getArg("md-dir", "md"));
  const includeMeta = getArg("include-meta", "basic");
  const includeRestacks = getArg("include-restacks", "true") === "true";
  const includePosts = getArg("include-posts", "false") === "true";
  const includeNotes = !hasFlag("no-notes");

  console.log(`Reading: ${input}`);
  const result = convertExport(data, {
    mdDir,
    includeMeta,
    includeRestacks,
    includeNotes,
    includePosts
  });
  console.log(
    `Converted to ${mdDir}: ${result.posts} posts, ${result.notes} note file(s).`
  );
  return result;
}
