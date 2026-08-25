import { getArg, normalizeDir, hasFlag } from "../lib/args.js";
import { findLatestExport, readExport } from "../lib/export.js";
import { convertExport } from "../lib/convert/index.js";

export const description = "Converte um export JSON para Markdown (posts + notas).";

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
    console.error(`Uso: ${usage}`);
    console.error("Nenhum export encontrado; passe o caminho do JSON ou use --dir <out>.");
    process.exit(1);
  }

  const data = readExport(input);
  const mdDir = normalizeDir(getArg("md-dir", "md"));
  const includeMeta = getArg("include-meta", "basic");
  const includeRestacks = getArg("include-restacks", "true") === "true";
  const includePosts = getArg("include-posts", "false") === "true";
  const includeNotes = !hasFlag("no-notes");

  console.log(`Lendo: ${input}`);
  const result = convertExport(data, {
    mdDir,
    includeMeta,
    includeRestacks,
    includeNotes,
    includePosts
  });
  console.log(
    `Convertido para ${mdDir}: ${result.posts} posts, ${result.notes} arquivo(s) de notas.`
  );
  return result;
}
