# SubstackKit

Unified downloader/exporter for Substack public data (posts, notes, replies) using
the unofficial internal API the web app uses. Produces **one standard export
format** (JSON) and converts to **standard Markdown** (posts + monthly notes).

> ⚠️ Uses Substack internal endpoints and may break at any time. Read-only access
> to public content. Respect Substack's terms.

Unifies what used to live scattered across `SubstackScraper` (notes), `Essayer`
(posts) and `SubstackAPI` (API docs).

## Structure

```
SubstackKit/
├── bin/substack.js           # unified CLI (subcommands)
├── commands/                 # export | convert | fetch-new | lookup
├── lib/                      # reusable core (importable)
│   ├── args.js client.js profile.js posts.js notes.js enrich.js schema.js export.js
│   └── convert/              # html_to_md.js post_md.js pm_to_md.js note_md.js
├── docs/                     # API knowledge (AUTH, ENDPOINTS, API_REFERENCE, ...)
│   ├── EXPORT_SCHEMA.md      # the standard export format
│   └── REPLIES_API.md        # notes replies endpoint
├── out/                      # JSON exports (git-ignored)
├── texts/<author>/           # .md output from `export` and `fetch-new`
│   ├── Articles/             #   one .md per post, slug.md (YAML frontmatter)
│   └── Notes/                #   notes-YYYY-MM.md, grouped by month
├── .env.example              # SUBSTACK_SID=<your cookie>
└── tests/                    # offline converter tests
```

> **Where do the `.md` files go?** `export` writes **everything** into
> `texts/<author>/` (change with `--md-dir`): articles land in
> `texts/<author>/Articles/` and monthly notes in `texts/<author>/Notes/`.
> The standalone `convert` command uses `md/` by default (also changeable with
> `--md-dir`), with the same `Articles/` + `Notes/` layout. There is no
> ready-made `md/` folder in the repo: it is only created when you run
> `convert` without `--md-dir`.

## Requirements

- Node.js 18+
- `SUBSTACK_SID` — `substack.sid` session cookie (the library requires it even
  for public reads). Put it in `.env` (git-ignored) or use `--env <file>`.

## Usage

### Download everything (posts + notes + replies) and convert

```bash
node bin/substack.js export <handle> --author "Name"
```

1. Resolves the profile and its source (publication or profile).
2. Downloads **all** posts (automatic pagination) and enriches them with the
   full body (`GET /posts/by-id/{id}`).
3. Downloads notes + recursive threaded replies.
4. Saves the standard export to `out/substack-export-<handle>-<timestamp>.json`.
5. Converts posts to `.md` in `texts/<author>/Articles/` (YAML frontmatter) and
   monthly notes to `texts/<author>/Notes/notes-YYYY-MM.md`.

### Convert an existing export

```bash
node bin/substack.js convert out/substack-export-<handle>-<timestamp>.json --md-dir md
```

### Download only new posts (incremental)

```bash
node bin/substack.js fetch-new <handle> --author "Name"
```

Reads the publication's RSS `/feed`, compares against the slugs already in
`texts/<author>/Articles/`, and downloads the new ones via the
`window._preloads` JSON of each post page.

### Find specific slugs

```bash
node bin/substack.js lookup <handle> <slug1> <slug2> ...
```

## Flags — `export`

| Flag                | Default                    | Description                                  |
| ------------------- | -------------------------- | -------------------------------------------- |
| `<handle>`          | (required)                 | Profile/publication handle                   |
| `--author` / `-a`   | the handle itself          | Name of the `.md` destination folder         |
| `--posts` / `--no-posts` | `true`               | Include posts in the export                  |
| `--notes` / `--no-notes` | `true`               | Include notes in the export                  |
| `--no-replies`      | off (fetches replies)      | Skip recursive reply fetching                |
| `--no-full-bodies`  | off (fetches full body)    | Skip enrichment via `/posts/by-id`           |
| `--limit`           | `0` (all)                  | Max posts/notes to download                  |
| `--source`          | `auto`                     | `auto`\|`publication`\|`profile`             |
| `--dedupe`          | off                        | Discard non-PT posts that duplicate PT posts |
| `--out`             | `out`                      | JSON export folder                           |
| `--env`             | `.env` (repo root)         | `.env` file with `SUBSTACK_SID`              |
| `--skip-convert`    | off                        | Export only, do not convert to `.md`         |
| `--md-dir`          | `texts/<author>`           | Root folder (articles → `Articles/`, notes → `Notes/`) |

## Flags — `convert`

| Flag                 | Default                    | Description                               |
| -------------------- | -------------------------- | ----------------------------------------- |
| `<export.json>`      | (latest in `out/`)         | Path of the export JSON                    |
| `--md-dir`           | `md`                       | Root folder (articles → `Articles/`, notes → `Notes/`) |
| `--include-meta`     | `basic`                    | `basic`\|`full` (notes metadata)          |
| `--include-restacks` | `true`                     | Render restacked content in notes         |
| `--include-posts`    | `true`                     | Convert posts (use `--no-posts` to skip)   |
| `--no-posts`         | off                        | Skip article conversion                    |
| `--no-notes`         | off                        | Skip note conversion                       |

## Export standards

| Artifact | Format |
| -------- | ------ |
| JSON     | `substack-export@1` — see `docs/EXPORT_SCHEMA.md` |
| Articles `.md` | one file per post in `Articles/<slug>.md`, with YAML frontmatter (`title`, `slug`, `url`, `date`, `likes`, `comments`, `tags`, `language`) |
| Notes `.md` | `Notes/notes-YYYY-MM.md`, grouped by month, with header and `---` separator between notes |

Converters are verified by golden tests: notes output matches
`SubstackScraper/notes_to_md.js` byte-for-byte.

## Using it as a library

The core is importable:

```js
import { resolveProfile, fetchPosts, fetchNotes, buildExport, convertExport } from "substack-kit";
```

See `lib/index.js` for the full API.

## API documentation

All reverse-engineered knowledge about Substack's internal API lives in `docs/`:

- `AUTH.md` — `substack.sid` cookie, scopes, base URLs
- `ENDPOINTS.md` — quick table of ~130 endpoints
- `API_REFERENCE.md` — detailed reference with JSON examples
- `CONTENT_FORMATS.md` — Tiptap (drafts) vs ProseMirror (notes)
- `LIMITS.md` — rate limits (~60 req/min) and size limits
- `REPLIES_API.md` — notes replies
- `EXPORT_SCHEMA.md` — the standard export format

## Idempotency

`export` always writes a new timestamped file in `out/`. `fetch-new` is
incremental by design: it only downloads slugs not yet converted in the
destination folder.

## Examples

```bash
# Export + convert everything
node bin/substack.js export danielloureno1 --author "Daniel"

# Only the 3 most recent posts, without converting
node bin/substack.js export <handle> --limit 3 --skip-convert

# Convert an already-saved export
node bin/substack.js convert out/substack-export-<handle>-20260825-120000.json --md-dir md

# Download only new posts and convert to the author folder
node bin/substack.js fetch-new <handle> --author "Name"
```
