import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { htmlToMarkdown } from "../lib/convert/html_to_md.js";

const dir = path.dirname(fileURLToPath(import.meta.url));
const post = JSON.parse(fs.readFileSync(path.join(dir, "fixtures/post.json"), "utf8"));

test("htmlToMarkdown converts headings with offset", () => {
  assert.equal(htmlToMarkdown("<h1>Título</h1>"), "## Título\n");
});

test("htmlToMarkdown converts inline marks and links", () => {
  const md = htmlToMarkdown('<p>Olá <strong>mundo</strong> e <a href="https://x.com">link</a>.</p>');
  assert.equal(md, "Olá **mundo** e [link](https://x.com).\n");
});

test("htmlToMarkdown converts lists", () => {
  const md = htmlToMarkdown("<ul><li><p>Item <em>um</em></p></li><li><p>Item dois</p></li></ul>");
  assert.equal(md, "- Item *um*\n- Item dois\n");
});

test("htmlToMarkdown converts blockquote", () => {
  assert.equal(htmlToMarkdown("<blockquote><p>Citação.</p></blockquote>"), "> Citação.\n");
});

test("htmlToMarkdown converts tables", () => {
  const md = htmlToMarkdown("<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>");
  assert.equal(md, "| A | B |\n| --- | --- |\n| 1 | 2 |\n");
});

test("htmlToMarkdown converts code blocks", () => {
  const md = htmlToMarkdown("<pre><code>const x = 1;</code></pre>");
  assert.equal(md, "```\nconst x = 1;\n```\n");
});

test("htmlToMarkdown drops subscription widgets", () => {
  const md = htmlToMarkdown('<div class="subscription-widget">IGNORADO</div><p>Fim.</p>');
  assert.equal(md, "Fim.\n");
});

test("htmlToMarkdown renders figure with caption", () => {
  const md = htmlToMarkdown('<figure><img src="https://img/x.png" alt="x"><figcaption>Legenda</figcaption></figure>');
  assert.equal(md, "![x](https://img/x.png)\n\n*Legenda*\n");
});

test("formatPost golden (frontmatter + body)", async () => {
  const { formatPost } = await import("../lib/convert/post_md.js");
  const md = formatPost(post);
  const expected = `---
title: Exemplo de Post
slug: exemplo-de-post
url: "https://exemplo.substack.com/p/exemplo-de-post"
date: "2026-08-01T12:00:00.000Z"
likes: 4
comments: 2
tags: ensaio, historia
language: pt
---

# Exemplo de Post

> Subtítulo do post
**Publicado:** 2026-08-01 09:00:00 GMT-3  
**URL:** https://exemplo.substack.com/p/exemplo-de-post  
**Tags:** ensaio, historia  
*Idioma: pt*  
*Palavras: 120*  
**Likes:** 4  
**Restacks:** 1  
**Comments:** 2

![Cover](https://img/cover.png)

## Título

Olá **mundo** e [link](https://x.com).

- Item *um*
- Item dois

> Citação.

| A | B |
| --- | --- |
| 1 | 2 |

\`\`\`
const x = 1;
\`\`\`

![x](https://img/x.png)

*Legenda*

---

Fim.
`;
  assert.equal(md, expected);
});
