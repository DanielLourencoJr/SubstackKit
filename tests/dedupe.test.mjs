import { test } from "node:test";
import assert from "node:assert/strict";
import { dedupePosts } from "../lib/enrich.js";

const pt = (id, title, publishedAt, wordcount) => ({
  id,
  slug: `slug-${id}`,
  title,
  publishedAt,
  language: "pt",
  wordcount
});

const en = (id, title, publishedAt, wordcount) => ({
  id,
  slug: `slug-${id}`,
  title,
  publishedAt,
  language: "en",
  wordcount
});

test("keeps unique posts untouched", () => {
  const posts = [pt(1, "Um post qualquer sobre história", "2026-08-01", 1000)];
  assert.equal(dedupePosts(posts).length, 1);
});

test("drops non-PT duplicate of a PT post", () => {
  const posts = [
    pt(1, "A grande história da humanidade e seus detalhes", "2026-08-01", 1000),
    en(2, "The great history of humanity and its details", "2026-08-01", 1050)
  ];
  const kept = dedupePosts(posts);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].id, 1);
});

test("keeps non-PT post when dates are far apart", () => {
  const posts = [
    pt(1, "A grande história da humanidade e seus detalhes", "2026-08-01", 1000),
    en(2, "The great history of humanity and its details", "2025-01-01", 1050)
  ];
  const kept = dedupePosts(posts);
  assert.equal(kept.length, 2);
});
