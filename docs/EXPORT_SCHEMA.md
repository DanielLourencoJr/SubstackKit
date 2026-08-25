# Export Schema (standard)

All exports produced by SubstackKit share one JSON format: `substack-export@1`.
Files are written to `out/` as `substack-export-<handle>-<YYYYMMDD-HHMMSS>.json`.

Downstream projects (Essayer, analysis pipelines, LLM tooling) should consume only
the normalized fields below. `rawData` is kept for fidelity and debugging.

## Top-level

```json
{
  "schema": "substack-export@1",
  "meta": { ... },
  "posts": [ ... ],
  "notes": [ ... ]
}
```

### `meta`

| Field | Type | Description |
|---|---|---|
| `exportedAt` | string | ISO timestamp of export |
| `generator.name` | string | `"substack-kit"` |
| `generator.version` | string | tool version |
| `profile.id` | number|null | Substack user ID |
| `profile.name` | string | Display name |
| `profile.handle` | string | Handle/slug (`@handle`) |
| `profile.url` | string | Profile URL |
| `source.type` | `"publication"`\|`"profile"` | How the data was fetched |
| `source.slug` | string | The handle used |
| `source.subdomain` | string\|null | Publication subdomain (when `type=publication`) |
| `source.publication` | object\|null | `{name, url}` of the publication |
| `source.method` | `"archive"`\|`"profile/posts"`\|`"rss+preloads"` | Fetch strategy |
| `options` | object | Flags used in the run |
| `counts.posts` / `counts.notes` / `counts.replies` | number | Totals |

## Post object (`posts[]`)

| Field | Type | Description |
|---|---|---|
| `id` | number|null | Post ID |
| `slug` | string | Slug |
| `title` | string | Title |
| `subtitle` | string | Subtitle / description |
| `publishedAt` | string | ISO publish date (`post_date`) |
| `url` | string | Canonical URL |
| `likesCount` | number | Reaction count |
| `commentsCount` | number | Comment count |
| `restacks` | number|null | Restack count |
| `reactions` | object|null | Per-emoji breakdown |
| `tags` | array | Post tags |
| `coverImage` | string | Cover image URL |
| `wordcount` | number|null | Word count |
| `language` | string|null | Content language |
| `body` | string | Truncated plain-text body |
| `body_html` | string | Full HTML body (present when enriched via `/posts/by-id`) |
| `source` | string\|null | `"publication"`\|`"profile"`\|`"rss+preloads"` |
| `rawData` | object | Full raw API object |

## Note object (`notes[]`)

| Field | Type | Description |
|---|---|---|
| `id` | number|null | Note (comment) ID |
| `entityKey` | string | e.g. `c-255274940` |
| `publishedAt` | string | ISO publish date (`comment.date`) |
| `url` | string | `https://substack.com/notes/<entityKey>` |
| `likes` | number | Reaction count |
| `reactions` | object|null | Per-emoji breakdown |
| `restacks` | number|null | Restack count |
| `repliesCount` | number|null | `comment.children_count` (direct replies only) |
| `editedAt` | string\|null | Last edit timestamp |
| `language` | string\|null | Content language |
| `ancestorPath` | string\|null | Thread ancestry (empty = top-level) |
| `author.id` | number\|null | Author user ID |
| `author.name` | string | Author display name |
| `author.handle` | string | Author handle |
| `author.bio` | string\|null | Author bio |
| `author.primaryPublication` | object\|null | `{id, name, subdomain}` |
| `body` | string | Plain-text body |
| `body_json` | object\|null | ProseMirror structured body |
| `attachments` | array | Restacks/images/posts/links/videos/publications |
| `replies` | array | Threaded replies (fetched separately, stored in `rawData.replies`) |
| `rawData` | object | Full feed item |

### Reply object (`notes[].replies[]`)

| Field | Type | Description |
|---|---|---|
| `id` | number | Reply comment ID |
| `name` | string | Author name (no `handle` available from this endpoint) |
| `body` | string | Plain-text body |
| `body_json` | object|null | ProseMirror body |
| `date` | string | ISO timestamp |
| `edited_at` | string\|null | Last edit |
| `reaction_count` | number | Likes |
| `reactions` | object\|null | Per-emoji breakdown |
| `children_count` | number | Direct replies to this reply |
| `depth` | number | 0 = direct reply, 1+ = nested |
| `ancestor_path` | string | Thread ancestry |
| `attachments` | array | Embedded content |

## Notes vs Posts

- `notes[]` — short-form content (tweets-like), ProseMirror rich text, attachments,
  threaded replies. `replies[]` are only present when the export fetched them
  (`--no-replies` suppresses).
- `posts[]` — long-form articles. `body_html` is the full article when enriched
  (default on; `--no-full-bodies` leaves only the truncated `body`).

## Key paths for consumption

| What you want | JSON path |
|---|---|
| Note body (plain) | `notes[i].body` |
| Note body (rich) | `notes[i].body_json` (ProseMirror) |
| Post full body | `posts[i].body_html` |
| Post truncated | `posts[i].body` |
| Publication date | `notes[i].publishedAt` / `posts[i].publishedAt` |
| Author name | `notes[i].author.name` |
| Note URL | `notes[i].url` |
| Reply count | `notes[i].repliesCount` |
| Threaded replies | `notes[i].replies` |
| Restacked content | `notes[i].attachments[].comment` where `type === "comment"` |
