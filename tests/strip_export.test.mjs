import { test } from "node:test";
import assert from "node:assert/strict";
import { stripExportArtifacts } from "../lib/md.js";

// Shape produced by lib/convert/post_md.js formatPost(): title heading,
// `> subtitle` blockquote, metadata/stats block (hard-wrapped with two
// trailing spaces), cover image, then the real body.
const exported = [
  "# Experimentando Omarchy",
  "",
  "> Aqui eu vou relatar a instalação, o uso e as minhas impressões sobre Omarchy, um sistema operacional baseado em Arch Linux.",
  "**Published:** 2026-11-11 06:50:20 GMT-3  ",
  "**URL:** https://example.substack.com/p/experimentando-omarchy  ",
  "**Tags:** Tecnologia  ",
  "*Words: 1735*  ",
  "**Likes:** 6  ",
  "**Restacks:** 1",
  "",
  "![Cover](https://substackcdn.com/image/fetch/x/cover.png)",
  "",
  "Aqui eu vou relatar a instalação, o uso e as minhas impressões sobre Omarchy, um sistema operacional baseado em Arch Linux.",
  "",
  "Minha trajetória com sistemas operacionais começou com o Windows 10.",
].join("\n");

test("strips export header when title matches", () => {
  const { markdown, subtitle } = stripExportArtifacts(exported, { title: "Experimentando Omarchy" });
  assert.ok(!markdown.startsWith("#"));
  assert.ok(!markdown.includes("**Published:**"));
  assert.ok(!markdown.includes("**URL:**"));
  assert.ok(!markdown.includes("Words: 1735"));
  assert.ok(!markdown.includes("![Cover]("));
  assert.ok(!markdown.startsWith(">"));
  assert.ok(markdown.startsWith("Aqui eu vou relatar"));
  assert.ok(markdown.includes("Minha trajetória"));
  // dek already lives in the body → not promoted to the subtitle field
  assert.equal(subtitle, null);
});

test("keeps the subtitle when the body does not repeat it", () => {
  const noDekInBody = exported.replace(
    "Aqui eu vou relatar a instalação, o uso e as minhas impressões sobre Omarchy, um sistema operacional baseado em Arch Linux.\n\n",
    ""
  );
  const { markdown, subtitle } = stripExportArtifacts(noDekInBody, { title: "Experimentando Omarchy" });
  assert.ok(markdown.startsWith("Minha trajetória"));
  assert.equal(subtitle, "Aqui eu vou relatar a instalação, o uso e as minhas impressões sobre Omarchy, um sistema operacional baseado em Arch Linux.");
});

test("drops a title-duplicating H1 even without a metadata block", () => {
  const hand = "# My Post\n\n> A lead-in quote I wrote on purpose.\n\nReal first paragraph.";
  const { markdown, subtitle } = stripExportArtifacts(hand, { title: "My Post" });
  assert.equal(markdown, "> A lead-in quote I wrote on purpose.\n\nReal first paragraph.");
  assert.equal(subtitle, null);
});

test("leaves hand-written bodies untouched", () => {
  const body = "Just a paragraph.\n\nAnother one, with **bold** in it.";
  const { markdown, subtitle } = stripExportArtifacts(body, { title: "X" });
  assert.equal(markdown, body);
  assert.equal(subtitle, null);
});

test("keeps a leading H1 when no title is given, still strips the metadata", () => {
  const { markdown, subtitle } = stripExportArtifacts(exported, {});
  assert.ok(markdown.startsWith("# Experimentando Omarchy\n\nAqui eu vou relatar"));
  assert.ok(!markdown.includes("**Published:**"));
  assert.ok(!markdown.includes("![Cover]("));
  assert.equal(subtitle, null);
});

test("keeps a leading H1 that differs from the title", () => {
  const { markdown } = stripExportArtifacts(exported, { title: "Something Else" });
  assert.ok(markdown.startsWith("# Experimentando Omarchy\n\nAqui eu vou relatar"));
  assert.ok(!markdown.includes("**Published:**"));
});

test("does not strip when the metadata anchor is far from the top", () => {
  const body = "Intro paragraph.\n\n**Published:** not metadata, too far down to matter";
  const { markdown } = stripExportArtifacts(body, { title: "X" });
  assert.equal(markdown, body);
});

test("empty and non-string input are safe", () => {
  assert.deepEqual(stripExportArtifacts("", { title: "X" }), { markdown: "", subtitle: null });
  assert.deepEqual(stripExportArtifacts(null, { title: "X" }), { markdown: null, subtitle: null });
});
