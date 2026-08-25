# AGENTS.md — substack-kit

## Project

Unified downloader/exporter for Substack public data (posts, notes, replies).
One standard JSON export format (`substack-export@1`) and standard Markdown
conversion. Merged from `SubstackScraper` (notes), `Essayer` (posts) and
`SubstackAPI` (API docs).

## Architecture

ESM Node.js (18+). Dependency: `substack-api` v2.x (profile resolution + notes
iterator; the important calls hit the raw API directly via
`client.substackClient.get(...)`).

| File | Purpose |
|---|---|
| `bin/substack.js` | CLI dispatcher (`export`/`convert`/`fetch-new`/`lookup`) |
| `commands/export.js` | Fetch posts + notes + replies, write export, convert |
| `commands/convert.js` | Convert an export JSON to Markdown |
| `commands/fetch-new.js` | Incremental new-posts download (RSS + `_preloads`) |
| `commands/lookup.js` | Find specific slugs in a profile's history |
| `lib/args.js` | Shared CLI/env/path/escaping helpers |
| `lib/client.js` | SubstackClient factory + 429 retry/backoff + raw fetch helpers |
| `lib/profile.js` | Handle → profile + source resolution (publication vs profile) |
| `lib/posts.js` | Post strategies: `archive`, `profile/posts`, `rss+preloads`; enrich bodies |
| `lib/notes.js` | Notes fetch + recursive threaded replies |
| `lib/enrich.js` | Optional PT-dedup of posts |
| `lib/schema.js` | `normalizePost`/`normalizeNote`/`buildExport` (the standard schema) |
| `lib/export.js` | Write/find/read export JSON |
| `lib/convert/*` | `html_to_md` (HTML→MD), `post_md` (posts+frontmatter), `pm_to_md` (ProseMirror+restacks), `note_md` (notes/monthly), `index` (orchestrator) |
| `docs/` | API knowledge (see README) |

## Key Commands

```
node bin/substack.js export <handle> [--author Name] [--limit N] [--skip-convert] [--env .env]
node bin/substack.js convert out/<file>.json [--md-dir md] [--include-posts true]
node bin/substack.js fetch-new <handle> --author Name
node bin/substack.js lookup <handle> <slug...>
node bin/substack.js --help
npm test    # offline unit tests (node --test tests/)
```

## The standard export schema

`substack-export@1`: `{ schema, meta, posts[], notes[] }`. Normalized fields are
the contract; `rawData` kept for fidelity. Full reference in
`docs/EXPORT_SCHEMA.md`. `lib/schema.js` is the single place that builds it.

## Conventions & Gotchas

- **Two escaping modes**: posts use `escapeMd` (`[\\\`*_{}[]<>#|]`) from `lib/args.js`;
  notes/replies use `escapeMdNotes` (adds `. - ( ) + ! >`). Do NOT mix them — the
  golden tests pin notes vs posts output byte-for-byte.
- **`substack.sid` required even for public profiles** — the library needs it to
  authenticate. Stored in `.env` as `SUBSTACK_SID` (git-ignored) or `--env`.
- **Reply bodies are never in the notes feed.** `children_count` is just a count.
  Real bodies come from `GET /reader/comment/{id}/replies` (recursive), stored in
  `rawData.replies` and `notes[].replies`. See `docs/REPLIES_API.md`.
- **Reply comments have NO `handle`** — only `name`.
- **Restacks** are attachments with `type: "comment"` (or `"post"`, `"image"`,
  `"link"`, `"video"`, `"publication"`, `"missing"`) inside
  `notes[].attachments`. Not replies.
- **`/profile/posts` rejects `offset` (400)** — cursor pagination only.
- **ProseMirror (`body_json`)**: notes use `bold`/`italic` marks (NOT `strong`/`em`).
  `pmToMd` in `lib/convert/pm_to_md.js` handles `paragraph`, `bulletList`,
  `orderedList`, `blockquote`, `hard_break`, `substack_mention`, `image`;
  unsupported node types are dropped.
- **HTML→MD**: `htmlToMarkdown` in `lib/convert/html_to_md.js` is the single
  tokenizer (tables, lists, figures, code, widgets filtered). Used for post bodies.
- **Rate limiting**: `retryFetch` backoff 2s→30s on 429; ~800ms between post pages,
  ~1.2s between reply calls. Per `docs/LIMITS.md` (~60 req/min global).
- **Windows paths**: scripts normalize `D:folder` → `D:\folder` automatically
  (`normalizeDir`). README examples use forward slashes.
- **Convert is a pure function of the export** — no re-download. `convertExport`
  in `lib/convert/index.js`.
- **`fetch-new` is incremental**: compares RSS slugs against existing `.md` slugs
  in `texts/<author>/`, then pulls each page's `window._preloads` JSON.

## Files to modify

- `lib/schema.js` — if adding fields to the standard export.
- `lib/convert/post_md.js` — post `.md` format (YAML frontmatter / meta).
- `lib/convert/note_md.js` — note/monthly `.md` format (also fixes header/source).
- `lib/posts.js` — new fetch strategies or enrichment.
- `lib/notes.js` — reply fetching logic.
- `commands/*.js` — CLI behavior/flags. Update the flag tables in `README.md`.
- `docs/EXPORT_SCHEMA.md` — keep in sync with `lib/schema.js`.

## Tests

Golden tests pin the converter output (notes match the legacy
`SubstackScraper/notes_to_md.js` byte-for-byte; posts follow the Essayer format
with English meta labels). To re-verify against the old repos:

```
node /mnt/windows/Junior/Projects/Essayer/scripts/post_to_md.js --in out/<export>.json --md-dir /tmp/old
node /mnt/windows/Junior/Projects/SubstackScraper/notes_to_md.js --in out/<export>.json --md-dir /tmp/old2
node bin/substack.js convert out/<export>.json --md-dir /tmp/new
diff -r /tmp/old /tmp/new
```
