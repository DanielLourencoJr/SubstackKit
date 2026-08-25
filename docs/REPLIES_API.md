# Replies API Reference

Notes replies (threaded comments on a note) are fetched separately from the notes
feed and stored in the export at `notes[].replies` (and `rawData.replies`).

## Endpoint

```
GET https://substack.com/api/v1/reader/comment/{comment_id}/replies
```

Called via `client.substackClient.get()` in `lib/notes.js`.

## Authentication

Requires `substack.sid` cookie. The library's `HttpClient` attaches it
automatically (same as other calls).

## Parameters

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `cursor` | string | No | Pass `nextCursor` from previous response for subsequent pages |

## Response

```json
{
  "rootComment": { ... },
  "commentBranches": [ ... ],
  "moreBranches": 0,
  "nextCursor": null
}
```

| Field | Type | Description |
|-------|------|-------------|
| `rootComment` | object | The note being replied to (echoed back) |
| `commentBranches` | array | One branch = one top-level reply + nested descendants |
| `moreBranches` | number/boolean | `1`/`true` if more pages available |
| `nextCursor` | string/null | Cursor for the next page |

### Branch object

```json
{
  "comment": { ... },
  "descendantComments": [ ... ]
}
```

- `comment` — direct reply (depth 0).
- `descendantComments[]` — nested replies (depth 1+). Each item is wrapped:
  `{ "type": "comment", "comment": { ... } }`. Nesting depth comes from
  `comment.tracking_parameters.item_thread_depth`.

### Comment object (used in `branch.comment` and `descendantComments[].comment`)

Same core fields as a note comment: `id`, `name`, `photo_url`, `user_id`, `body`,
`body_json`, `date`, `edited_at`, `ancestor_path`, `reaction_count`, `reactions`,
`children_count`, `attachments`, `language`, `restacks`, `restacked`.

**Important:** replies have **no `handle` field** — only `name` is available from
this endpoint. There is no `context.users[]` either.

## Recursive fetching (`lib/notes.js`)

1. Fetch the first page of replies for a note.
2. Enqueue every reply with `children_count > 0`.
3. Fetch each queued reply's own replies (depth + 1), dedupe by ID, enqueue any
   with children, 1.2s between calls.
4. Sort all replies by top-level parent ID, then depth, then ID — producing
   correct depth-first thread ordering in the Markdown output.

## Edge cases

| Case | Behavior |
|------|----------|
| Deleted replies | `children_count > 0` but 0 branches returned |
| No replies | `commentBranches: []`, `moreBranches: 0`, `nextCursor: null` |
| Multiple pages | `moreBranches: 1`, `nextCursor: "..."` |
