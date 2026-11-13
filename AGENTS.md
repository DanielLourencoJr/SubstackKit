# AGENTS.md — substack-kit

## Project

Unified Substack tool: **download/export** public data (posts, notes, replies)
and **upload/manage** drafts and published posts.
One standard JSON export format (`substack-export@1`) and standard Markdown
conversion. Read side merged from `SubstackScraper` (notes), `Essayer` (posts)
and `SubstackAPI` (API docs); write side merged from `SubstackCLI` (now
archived — use `substack drafts|sync|published|scheduled` instead of
`substack-cli`).

## Architecture

ESM Node.js (18+). Dependency: `substack-api` v2.x (profile resolution only;
posts and notes hit the raw API directly via `client.substackClient.get(...)`
with `retryFetch` — see `lib/notes.js:107` for the notes pagination fix).
Write side has zero extra deps (native `fetch`, Tiptap JSON via `lib/md.js`).

| File | Purpose |
|---|---|
| `bin/substack.js` | CLI dispatcher: read commands + write namespaces (`drafts`/`published`/`scheduled`/`sync` → `commands/write.js`) |
| `bin/cli.js` | Compat shim: `substack-cli ...` → write side of `substack ...` |
| `commands/export.js` | Fetch posts + notes + replies, write export, convert |
| `commands/convert.js` | Convert an export JSON to Markdown |
| `commands/fetch-new.js` | Incremental new-posts download (RSS + `_preloads`) |
| `commands/lookup.js` | Find specific slugs in a profile's history |
| `commands/edit.js` | Edit published post/draft (PUT + publish), `--dry-run` preview |
| `commands/write.js` | Write side: `drafts *`, `published list`, `scheduled list`, `sync` |
| `lib/args.js` | Shared CLI/env/path/escaping helpers |
| `lib/credentials.js` | Portable SID resolution (envFile → shell → central store → local .env); TEST preferred, MAIN never auto-picked |
| `lib/client.js` | SubstackClient factory + 429 retry/backoff + raw fetch helpers |
| `lib/profile.js` | Handle → profile + source resolution (publication vs profile) |
| `lib/posts.js` | Post strategies: `archive`, `profile/posts`, `rss+preloads`; enrich bodies |
| `lib/notes.js` | Notes fetch (direct `GET /reader/feed/profile/{id}?types=note&cursor=` with 429 retry + 800ms gap, wrapping `rawData` to `Note` shape) + recursive threaded replies |
| `lib/enrich.js` | Optional PT-dedup of posts |
| `lib/schema.js` | `normalizePost`/`normalizeNote`/`buildExport` (the standard schema) |
| `lib/export.js` | Write/find/read export JSON |
| `lib/convert/*` | `html_to_md` (HTML→MD), `post_md` (posts+frontmatter), `pm_to_md` (ProseMirror+restacks), `note_md` (notes/monthly), `index` (orchestrator) |
| `lib/auth.js` | Write-side SID + `resolveBylines` (`GET /user/profile/self`) |
| `lib/md.js` | `mdToTiptap`/`parseInline` — Markdown → Tiptap draft_body |
| `lib/tiptap_convert.js` | `tiptapToMarkdown`/`draftToMarkdown` — reverse (renamed from SubstackCLI's `lib/convert.js` to avoid the `lib/convert/` dir) |
| `lib/frontmatter.js` | YAML `title/subtitle/audience/slug/tags` parse/stringify |
| `lib/drafts.js` | create/update/translate/get/delete/list/publish/schedule/count |
| `lib/images.js` | Local image upload → `captionedImage` + gallery blocks |
| `lib/files.js` | Local file-link handling (warn: host PDFs externally) |
| `lib/sync.js` | Folder ↔ publication sync with hash state (`.substack-sync.json`) |
| `install.sh` | Installer: deps, `~/.local/bin` links, credential wiring, skill deploy |
| `skill/SKILL.md` | Agent skill (deployed to `~/.agents/skills/substack/`) |
| `docs/` | API knowledge (see README) |

## Key Commands

```
# read side
node bin/substack.js export <handle> [--author Name] [--limit N] [--skip-convert] [--env file]
node bin/substack.js convert out/<file>.json [--md-dir md] [--include-posts true]
node bin/substack.js fetch-new <handle> --author Name
node bin/substack.js lookup <handle> <slug...>
node bin/substack.js edit <handle> <slug|id> [--title t] [--body-file f] [--dry-run] [--no-publish]

# write side
node bin/substack.js drafts create <file.md> [--pub host] [--dry-run] [--json]
node bin/substack.js drafts list|get|update|delete|publish|schedule|unschedule|export|translate|counts
node bin/substack.js published list | node bin/substack.js scheduled list
node bin/substack.js sync [--dir path] [--dry-run] [--yes] [--no-push]

node bin/substack.js --help
npm test    # offline unit tests (node --test tests/)
```

`substack-cli ...` still works (compat shim → write side only).

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
- **Rate limiting**: `retryFetch` backoff 2s→30s on 429; ~800ms between post pages
  and note pages, ~1.2s between reply calls. Per `docs/LIMITS.md` (~60 req/min global).
  Previous `profile.notes()` iterator swallowed 429 and truncated history at ~200
  notes — now fixed via raw pagination (`lib/notes.js:107`).
- **Windows paths**: scripts normalize `D:folder` → `D:\folder` automatically
  (`normalizeDir`). README examples use forward slashes.
- **Convert is a pure function of the export** — no re-download. `convertExport`
  in `lib/convert/index.js`.
- **`fetch-new` is incremental**: compares RSS slugs against existing `.md` slugs
  in `texts/<author>/Articles/`, then pulls each page's `window._preloads` JSON.
- **Output layout**: `convertExport` writes posts to `<mdDir>/Articles/<slug>.md`
  and monthly notes to `<mdDir>/Notes/notes-YYYY-MM.md` (dirs overridable via
  `postsDir`/`notesDir` opts). `fetch-new` scans the `Articles/` subfolder for
  known slugs.

### Write side (merged from SubstackCLI)

- **Credentials**: never hardcode paths — `lib/credentials.js` is the single
  resolver (`--env` → shell → `$SUBSTACK_CREDENTIALS_FILE` →
  `~/.config/substack/credentials.env` → central store → local `.env`).
  Central file is suffixed (`SUBSTACK_SID_TEST`/`_MAIN`): **TEST is the
  default, MAIN is never auto-selected** — pass `--env` or export
  `SUBSTACK_SID` to use MAIN deliberately.
- **Safety invariants**: `drafts create` never publishes; `drafts publish`
  requires `--yes`; `--send` emails all subscribers irreversibly (needs
  `--yes` too, and `edit --send` additionally needs `--force`). Default
  publish is `--no-send` (silent). Sync requires `--yes` to apply.
- **`draft_body` is stringified Tiptap JSON** (`API_REFERENCE.md:580`); raw
  object renders as visible markup. Markdown enters via `lib/md.js`
  (`mdToTiptap`) and leaves via `lib/tiptap_convert.js` (`draftToMarkdown`).
  Opaque `substack-cli-node`/`substack-cli-inline` comments keep unsupported
  blocks/mark lossless across round trips.
- **Two `convert` modules existed**: Kit's `lib/convert/` (export→md) vs
  CLI's `lib/convert.js` (Tiptap→md) — the latter is now
  `lib/tiptap_convert.js`. Do not rename it back.
- **Rate limit is global (~60 req/min, ~1 req/s safe)** — read and write
  sides share it. Images upload with 200 ms gaps (`lib/images.js`).
- **Sync state**: `.substack-sync.json` keyed by post id + language, stores
  `lastHash`/`remoteUpdatedAt`. Directory precedence: `--dir` →
  `SUBSTACK_SYNC_DIR` → `./Articles`.
- **Frontmatter overrides flags are the reverse of Kit**: in write commands,
  YAML frontmatter values are used when flags are absent; CLI flags win.
- **`drafts translate` works on published posts**: `translateDraft` PUTs the
  draft with `translations: [edition]` and never republishes — the live post
  stays untouched (`wasPublished` is returned for CLI messaging). Editions
  have **no independent publish state**: to make a pushed edition live, run a
  silent `drafts publish <id> --no-send --yes` (no email, primary body
  byte-identical if unedited). **Verify editions via
  `GET {pub}/posts/{id}/translate?bodyFormat=html` + `Accept-Language` — the
  post page HTML always renders the primary language**, so page fetches
  falsely look like the edition is missing. Full model/gotchas:
  `docs/TRANSLATIONS.md`.
- **Export reading artifacts are stripped on push**: `stripExportArtifacts`
  in `lib/md.js` runs in `createDraft`/`updateDraft`/`translateDraft` and
  removes the `convert`-generated header (`# title`, `> subtitle`,
  `**Published:**` block, `![Cover]`) so pushed bodies don't duplicate
  frontmatter; a stripped subtitle not repeated in the body is promoted to
  the subtitle field.

## Files to modify

- `lib/schema.js` — if adding fields to the standard export.
- `lib/convert/post_md.js` — post `.md` format (YAML frontmatter / meta).
- `lib/convert/note_md.js` — note/monthly `.md` format (also fixes header/source).
- `lib/posts.js` — new fetch strategies or enrichment.
- `lib/notes.js` — reply fetching logic.
- `lib/credentials.js` — credential resolution order (both sides).
- `commands/write.js` — write-side CLI behavior/flags.
- `lib/drafts.js` / `lib/sync.js` — draft lifecycle / folder sync logic.
- `commands/*.js` — CLI behavior/flags. Update the flag tables in `README.md`.
- `skill/SKILL.md` — agent-facing workflows; keep in sync with CLI changes.
- `docs/EXPORT_SCHEMA.md` — keep in sync with `lib/schema.js`.
- `docs/TRANSLATIONS.md` — language-edition model/API/verification; update if
  the translation flow changes.

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
