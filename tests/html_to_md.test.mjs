import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { htmlToMarkdown } from "../lib/convert/html_to_md.js";

const dir = path.dirname(fileURLToPath(import.meta.url));
const post = JSON.parse(fs.readFileSync(path.join(dir, "fixtures/post.json"), "utf8"));

test("htmlToMarkdown converts headings with offset", () => {
  assert.equal(htmlToMarkdown("<h1>Title</h1>"), "## Title\n");
});

test("htmlToMarkdown converts inline marks and links", () => {
  const md = htmlToMarkdown('<p>Hello <strong>world</strong> and <a href="https://x.com">link</a>.</p>');
  assert.equal(md, "Hello **world** and [link](https://x.com).\n");
});

test("htmlToMarkdown converts lists", () => {
  const md = htmlToMarkdown("<ul><li><p>Item <em>one</em></p></li><li><p>Item two</p></li></ul>");
  assert.equal(md, "- Item *one*\n- Item two\n");
});

test("htmlToMarkdown converts blockquote", () => {
  assert.equal(htmlToMarkdown("<blockquote><p>Quote.</p></blockquote>"), "> Quote.\n");
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
  const md = htmlToMarkdown('<div class="subscription-widget">IGNORED</div><p>End.</p>');
  assert.equal(md, "End.\n");
});

test("htmlToMarkdown renders figure with caption", () => {
  const md = htmlToMarkdown('<figure><img src="https://img/x.png" alt="x"><figcaption>Caption</figcaption></figure>');
  assert.equal(md, "![x](https://img/x.png)\n\n*Caption*\n");
});

test("formatPost golden (frontmatter + body)", async () => {
  const { formatPost } = await import("../lib/convert/post_md.js");
  const md = formatPost(post);
  const expected = `---
title: Example Post
slug: example-post
url: "https://example.substack.com/p/example-post"
date: "2026-08-01T12:00:00.000Z"
likes: 4
comments: 2
tags: essay, history
language: pt
---

# Example Post

> Post subtitle
**Published:** 2026-08-01 09:00:00 GMT-3  
**URL:** https://example.substack.com/p/example-post  
**Tags:** essay, history  
*Language: pt*  
*Words: 120*  
**Likes:** 4  
**Restacks:** 1  
**Comments:** 2

![Cover](https://img/cover.png)

## Title

Hello **world** and [link](https://x.com).

- Item *one*
- Item two

> Quote.

| A | B |
| --- | --- |
| 1 | 2 |

\`\`\`
const x = 1;
\`\`\`

![x](https://img/x.png)

*Caption*

---

End.
`;
  assert.equal(md, expected);
});
