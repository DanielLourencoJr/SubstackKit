# SubstackKit

Unified Substack tool: **download/export** public data (posts, notes, replies)
using the unofficial internal API the web app uses, and **upload/manage**
drafts and published posts (Markdown → Tiptap). Produces **one standard export
format** (JSON) and converts to **standard Markdown** (posts + monthly notes).

> ⚠️ Uses Substack internal endpoints and may break at any time. Read-only access
> to public content unless you use the write commands with your own credentials.
> Respect Substack's terms.

Unifies what used to live scattered across `SubstackScraper` (notes), `Essayer`
(posts) and `SubstackAPI` (API docs); the write side comes from `SubstackCLI`
(archived — `substack-cli` still works as a compat alias).

## Structure

```
SubstackKit/
├── bin/substack.js           # unified CLI (read commands + write namespaces)
├── bin/cli.js                # compat shim: substack-cli → write side
├── commands/                 # export | convert | fetch-new | lookup | edit | write
├── lib/                      # reusable core (importable)
│   ├── args.js credentials.js client.js profile.js posts.js notes.js enrich.js schema.js export.js
│   ├── auth.js md.js tiptap_convert.js frontmatter.js drafts.js images.js files.js sync.js
│   └── convert/              # html_to_md.js post_md.js pm_to_md.js note_md.js
├── docs/                     # API knowledge (AUTH, ENDPOINTS, API_REFERENCE, ...)
│   ├── EXPORT_SCHEMA.md      # the standard export format
│   └── REPLIES_API.md        # notes replies endpoint
├── skill/SKILL.md            # agent skill (installed to ~/.agents/skills/substack/)
├── install.sh                # installer (deps, bin links, credentials, skill)
├── out/                      # JSON exports (git-ignored)
├── texts/<author>/           # .md output from `export` and `fetch-new`
│   ├── Articles/             #   one .md per post, slug.md (YAML frontmatter)
│   └── Notes/                #   notes-YYYY-MM.md, grouped by month
├── .env.example              # SUBSTACK_SID=<your cookie>
└── tests/                    # offline converter + Tiptap round-trip tests
```

> **Where do the `.md` files go?** `export` writes **everything** into
> `texts/<author>/` (change with `--md-dir`): articles land in
> `texts/<author>/Articles/` and monthly notes in `texts/<author>/Notes/`.
> The standalone `convert` command uses `md/` by default (also changeable with
> `--md-dir`), with the same `Articles/` + `Notes/` layout. There is no
> ready-made `md/` folder in the repo: it is only created when you run
> `convert` without `--md-dir`.

> **Notes pagination:** `lib/notes.js:107` bypasses `substack-api`'s `profile.notes()`
> iterator (which silently truncated on `429`) and paginates `GET /reader/feed/profile/{id}?types=note&cursor=`
> with `retryFetch` + `800ms` gap, so the full history is exported (e.g. `290` notes back to `2025-12`).

## Requirements

- Node.js 18+
- `SUBSTACK_SID` — `substack.sid` session cookie (the library requires it even
  for public reads). Resolution order (see `lib/credentials.js`): `--env <file>`
  → shell export → `$SUBSTACK_CREDENTIALS_FILE` →
  `~/.config/substack/credentials.env` → `<projectsRoot>/.substack-credentials.env`
  → `<repo>/.env`. Writes default to the TEST account; MAIN is never
  auto-selected. `install.sh` wires this up.

## Install

```bash
./install.sh            # deps + ~/.local/bin/substack + credentials + skill
./install.sh --dry-run  # show what would happen
```

The installer links `substack` (and the `substack-cli` compat alias) into
`~/.local/bin`, points both sides at the central credential store, and
deploys `skill/SKILL.md` to `~/.agents/skills/substack/` so agents can use
the CLI. It is idempotent — re-run it after pulling updates.

## Usage

### Download everything (posts + notes + replies) and convert

```bash
node bin/substack.js export <handle> --author "Name"
```

1. Resolves the profile and its source (publication or profile).
2. Downloads **all** posts (automatic pagination) and enriches them with the
   full body (`GET /posts/by-id/{id}`).
3. Downloads **all** notes via direct `GET /reader/feed/profile/{id}?types=note&cursor=`
   pagination with `429` retry + `800ms` gap (full history, e.g. 290 notes back to
   `2025-12`) and recursive threaded replies (`GET /reader/comment/{id}/replies`).
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

## Write side (upload & manage)

> Uses undocumented `https://{pub}.substack.com/api/v1/drafts` (Tiptap JSON).
> May break anytime. No official affiliation.

### Create a draft from Markdown (never publishes)

```bash
node bin/substack.js drafts create ./post.md --pub <host>.substack.com --title "Hello" --json

# dry-run: show payload without POST
node bin/substack.js drafts create ./post.md --dry-run --json
```

Frontmatter in `post.md` overrides flags:

```yaml
---
title: FM Title
subtitle: FM Subtitle
audience: only_paid
tags: [a, b]
---
# Body...
![Alt](./local.png "Caption")  # local paths auto-upload to captionedImage
```

Two or more images side by side use a gallery block (max 9; optional text
after `:::gallery` becomes the caption for the group):

```markdown
:::gallery Pôster e trecho do mesmo autor
![Pôster](./poster.png)
![Trecho](./quote.png)
:::
```

### All write commands

```bash
node bin/substack.js drafts create <file.md> [--title t] [--subtitle s] [--pub host] [--audience everyone|only_paid] [--dry-run] [--json]
node bin/substack.js drafts list [--limit 20] [--offset 0] [--pub host] [--json]
node bin/substack.js drafts get <id> [--pub host] [--json]
node bin/substack.js drafts update <id> <file.md> [--title t] [--subtitle s] [--pub host]
node bin/substack.js drafts translate <id> <language> <file.md> [--title t] [--subtitle s] [--pub host]
node bin/substack.js drafts delete <id> [--pub host] [--yes] [--json]
node bin/substack.js drafts publish <id> [--send|--no-send] [--yes] [--pub host] [--json]   # --no-send is silent (default)
node bin/substack.js drafts schedule <id> --at 2027-01-01T12:00:00Z [--pub host]
node bin/substack.js drafts unschedule <id> [--pub host]
node bin/substack.js drafts export <id> [--output file.md] [--md-dir dir] [--pub host] [--json]
node bin/substack.js drafts counts [--pub host] [--json]
node bin/substack.js published list [--limit 20] [--offset 0] [--pub host] [--json]
node bin/substack.js scheduled list [--limit 20] [--pub host] [--json]
node bin/substack.js sync [--dir <path>] [--pub host] [--dry-run] [--yes] [--republish] [--no-pull] [--no-push] [--json]
```

### Mentions

A `@handle` is plain text unless you hand the CLI the matching Substack user.
Pass a JSON map (`--mentions mentions.json`) and the handle becomes a real
mention chip (which notifies the user when the post goes out):

```json
{
  "lemeiro": { "name": "Lemeiro", "id": 12345, "photo_url": "https://.../a.png" }
}
```

Handles missing from the map stay text, as does anything inside code or after
a word character (`a@lemeiro`). Captions are plain strings, so mentions there
are not converted.

### Folder sync

Folder sync uses this precedence: `--dir <path>`, `SUBSTACK_SYNC_DIR`, then
`./Articles`. Stores each post under its status and edition:

```text
Drafts/
  Originals/<slug>.md
  Translations/<language>/<slug>.md
Published/
  Originals/<slug>.md
  Translations/<language>/<slug>.md
```

Translation files keep the same Substack post `id` and include
`edition: translation` plus their language code in frontmatter. Pulls include
custom language editions; `--no-push` gives a read-only sync that only
organizes local files and downloads remote changes.

### Publish for review, then email

```bash
# Make the post public without emailing subscribers
node bin/substack.js drafts publish 123456789 --no-send --yes --pub <host>.substack.com

# Review the public URL printed by the command, then send the existing post
node bin/substack.js drafts publish 123456789 --send --yes --pub <host>.substack.com
```

The second command acts on the already-published post; it does not create
another post. For translated posts, readers are shown the custom edition
matching their device language when available.

### Edit a published post (read side `edit`)

```bash
node bin/substack.js edit <handle> <slug|id> --title "New title" --dry-run   # preview
node bin/substack.js edit <handle> <slug|id> --body-file new.md --no-publish # update, stay offline
```

`--send` emails ALL subscribers immediately and additionally requires
`--force`; without it the edit republishes silently.

### Safety

| Rule | Why |
| ---- | --- |
| `create` never publishes | drafts stay private until you say so |
| `publish` requires `--yes` | irreversible |
| default is `--no-send` (silent) | `--send` emails all subscribers, irreversibly |
| sync requires `--yes` to apply | `--dry-run` previews first |
| writes default to the TEST account | MAIN is never auto-selected (`lib/credentials.js`) |
| ~60 req/min global, 1 req/s safe | shared by read + write sides; see `docs/LIMITS.md` |

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
// write side
import { getSid, createDraft, updateDraft, publishDraft, syncFolder, mdToTiptap, draftToMarkdown } from "substack-kit";
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

# Write side: draft from Markdown, preview, push via sync
node bin/substack.js drafts create ./post.md --pub <host>.substack.com --dry-run --json
node bin/substack.js drafts list --limit 5 --json
node bin/substack.js sync --dir ./Articles --dry-run
node bin/substack.js sync --dir ./Articles --yes

# Compat alias (old SubstackCLI syntax) still works
substack-cli drafts list --limit 5 --json
```
