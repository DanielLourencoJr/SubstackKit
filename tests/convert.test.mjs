import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { convertExport } from "../lib/convert/index.js";
import { buildExport } from "../lib/schema.js";
import post from "./fixtures/post.json" with { type: "json" };
import note from "./fixtures/note.json" with { type: "json" };

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "substack-kit-"));
}

test("convertExport writes posts to Articles/ and notes to Notes/", () => {
  const data = buildExport({
    profile: { id: 11, name: "Daniel", handle: "danielloureno1", url: "https://substack.com/@danielloureno1" },
    source: { type: "publication", slug: "danielloureno1", subdomain: "danielloureno1", method: "archive" },
    posts: [post],
    notes: [{ rawData: note }]
  });
  const dir = tempDir();
  convertExport(data, { mdDir: dir, includePosts: true });

  assert.ok(fs.existsSync(path.join(dir, "Articles", "example-post.md")));
  assert.ok(fs.existsSync(path.join(dir, "Notes", "notes-2026-08.md")));

  const article = fs.readFileSync(path.join(dir, "Articles", "example-post.md"), "utf8");
  assert.ok(article.startsWith("---\ntitle: Example Post"));

  const notes = fs.readFileSync(path.join(dir, "Notes", "notes-2026-08.md"), "utf8");
  assert.ok(notes.startsWith("# Notes Export"));
});
