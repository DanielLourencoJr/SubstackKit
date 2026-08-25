import fs from "node:fs";
import path from "node:path";
import { ensureDir, slugSafe } from "../args.js";
import { formatPost, postFilename } from "./post_md.js";
import { formatNote, notesHeader, monthKeyFor } from "./note_md.js";

/**
 * Convert an export document to Markdown.
 *
 * opts:
 *   mdDir            - destination root (default "md")
 *   includeMeta      - "basic" | "full" (notes metadata detail)
 *   includeRestacks  - boolean, render restacked content in notes
 *   includeNotes     - boolean, write monthly notes-YYYY-MM.md files
 *   includePosts     - boolean, write per-slug post .md files
 *
 * Returns { posts: number, notes: number, noteFiles: string[] }.
 */
export function convertExport(data, opts = {}) {
  const {
    mdDir = "md",
    includeMeta = "basic",
    includeRestacks = true,
    includeNotes = true,
    includePosts = true
  } = opts;

  ensureDir(mdDir);
  const notes = Array.isArray(data?.notes) ? data.notes : [];
  const posts = Array.isArray(data?.posts) ? data.posts : [];

  const noteFiles = [];
  let postCount = 0;

  if (includeNotes && notes.length) {
    const notesOpts = { includeMeta, includeRestacks };
    const byMonth = new Map();
    for (const note of notes) {
      const key = monthKeyFor(note);
      if (!byMonth.has(key)) byMonth.set(key, []);
      byMonth.get(key).push(note);
    }
    const header = notesHeader(data);
    for (const month of Array.from(byMonth.keys()).sort()) {
      const monthNotes = byMonth.get(month);
      const body = monthNotes.map((n) => formatNote(n, notesOpts)).join("\n\n---\n\n");
      const outPath = path.join(mdDir, `notes-${month}.md`);
      fs.writeFileSync(outPath, header + "\n" + body + "\n");
      noteFiles.push(outPath);
      console.log(`Saved: ${outPath} (${monthNotes.length} notes)`);
    }
  }

  if (includePosts && posts.length) {
    for (const post of posts) {
      const outPath = path.join(mdDir, slugSafe(postFilename(post), "untitled"));
      fs.writeFileSync(outPath, formatPost(post));
      postCount += 1;
      console.log(`Saved: ${outPath}`);
    }
  }

  return { posts: postCount, notes: noteFiles.length, noteFiles };
}

export { formatPost, postFilename } from "./post_md.js";
export { formatNote, monthKeyFor } from "./note_md.js";
export { htmlToMarkdown } from "./html_to_md.js";
export {
  pmToMd,
  noteBodyToMd,
  formatRestack,
  formatPostRestack,
  formatImageRestack,
  formatVideoRestack,
  formatLinkRestack,
  formatPublicationRestack,
  renderReplyAttachment
} from "./pm_to_md.js";
