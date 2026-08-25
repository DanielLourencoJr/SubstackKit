import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pmToMd, noteBodyToMd } from "../lib/convert/pm_to_md.js";
import { escapeMdNotes } from "../lib/args.js";

const dir = path.dirname(fileURLToPath(import.meta.url));
const note = JSON.parse(fs.readFileSync(path.join(dir, "fixtures/note.json"), "utf8"));

test("pmToMd renders bold, italic, link, mention", () => {
  const doc = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "A " },
          { type: "text", marks: [{ type: "bold" }], text: "bold" },
          { type: "text", text: " and " },
          { type: "text", marks: [{ type: "italic" }], text: "itálico" },
          { type: "text", text: " and " },
          { type: "text", marks: [{ type: "link", attrs: { href: "https://x.com" } }], text: "link" },
          { type: "substack_mention", attrs: { label: "fulano" } }
        ]
      }
    ]
  };
  assert.equal(pmToMd(doc), "A **bold** and *itálico* and [link](https://x.com)@fulano\n\n");
});

test("pmToMd renders lists and blockquote", () => {
  const doc = {
    type: "doc",
    content: [
      {
        type: "bulletList",
        content: [
          { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "um" }] }] },
          { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "dois" }] }] }
        ]
      },
      {
        type: "orderedList",
        content: [
          { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "primeiro" }] }] }
        ]
      },
      {
        type: "blockquote",
        content: [{ type: "paragraph", content: [{ type: "text", text: "citação" }] }]
      }
    ]
  };
  const md = pmToMd(doc);
  assert.ok(md.includes("- um\n- dois\n"));
  assert.ok(md.includes("1. primeiro\n"));
  assert.ok(md.includes("> citação"));
});

test("noteBodyToMd uses ProseMirror body_json", () => {
  const md = noteBodyToMd(note);
  assert.equal(md, "Nota de exemplo com **destaque** e um [link](https://x.com) e um @mente\\.");
});

test("notes escaping escapes punctuation (notes standard)", () => {
  assert.equal(escapeMdNotes("a.b-c(d)e+f!g>h\\i"), "a\\.b\\-c\\(d\\)e\\+f\\!g\\>h\\\\i");
});
