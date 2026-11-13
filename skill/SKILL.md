---
name: substack
description: >
  Download, read, review, edit, update and report on real Substack content
  through the unified `substack` CLI (SubstackKit + SubstackCLI merged).
  Use when the user asks to download/export/fetch Substack articles or notes,
  read someone's posts, review or critique an article, edit/update/republish
  one of their own posts, manage drafts, sync the Articles folder, schedule or
  publish a post, or produce a report/summary of Substack content. Triggers:
  substack, substack article, download post, export publication, review my
  post, edit draft, publish newsletter, sync articles, substack notes,
  substack draft, report on articles.
---

# Substack CLI

Unified CLI for **reading** (download/export public data) and **writing**
(upload/manage drafts and posts) Substack content. Installed as `substack` on
`PATH` (compat alias: `substack-cli` = write side only). If the command is
missing, run `<repo>/install.sh` from the SubstackKit repo.

```bash
substack --help                     # all commands
substack <command> --help           # flags for one command
```

## Credentials & accounts

One resolver (`lib/credentials.js`) finds the `substack.sid` cookie:
`--env <file>` → shell export → `$SUBSTACK_CREDENTIALS_FILE` →
`~/.config/substack/credentials.env` → `<projectsRoot>/.substack-credentials.env`
→ local `.env`. You rarely need `--env`.

**Account rules (non-negotiable):**

- Writes (`drafts *`, `sync`, `edit`) **default to the TEST account**; MAIN is
  never auto-selected. Pass `--env` explicitly if the user asks for MAIN.
- Never print, echo, or commit a `SUBSTACK_SID` value. Never read credential
  files into chat — only run the CLI.
- Rate limit: ~60 req/min global, ~1 req/s safe (shared by both sides). Do not
  parallel-burst export/sync calls; 429s back off automatically but waste time.

## Workflow: download → read → act

### 1. Download real articles

```bash
substack export <handle> --author "Name"          # everything (posts+notes+replies)
substack export <handle> --limit 5 --author "Name"  # just the latest 5
substack fetch-new <handle> --author "Name"       # only new ones (incremental)
substack lookup <handle> <slug> <slug>            # find specific slugs
```

Output: JSON in `out/`, Markdown in `texts/<author>/Articles/<slug>.md`
(frontmatter: `title`, `slug`, `url`, `date`, `likes`, `comments`, `tags`,
`language`) and `texts/<author>/Notes/notes-YYYY-MM.md`. Downloads are slow by
design (rate limits, ~800 ms between pages) — run one export, then read the
files with normal file tools; do not poll or re-run it.

### 2. Read the Markdown

Read the `.md` files directly (Read tool / cat). Frontmatter gives you title,
URL, date and stats without hitting the API again.

### 3. Decide: whose content is it?

Find the handle in the credentials (`SUBSTACK_HANDLE_MAIN`/`_TEST`, or ask the
user whose publication this is):

- **Not the user's content** → read-only: review, summarize, critique,
  translate for understanding, or report. **Never** run write commands against
  someone else's publication.
- **The user's content** → you may review/edit/update per the flows below,
  still respecting the account and confirmation rules.

### 4a. Review / report (any content)

Produce the report in the chat (or a file if asked) in the user's language.
A good report covers: what the piece argues, structure and flow, factual
claims worth verifying (flag them, don't invent sources), style/tone notes, and
concrete suggested edits — quote the passage, then the rewrite. For "is this
any good / critique" requests, be direct; the user wants a real opinion.

### 4b. Edit / update (user's content)

Pull → edit the Markdown → preview → push. Prefer `sync`; use `edit` for
surgical changes to a published post.

```bash
# Folder sync (Drafts/Published + translations under the sync dir)
substack sync --dir <path> --dry-run      # 1. see what would change
# ...edit the .md files...
substack sync --dir <path> --dry-run      # 2. verify the delta
substack sync --dir <path> --yes          # 3. apply (after user approval)

# Single draft: edit by id
substack drafts list --json               # find the id
substack drafts update <id> ./post.md      # push new body (never publishes)

# Published post: surgical edit
substack edit <handle> <slug> --body-file new.md --dry-run   # preview first
substack edit <handle> <slug> --body-file new.md --no-publish # update, stay offline
```

Sync dir precedence: `--dir` → `SUBSTACK_SYNC_DIR` → `./Articles`.

### 4c. Publish (only when the user explicitly asks)

```bash
substack drafts create ./post.md --dry-run --json   # preview payload
substack drafts create ./post.md --json             # create draft (NEVER publishes)
substack drafts publish <id> --no-send --yes        # go public silently
# ...user reviews the URL...
substack drafts publish <id> --send --yes           # email subscribers (irreversible)
```

Schedule instead: `substack drafts schedule <id> --at <ISO8601>`.

## Hard rules

1. **`create` never publishes**; `publish` requires `--yes`; **`--send` (email
   to all subscribers) requires the user to ask for it explicitly** — default
   is silent `--no-send`. `edit --send` also requires `--force`.
2. **`--dry-run` before every write** the first time you run it against a new
   target; show the user what will change before `--yes`.
3. **MAIN account = read-only** unless the user explicitly says otherwise in
   the current request. Publishing/editing MAIN is irreversible.
4. Never delete (`drafts delete`) without explicit confirmation of the id.
5. One export at a time; ~1 s between write API calls (images: 200 ms gaps).
6. Local images in Markdown auto-upload on create/update; local PDF links only
   warn — tell the user to host PDFs externally.
7. Reports/summaries are the deliverable for read requests; don't run write
   commands "to check" things — `drafts list`/`drafts get`/`published list`
   are the read-only inspection tools.

## Command map

| Task | Command |
| ---- | ------- |
| Download everything | `substack export <handle> --author Name` |
| Download new posts | `substack fetch-new <handle> --author Name` |
| Find slugs | `substack lookup <handle> <slug...>` |
| Convert saved export | `substack convert out/<file>.json` |
| Edit published post | `substack edit <handle> <slug> [--dry-run]` |
| Create draft | `substack drafts create <file.md> [--dry-run]` |
| List/get/update draft | `substack drafts list\|get\|update` |
| Translate edition | `substack drafts translate <id> <lang> <file.md>` |
| Publish (silent/email) | `substack drafts publish <id> [--send] --yes` |
| Schedule/unschedule | `substack drafts schedule\|unschedule <id>` |
| Export draft → md | `substack drafts export <id> [--md-dir dir]` |
| Folder sync | `substack sync [--dir path] [--dry-run] [--yes] [--no-push]` |
| Inspect publication | `substack published list` / `scheduled list` / `drafts counts` |

Full flag reference: `README.md` (flag tables) and `substack <command> --help`.
API internals: `docs/` (`AUTH`, `ENDPOINTS`, `LIMITS`, `EXPORT_SCHEMA`).
