import fs from "node:fs";
import path from "node:path";
import { ensureDir } from "./args.js";
import { exportFilename } from "./schema.js";

/**
 * Write an export document to a JSON file under `outDir` using the standard
 * filename. Returns the written path.
 */
export function writeExport({ outDir = "out", handle, data, date = new Date() }) {
  ensureDir(outDir);
  const outFile = path.join(outDir, exportFilename(handle, date));
  fs.writeFileSync(outFile, JSON.stringify(data, null, 2));
  return outFile;
}

/**
 * Find the most recent export JSON in a directory (for convert-only flows).
 */
export function findLatestExport(dir, prefix = "substack-export-") {
  if (!fs.existsSync(dir)) return null;
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith(prefix) && f.endsWith(".json"))
    .map((f) => path.join(dir, f));
  if (!files.length) return null;
  files.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return files[0];
}

export function readExport(file) {
  const raw = fs.readFileSync(file, "utf8");
  return JSON.parse(raw);
}
