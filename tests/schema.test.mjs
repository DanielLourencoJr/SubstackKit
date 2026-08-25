import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizePost, normalizeNote, buildExport } from "../lib/schema.js";

const dir = path.dirname(fileURLToPath(import.meta.url));
const post = JSON.parse(fs.readFileSync(path.join(dir, "fixtures/post.json"), "utf8"));
const note = JSON.parse(fs.readFileSync(path.join(dir, "fixtures/note.json"), "utf8"));

test("normalizePost picks canonical fields", () => {
  const p = normalizePost(post);
  assert.equal(p.title, "Exemplo de Post");
  assert.equal(p.publishedAt, "2026-08-01T12:00:00.000Z");
  assert.equal(p.likesCount, 4);
  assert.equal(p.commentsCount, 2);
  assert.equal(p.tags.length, 2);
  assert.equal(p.body_html.includes("<h1>"), true);
  assert.equal(p.source, "publication");
});

test("normalizeNote maps rawData fields + author + replies", () => {
  const n = normalizeNote({ rawData: note });
  assert.equal(n.id, 555);
  assert.equal(n.entityKey, "c-555");
  assert.equal(n.publishedAt, "2026-08-02T15:30:00.000Z");
  assert.equal(n.likes, 3);
  assert.equal(n.author.name, "Daniel");
  assert.equal(n.author.primaryPublication.name, "Daniel Lourenço");
  assert.equal(n.url, "https://substack.com/notes/c-555");
  assert.equal(n.replies.length, 1);
  assert.equal(n.replies[0].depth, 0);
});

test("buildExport produces schema version + counts", () => {
  const data = buildExport({
    profile: { id: 11, name: "Daniel", handle: "danielloureno1", url: "https://substack.com/@danielloureno1" },
    source: { type: "profile", slug: "danielloureno1", method: "profile/posts" },
    posts: [post],
    notes: [{ rawData: note }],
    options: { includePosts: true, includeNotes: true, includeReplies: true }
  });
  assert.equal(data.schema, "substack-export@1");
  assert.equal(data.meta.counts.posts, 1);
  assert.equal(data.meta.counts.notes, 1);
  assert.equal(data.meta.counts.replies, 1);
  assert.equal(data.meta.options.dedupe, false);
});
