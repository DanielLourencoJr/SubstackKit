# API Reference

> Detailed documentation for each endpoint. All endpoints succeed with `200` unless noted otherwise.

## Conventions

- **Platform**: `https://substack.com/api/v1`
- **Publication**: `https://{pub}.substack.com/api/v1`
- **Auth**: `Cookie: connect.sid=<session>` (current) **or** `Cookie: substack.sid=<session>` (older). Send both to be safe. See [AUTH.md](AUTH.md).
- **Content-Type**: `application/json` unless noted otherwise
- Test account handle: `danielloureno`

---

## Auth & Discovery

### GET `{platform}/user/{handle}/public_profile`

Public profile by handle. No auth required. This is the only endpoint that provides subscriber count data.

```json
{
  "id": 1234567,
  "name": "Daniel Lourenco",
  "handle": "danielloureno",
  "bio": "...",
  "avatar_url": "https://substackcdn.com/...",
  "twitter_screen_name": null,
  "is_pub_author": true,
  "hasActivity": true,
  "hasLikes": true,
  "publications": [
    {
      "id": 12345,
      "name": "The API Times",
      "subdomain": "theapitimes"
    }
  ],
  "rough_num_free_subscribers_int": 1,
  "rough_num_free_subscribers": "Tens",
  "subscriberCountString": "1 subscriber",
  "subscriberCount": "1",
  "subscriberCountNumber": 1,
  "followerCount": 0,
  "visibleSubscriptionsCount": 0,
  "subscriptions": []
}
```

Subscriber count fields:

| Field | Type | Description |
|-------|------|-------------|
| `rough_num_free_subscribers_int` | int | Rough free subscriber count (bucketed: 1, ~10, ~100, ~1000, etc.) |
| `rough_num_free_subscribers` | string | Human-readable bucket label: `"Tens"`, `"Hundreds"`, `"Thousands"`, etc. |
| `subscriberCountNumber` | int | Exact free subscriber count |
| `subscriberCountString` | string | Formatted string like `"1 subscriber"` |
| `subscriberCount` | string | Same as `subscriberCountNumber` as string |
| `followerCount` | int | Follower count (distinct from subscribers) |
| `visibleSubscriptionsCount` | int | Number of publications this user subscribes to that are publicly visible |
| `subscriptions` | array | List of publications the user subscribes to |
| `primaryPublicationSubscriptionState` | string | `"author"`, `"subscriber"`, or `"none"` |
| `hasActivity` | bool | Whether the user has any public activity (replies, likes) on their profile |
| `hasLikes` | bool | Whether the user has any public likes visible on their profile |

No paid subscriber count is available through this or any other discovered endpoint.

### GET `{platform}/user/profile/self`

Own profile with full publication list. Auth required.

```json
{
  "id": 1234567,
  "name": "Daniel Lourenco",
  "handle": "danielloureno",
  "email": "daniel@example.com",
  "bio": "...",
  "avatar_url": "https://substackcdn.com/...",
  "publications": [
    { "id": 12345, "name": "The API Times", "subdomain": "theapitimes", "role": "admin" }
  ]
}
```

### GET `{platform}/handle/options`

Available handles/slugs for the authenticated user.

```json
["theapitimes", "danielloureno"]
```

### GET `{platform}/user-settings`

User settings as a flat key-value store.

```json
{
  "seenHomePageOnboarding": true,
  "hasSentFirstNote": true,
  "firstNoteDraftKey": "abc123",
  "seenNotesSelfServeOnboarding": true,
  "hasSeenNotesTabOnboarding": true,
  "notifications": "...",
  "settingsVersion": 3
}
```

---

## Feed & Content

### GET `{platform}/reader/feed/profile/{profileId}`

Feed items for a specific user **across all publications**. This is the main way to get everything a user has done — posts, notes, and comments on posts.

**Auth**: No auth required for reading. Returns all public content by that user.

**Query params**:
| Param | Description |
|-------|-------------|
| `cursor` | Cursor-based pagination (base64) |
| `types` | Filter by content type: `note`, `post`, `replies`, `likes`, or comma-separated |

Examples:
- `?types=note` — user's own top-level notes
- `?types=post` — user's published posts
- `?types=replies` — **note replies** (context: `note_reply`) or **post comments** (context: `comment`), depending on what the user has created
- `?types=likes` — content the user has liked (returns 0 for some accounts; may depend on privacy settings)
- `?types=comment` — **currently returns 0 items** (may be deprecated)
- `?types=all` — **currently returns 0 items** (may be deprecated)

```json
{
  "items": [
    {
      "type": "post",
      "id": null,
      "publication_id": null,
      "publication": { "id": 7073311, "name": "..." },
      "entity_key": "...",
      "post": {
        "id": 201869128,
        "title": "API Test — Updated Title",
        "publication_id": 7073311,
        "type": "newsletter",
        "audience": "everyone",
        "slug": "api-test",
        "post_date": "2025-12-17T22:29:10.614Z",
        ...
      },
      "comment": null,
      "context": { "type": "post", "timestamp": "...", "users": [...] }
    },
    {
      "type": "comment",
      "id": null,
      "publication_id": null,
      "publication": { "id": 7073311, "name": "..." },
      "entity_key": "...",
      "post": { ... parent post if reply ... },
      "comment": {
        "id": 279209572,
        "body": "Test note for comment exploration",
        "post_id": null,
        "publication_id": null,
        "user_id": 250852026,
        "type": "comment",
        "date": "2026-01-15T12:00:00.000Z",
        "ancestor_path": "",
        "reply_minimum_role": "everyone",
        "reaction_count": 0,
        "restacks": 0,
        "children_count": 0,
        "attachments": []
      },
      "context": { "type": "comment", "timestamp": "...", "users": [...] }
    }
  ],
  "originalCursorTimestamp": "2026-06-19T17:46:56.163Z",
  "nextCursor": "base64-encoded-cursor"
}
```

**Identifying content types**:

| Type | How to identify | Description |
|------|----------------|------------|
| Post | `item.type === "post"` + `item.post` is non-null | Newsletter post |
| Note (standalone) | `item.type === "comment"` + `item.comment.post_id === null`, `item.context.type === "note"` | Platform note, not tied to a specific post |
| Note reply | `item.type === "comment"` + `item.comment.ancestor_path` non-empty, `item.context.type === "note_reply"` | Threaded reply to another user's note |
| Post comment | `item.type === "comment"` + `item.comment.post_id` is a number, `item.context.type === "comment"` | Comment on a specific post |

**Getting the parent post**: If `item.comment.post_id` is non-null, fetch `GET /posts/by-id/{comment.post_id}` for the parent post's title and details. The `item.post` object at the item level may also contain the parent post's summary data.

**Cross-publication**: Since this endpoint is platform-scoped, items come from **all publications** the user participates in. Each item has a `publication` object with the owning publication's `id` and `name`.

**Note replies excluded from default**: By default (no `types` filter), the profile feed only shows top-level notes and posts — replies are excluded. Use **`?types=replies`** to fetch the user's note replies and post comments.

**`types` filter behavior**:
- `?types=note` — returns only top-level notes (context: `note`). Replies excluded.
- `?types=post` — returns only posts.
- `?types=replies` — returns note replies (context: `note_reply`) AND/OR post comments (context: `comment`), depending on the user's activity.
- `?types=likes` — filter exists (returns 200) but returns 0 items for some accounts. May depend on privacy settings or may be deprecated.
- `?types=comment` — returns 0 items. Likely deprecated.
- `?types=all` — returns 0 items. Likely deprecated.

**Note reply ancestor format**: In the profile feed, note replies have `ancestor_path` set to the parent note's ID as a string (e.g., `"282891129"`). Nested replies use dot-separated format: `"parentId.childId"` (e.g., `"282129129.282150073"`).

### GET `{platform}/reader/feed?user_id={profileId}`

Same endpoint as above — the `user_id` param is accepted but **ignored**. Returns the same "For You" feed regardless of the value. Documented because the endpoint exists and responds 200, but the param has no observable effect.

### GET `{pub}/reader/feed/profile/{profileId}?types=note`

Notes for a specific user profile **within a single publication**. Publication scope, auth required. Cursor-paginated.

```json
{
  "items": [ ... same item structure as platform profile feed ... ],
  "nextCursor": "..."
}
```

This is scoped to one publication. For cross-publication results, use the platform-scoped endpoint without specifying a publication.

### GET `{platform}/profile/posts?profile_user_id={id}&limit={n}`

Published posts for a user across all their publications. Cursor-based pagination (`?cursor=`). **`offset` is rejected (400)** — use `cursor` instead. Accepts `limit` to control page size.

```json
{
  "posts": [
    {
      "id": 9876543,
      "title": "Hello World",
      "subtitle": "A test post",
      "slug": "hello-world",
      "publication_id": 12345,
      "publication": { "id": 12345, "name": "The API Times", "subdomain": "theapitimes" },
      "published_at": "2025-12-17T22:29:10.614Z",
      "updated_at": "2025-12-17T22:29:24.697Z",
      "type": "newsletter",
      "audience": "everyone",
      "draft_id": 5555555,
      "restacked": false,
      "restacks": 1,
      "reactions": { "❤": 0 },
      "comment_count": 0,
      "word_count": 15
    }
  ],
  "nextCursor": "base64-encoded-cursor-string"
}
```

### GET `{platform}/posts/by-id/{id}`

Single published post by ID. Returns full content with `body_html`.

Key fields:

| Field | Type | Description |
|-------|------|-------------|
| `id` | int | Post ID |
| `title` | string | Post title |
| `subtitle` | string | Post subtitle |
| `slug` | string | URL slug |
| `body_html` | string | Full rendered HTML |
| `body_json` | object | Tiptap JSON document (same format as drafts) |
| `draft_id` | int | Related draft |
| `publication_id` | int | Owning publication |
| `type` | string | Usually `"newsletter"` |
| `audience` | string | `"everyone"` or `"only_paid"` |
| `published_at` | ISO string | Publication timestamp |
| `reactions` | object | Like `{"❤": 0}` |
| `comment_count` | int | Number of comments |
| `restacked` | bool | Whether current user has restacked |
| `restacks` | int | Total restack count |

### GET `{platform}/reader/feed`

The **"For You" home feed** — the main algorithmic feed shown on `substack.com`. Returns a mix of posts, notes, and user suggestions ranked by ML model. Items are in `items` (not `comments`).

**Auth**: Optional but dramatically different results.
- **Without cookie**: Returns ~6 generic items (no personalization).
- **With cookie**: Returns ~7 items personalized to your session — follows, subscriptions, and algorithmic recommendations. The two feeds share **zero items** — the entire set changes.

**Pagination**: Cursor-based (`?cursor=`, response has `nextCursor`). Legacy `page`/`page_size` accepted but ignored.

**Query params**:
| Param | Effect |
|-------|--------|
| `cursor` | Cursor-based pagination |
| `user_id` | Accepted but **ignored** — has no effect on the response |

```json
{
  "items": [
    {
      "type": "comment",
      "entity_key": "c-280783015",
      "comment": {
        "id": 280783015,
        "body": "Não ",
        "body_json": { "type": "doc", ... },
        "user_id": 369865656,
        "handle": "sohtabb748748",
        "name": "SOHTAB",
        "post_id": null,
        "publication_id": null,
        "date": "2026-06-22T16:17:24.873Z",
        "reaction_count": 3,
        "reactions": { "❤": 3 },
        "ancestor_path": "",
        "children_count": 0,
        "attachments": []
      },
      "publication": null,
      "post": null,
      "context": {
        "type": "comment_like",
        "typeBucket": "notes",
        "source": "model",
        "model_score": 11.68,
        "page": 0,
        "page_rank": 0,
        "users": [ { "id": 496005976, "handle": "empirista", "name": "Estrela" } ]
      }
    },
    {
      "type": "post",
      "entity_key": "p-202738130",
      "post": {
        "id": 202738130,
        "title": "Por uma eugenia brasileira",
        "publication_id": 8836096,
        "type": "newsletter",
        "audience": "everyone"
      },
      "publication": { "id": 8836096, "name": "Arché Brasilis" },
      "comment": null,
      "context": {
        "type": "post",
        "typeBucket": "posts",
        "source": "model",
        "model_score": 3.24,
        "page": 0,
        "page_rank": 3
      }
    },
    {
      "type": "userSuggestions"
    }
  ],
  "nextCursor": "base64-encoded-cursor-string",
  "originalCursorTimestamp": "2026-06-19T19:04:04.459Z",
  "trackingParameters": {
    "feed_session_id": "uuid",
    "tab_id": "for-you",
    "top_note_impression_id": "uuid",
    "top_note_entity_key": "c-280635959",
    "top_note_model_score": 1.64,
    "top_note_source": "model",
    "is_following": false,
    "followed_user_count": 4,
    "subscribed_publication_count": 0
  }
}
```

**Item types**:

| `type` | Count | Description |
|--------|-------|-------------|
| `comment` | ~5 | Notes by various users. Standalone (`post_id` is always `null`). Can be text, link shares, or "liked by someone you may know" entries. |
| `post` | ~1 | Newsletter post from a publication |
| `userSuggestions` | ~1 | Recommendation block suggesting accounts/pubs to follow |

**Context metadata** (`item.context`):

| Field | Description |
|-------|-------------|
| `type` | Reason shown: `"note"`, `"post"`, `"comment_like"` (liked by someone you might follow) |
| `typeBucket` | `"notes"` or `"posts"` |
| `source` | `"model"` (ML algorithm), `"db-note"`, etc. |
| `model_score` | Ranking score (higher = more prominent) |
| `page`, `page_rank` | Position tracking for A/B testing |
| `users` | Relevant users (e.g., the liker on `comment_like` items) |

**Tracking parameters** (`trackingParameters`):

| Field | Description |
|-------|-------------|
| `feed_session_id` | Unique session identifier |
| `tab_id` | Always `"for-you"` — confirms this is the For You tab |
| `top_note_*` | Metadata about the highest-ranked item |
| `is_following` | Whether the authenticated user follows the top item's author |
| `followed_user_count` | How many users the authenticated user follows |
| `subscribed_publication_count` | How many pubs the user subscribes to |

### GET `{platform}/reader/comment/{id}`

Read a single note/comment by ID. No auth required.

**⚠ Live shape (verified 2026-08)**: response is wrapped in `{ "item": { "comment": {...} } }`. The comment object uses **`body`** (plain text — no `body_html`), **`date`** (no `created_at`), **`reaction_count`** (no `likes`), and author fields **`user_id`/`name`/`handle`** at the top level (no `author` object). The example below is the previously-documented shape; treat it as stale.

```json
{
  "item": {
    "entity_key": "c-4444444",
    "type": "comment",
    "context": { "type": "note", "timestamp": "...", "source": "db-note" },
    "publication": null,
    "post": null,
    "comment": {
      "id": 4444444,
      "body": "Plain text body of the note",
      "body_json": { "type": "doc", "attrs": { "schemaVersion": "v1" }, "content": [...] },
      "publication_id": null,
      "post_id": null,
      "user_id": 1234567,
      "name": "Daniel Lourenco",
      "handle": "danielloureno",
      "type": "comment",
      "date": "2025-12-18T12:00:00.000Z",
      "edited_at": null,
      "ancestor_path": "",
      "reply_minimum_role": "everyone",
      "reaction_count": 0,
      "reactions": {},
      "restacks": 0,
      "restacked": false,
      "children_count": 0,
      "attachments": [{ "id": "...", "type": "image", "imageUrl": "...", "explicit": false }]
    }
  }
}
```

Old (stale) documented shape for reference:

```json
{
  "id": 4444444,
  "body_json": { "type": "doc", "attrs": { "schemaVersion": "v1" }, "content": [...] },
  "body_html": "<p>...</p>",
  "author": { "id": 1234567, "name": "Daniel Lourenco", "handle": "danielloureno" },
  "publication_id": 12345,
  "created_at": "2025-12-18T12:00:00.000Z",
  "likes": 0,
  "restacked": false,
  "restacks": 0,
  "attachments": [...],
  "post_id": null,
  "parent_id": null
}
```

### GET `{platform}/reader/comment/{id}/replies`

List threaded replies to a specific note. No auth required.

```json
{
  "commentBranches": [
    {
      "comment": {
        "id": 279094489,
        "body": "Auraticosíssimo.",
        "body_json": { "type": "doc", "attrs": { "schemaVersion": "v1" }, "content": [...] },
        "publication_id": null,
        "post_id": null,
        "user_id": 464232438,
        "ancestor_path": "279089880",
        "type": "feed",
        "date": "2026-06-19T13:59:58.257Z",
        "reaction_count": 3,
        "reactions": { "❤": 3 },
        "children_count": 0,
        "attachments": [],
        "userStatus": { ... },
        "user_primary_publication": { ... }
      }
    }
  ],
  "moreBranches": 0,
  "nextCursor": null,
  "rootComment": { ... }
}
```

**Identifying replies**: Each branch has a `comment` object. The `ancestor_path` field contains the parent note's ID (as a string). The `user_id` field identifies the reply author.

**Limitation**: There is no endpoint to enumerate ALL replies by a user. You must know the parent note ID to query its replies.

### GET `{platform}/feed/following`

Returns a flat array of user IDs the authenticated user follows. Auth required. No pagination fields.

```json
[250852026, 92320804, 369471867, 310483991]
```

### GET `{pub}/notes`

Notes feed for a specific publication. Cursor-based pagination (`?cursor=`). Auth required.

```json
{
  "comments": [ ...same format as reader/feed... ],
  "nextCursor": null,
  "originalCursorTimestamp": "2026-06-19T19:04:07.038Z"
}
```

---

## Drafts

All draft endpoints are **publication-scoped**.

### GET `{pub}/drafts`

List all drafts and published posts. Supports both `offset`/`limit` and `cursor`/`limit` pagination. Returns `hasMore` (boolean) and `nextCursor` (numeric string — the next offset).

```json
{
  "posts": [
    {
      "id": 5555555,
      "title": "Hello World",
      "type": "newsletter",
      "status": "published",
      "published_at": "2025-12-17T22:29:10.614Z",
      "updated_at": "2025-12-17T22:29:24.697Z",
      "display_content": {
        "title": "Hello World",
        "subtitle": "A test post",
        "body_text": "This is the beginning of the post..."
      }
    }
  ],
  "nextCursor": "1",
  "hasMore": true
}
```

### GET `{pub}/drafts/{id}`

Single draft with full data.

```json
{
  "id": 5555555,
  "title": "Hello World",
  "subtitle": "A test post",
  "draft_body": {
    "type": "doc",
    "attrs": { "schemaVersion": "v1" },
    "content": [
      { "type": "heading", "attrs": { "level": 1 }, "content": [...] },
      { "type": "paragraph", "content": [...] },
      { "type": "image2", "attrs": { "src": "...", "alt": "...", "caption": "..." } }
    ]
  },
  "type": "newsletter",
  "status": "published",
  "audience": "everyone",
  "published_at": "2025-12-17T22:29:10.614Z",
  "updated_at": "2025-12-17T22:29:24.697Z"
}
```

### POST `{pub}/drafts`

Create a draft. Uses **Tiptap JSON** for `draft_body`.

**Important**: `draft_body` is a **stringified ProseMirror document** (JSON.stringify'd), not a raw JSON object. If you submit a JSON object, Substack stores it as a single text node and the post renders as visible `{type:"doc",...}` markup.

**Important**: `draft_bylines` is **required** (not optional). Get the IDs from `/user/profile/self`: `id` is your user id, `publicationUserId` is `publicationUsers[N].id` for the publication.

```json
{
  "draft_title": "Hello World",
  "draft_subtitle": "A test post",
  "draft_body": "{\"type\":\"doc\",\"attrs\":{\"schemaVersion\":\"v1\"},\"content\":[...]}",
  "type": "newsletter",
  "audience": "everyone",
  "draft_bylines": [
    { "id": 1234567, "publicationUserId": 9902568 }
  ]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `draft_title` | string | Yes | Post title |
| `draft_subtitle` | string | No | Post subtitle |
| `draft_body` | string (JSON) | Yes | **Stringified** Tiptap JSON document |
| `type` | string | Yes | Always `"newsletter"` |
| `audience` | string | Yes | `"everyone"` or `"only_paid"` |
| `draft_bylines` | array | **Yes** | `[{id: <userId>, publicationUserId: <pubUserId>}]` from `/user/profile/self` |

Response includes the `id` of the new draft.

### PUT `{pub}/drafts/{id}`

Update an existing draft. Same body shape as POST. Returns full draft object.

### DELETE `{pub}/drafts/{id}`

Delete a draft. Returns `{success: true}`.

### POST `{pub}/drafts/{id}/publish`

Publish a draft. Body:

```json
{
  "send": true,
  "share_automatically": false
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `send` | bool | Yes | `true` emails subscribers immediately — **IRREVERSIBLE**. `false` publishes silently. |
| `share_automatically` | bool | No | Whether to auto-share to social |

Returns the published post with `slug` and `status: "published"`.

### GET `{pub}/drafts/{id}/prepublish`

Pre-flight check before publishing. Optional query: `publish_date=<ISO datetime>` for validating scheduled dates.

```json
{
  "errors": [],
  "suggestions": []
}
```

Empty arrays = ready to publish.

### Scheduling: `POST {pub}/drafts/{id}/scheduled_release`

Schedule a draft for future publication.

```json
{
  "trigger_at": "2027-01-01T12:00:00.000Z",
  "post_audience": "everyone"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `trigger_at` | string (ISO) | Yes | ⚠ Field name is **`trigger_at`**, NOT `post_date`/`publish_date`/`scheduled_at` |
| `post_audience` | string | Yes | `"everyone"` (verified), likely `"subscribers_only"`, `"paid_subscribers_only"` |

### GET `{pub}/drafts/{id}/scheduled_release`

Returns `[]` if not scheduled, or `[{trigger_at, post_audience, email_audience}]` when active.

### DELETE `{pub}/drafts/{id}/scheduled_release`

Unschedules the draft. Returns array of cancelled schedule IDs.

---

## Notes

### POST `{platform}/comment/feed/`

Create a note. Uses **ProseMirror JSON** for `bodyJson`.

```json
{
  "bodyJson": {
    "type": "doc",
    "attrs": { "schemaVersion": "v1" },
    "content": [
      {
        "type": "paragraph",
        "content": [{ "type": "text", "marks": [{ "type": "bold" }], "text": "Hello" }]
      }
    ]
  },
  "tabId": "for-you",
  "surface": "feed",
  "replyMinimumRole": "everyone",
  "attachmentIds": ["uuid-of-attachment"]
}
```

**Note with image attachment only (no text body):**

```json
{
  "tabId": "for-you",
  "surface": "feed",
  "replyMinimumRole": "everyone",
  "attachmentIds": ["uuid-of-image-attachment"]
}
```

Fields:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `bodyJson` | object | No* | ProseMirror JSON document. Optional when using `attachmentIds`. |
| `surface` | string | Yes | `"feed"` |
| `tabId` | string | Yes | `"for-you"` |
| `replyMinimumRole` | string | Yes | `"everyone"` |
| `parent_id` | int | No | Parent note's ID (as a number) to create a **threaded reply**. Omit for top-level notes. |
| `attachmentIds` | string[] | No | Array of attachment UUIDs (from `/comment/attachment/`). **Single-use** — each UUID can only be used in one note. |
| `audience` | string | No | `"everyone"` (default) or `"only_paid"` |
| `publicationId` | int | No | Post to a specific publication's notes feed |

*\* `bodyJson` is technically optional — you can create a note with only image attachments and no body text. However, you must include at least `bodyJson`, `attachmentIds`, or both.*

**Important**: Attachment UUIDs are **single-use**. Once an attachment is used in a note, it cannot be reused in another note.

**Threaded replies**: To reply to an existing note, include `parent_id: <parentNoteId>` (as a number). The response's `ancestor_path` will be set to the parent's ID. The reply will appear in `GET /reader/comment/{parentId}/replies`. Note that `ancestorPath` (camelCase) alone is ignored — `parent_id` is the active field.

See [CONTENT_FORMATS.md](CONTENT_FORMATS.md) for the ProseMirror body schema.

### DELETE `{platform}/comment/{id}`

Delete a note. Returns `{success: true}`.

> ⚠ Platform scope only works for notes. To delete a **comment on a post**, use the publication scope endpoint.

---

## Comments on Posts

### POST `{pub}/post/{postId}/comment`

Create a comment on a post. Optional `ancestorPath` for replies.

```json
{
  "body": "Great post!",
  "ancestorPath": "/post/{postId}/comment/{parentCommentId}"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `body` | string | Plain text comment body |
| `ancestorPath` | string | Path to parent comment for replies (optional) |

### GET `{pub}/post/{postId}/comments`

Get all comments on a post. Returns flat array (no nesting).

```json
[
  {
    "id": 6666666,
    "body": "Great post!",
    "author": { "id": 1234567, "name": "Daniel Lourenco", "handle": "danielloureno" },
    "created_at": "2025-12-18T14:00:00.000Z",
    "ancestor_path": "",
    "replies_count": 0,
    "likes": 0,
    "is_published": true,
    "is_author": true
  }
]
```

### DELETE `{pub}/comment/{id}`

Delete a comment on a post. Returns `{success: true}`.

> ⚠ Must use publication scope. Using platform scope (`DELETE /api/v1/comment/{id}`) returns `500` for post comments.

---

## Reactions / Likes

### GET `{platform}/threads/reactions`

Catalog of reaction emojis available on Notes/comments. No auth required.

```json
{
  "suggestedReactionTypes": ["thumbs_up", "upvote", "face_with_tears_of_joy", "double_exclamation_mark"],
  "categories": [
    { "title": "Frequently used", "reactionTypes": ["broken_heart", "thinking_face", ...] }
  ]
}
```

The reaction **name strings** (e.g. `thumbs_up`) match what the web UI shows, but the actual POST payload uses the **literal emoji character**.

### POST `{platform}/post/{postId}/reaction`

Like or unlike a post. Also works on publication scope: `{pub}/post/{postId}/reaction`.

```json
{ "reaction": "❤", "surface": "reader" }
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `reaction` | string | Yes | **Literal emoji character** (e.g. `"❤"`), NOT named string (`"thumbs_up"`) |
| `surface` | string | No | Verified: `"reader"`. Other values: `"editor"`, `"feed"` |

| Behaviour | Result |
|-----------|--------|
| First request | Adds a like. Increases reaction count. |
| Second request (same user, same post) | Removes the like. Toggles. |

Only `❤` is accepted. Other emoji (`🔥`, `👍`, `👎`) return `400` with a validation error.

### DELETE `{platform}/post/{id}/reaction`

Explicitly remove a reaction from a post (unlike). Also works on publication scope.

Body: `{}`

### POST `{platform}/comment/{id}/reaction`

Like or unlike a note/comment. Same body and toggle behaviour as post reactions.

### DELETE `{platform}/comment/{id}/reaction`

Explicitly remove a reaction from a note/comment.

Body: `{ "tabId": "for-you" }`

---

## Image Upload

### POST `{pub}/image`

Upload an image. Takes a **base64 data URI as JSON**, NOT multipart/form-urlencoded (multipart returns 400).

```json
{
  "image": "data:image/png;base64,iVBORw0KGgo..."
}
```

| Field | Type | Description |
|-------|------|-------------|
| `image` | string | Data URI (Base64-encoded image) |

Response:

```json
{
  "id": 285574576,
  "url": "https://substack-post-media.s3.amazonaws.com/public/images/6d5c5adf-5fc3-4c6b-a455-fb5136830ca5_10x10.png",
  "contentType": "image/png",
  "bytes": 75,
  "imageWidth": 10,
  "imageHeight": 10
}
```

**Important — exact field names**:
- `bytes` — file size in bytes. NOT `bytes_required`.
- `imageWidth` / `imageHeight` — pixel dimensions. NOT `width` / `height`.

Using wrong names silently returns `undefined` → `0` → empty image placeholder.
The returned URL is on `substack-post-media.s3.amazonaws.com`. Foreign URLs (your own CDN) are silently dropped by the editor's render pipeline — you **must** upload via this endpoint first.

### Image embed in drafts: `captionedImage` block

To embed an uploaded image in a draft's `draft_body`, use Substack's nested `captionedImage` block:

```json
{
  "type": "captionedImage",
  "content": [
    {
      "type": "image2",
      "attrs": {
        "src": "<url from /api/v1/image response>",
        "srcNoWatermark": null,
        "fullscreen": null,
        "imageSize": null,
        "width": 10,
        "height": 10,
        "resizeWidth": null,
        "bytes": 75,
        "alt": null,
        "title": null,
        "type": "image/png",
        "href": null,
        "belowTheFold": false,
        "topImage": false,
        "internalRedirect": null
      }
    },
    {
      "type": "caption",
      "content": [{ "type": "text", "text": "Caption text here" }]
    }
  ]
}
```

**The `image2` 14 attrs**: Most can be `null`/`false`/`0`, but `width`, `height`, and `bytes` are critical — zeroes cause the editor to render as empty placeholder. Source from upload response.

The `image2` node alone (without `captionedImage` wrapper) is silently stripped on save. Plain `{type:"image", attrs:{src}}` is a different schema that Substack rejects.

### `subscribeWidget` block

The subscribe button as a ProseMirror block in `draft_body`:

```json
{
  "type": "subscribeWidget",
  "attrs": {
    "url": "https://yourpub.substack.com/subscribe",
    "text": "Subscribe",
    "language": "en"
  }
}
```

All three attrs optional. With `url` omitted, auto-binds to current pub. Leaf node (no `content` array).

---

## Publication Info

### GET `{pub}/publication`

Publication metadata.

```json
{
  "id": 12345,
  "name": "The API Times",
  "subdomain": "theapitimes",
  "custom_domain": null,
  "logo_url": "https://substackcdn.com/...",
  "author_id": 1234567,
  "theme": { "color_options": { "...": "..." } },
  "type": "newsletter"
}
```

### GET `{pub}/publication/sections`

Sections/categories for the publication.

```json
[
  {
    "id": 111,
    "name": "Tutorials",
    "slug": "tutorials",
    "publication_id": 12345
  }
]
```

### GET `{pub}/publication/settings`

Publication settings (may 403 for non-admin users).

### PUT `{pub}/publication`

Update publication metadata. Saves **one field per call** — the web UI sends only the changed field.

```json
{ "hero_text": "Notes on life, love & leadership." }
```

**Confirmed writable fields**: `name`, `hero_text`, `language` (ISO 639-1), `welcome_email_content` (stringified ProseMirror doc), `welcome_email_subject`.

### GET `{pub}/publication_settings`

Flat key/value map of boolean toggles (separate from the publication object).

### PUT `{pub}/publication_settings`

Update a single boolean toggle. Fired on every switch toggle in settings UI.

```json
{ "high_res_recording_beta": true }
```

### GET `{pub}/publication/verify_status`

Publication verification status (Substack's blue-check equivalent).

### GET `{pub}/publication/logo`

Logo metadata.

### GET `{pub}/publication/bestseller_tier`

`{ bestseller_tier: null | <tier> }` — Bestseller badge tier.

### GET `{pub}/publication/publication_tags`

Category tags for discovery (NOT per-post tags).

### GET `{pub}/publication/post-tag`

Per-post tags configured for the pub.

### GET `{pub}/publication/post-tag/settings`

Same as above but includes `navigationBarItem` — when non-null, tag appears in top nav.

### POST `{pub}/publication/post-tag`

Create a tag: `{ "name": "..." }`. Returns `{ id: "<uuid>", publication_id, slug, name, hidden }`. Note: tag IDs are UUIDs, not integers.

### DELETE `{pub}/publication/post-tag/{id}`

Delete a tag. Returns `200 {}`.

### POST `{pub}/post/{postId}/tag/{tagId}`

Attach a tag to a post. Body: empty. `postId` is integer, `tagId` is UUID.

### DELETE `{pub}/post/{postId}/tag/{tagId}`

Detach a tag. Returns `200 {}`.

---

## Post Management

### GET `{pub}/posts?limit=N&offset=N`

Published post listings for browsing. Public.

### GET `{pub}/post_management/published`

Admin view with engagement context. Required: `offset`, `limit`. Optional: `order_by` (`post_date`), `order_direction`.

### GET `{pub}/post_management/drafts`

Paginated drafts. Required: `offset`, `limit`, `order_by` (`draft_updated_at`), `order_direction`.

### GET `{pub}/post_management/scheduled`

Scheduled posts. `order_by` only accepts `draft_updated_at`.

### GET `{pub}/post_management/counts`

Dashboard counts: `{ published, publishedIsCapped, drafts, scheduled, ... }`.

### GET `{pub}/post_management/live_stream_drafts`

Live stream drafts.

### GET `{pub}/post_management/detail/{postId}?offset=0&limit=1`

Post with 31-field `stats` dict (open rate, CTR, views, shares, etc.).

### GET `{pub}/post/{postId}/theme`

Post-level theme override. `null` when post uses pub default.

### GET `{pub}/archive`

Unpaginated publication archive.

---

## Inbox & Reader Feed

### GET `{platform}/inbox/top`

Reader inbox — posts from subscribed pubs. `surface` values: `inbox_all`, `inbox_listen`, `inbox_paid`, `inbox_saved`, `inbox_history`.

### POST `{platform}/inbox/seen`

Mark all inbox as seen. Body: empty. Returns `{ ok: true }`.

### GET `{platform}/reader/feed/tabs`

Notes home feed tabs: `for-you`, `subscribed`, etc.

### GET `{platform}/reader/feed/c-{commentId}` / `p-{postId}`

Single feed item via entity_key. `c-` for notes, `p-` for posts.

### POST `{platform}/reader/feed/{entityKey}/seen`

Mark a feed item as seen. Body: empty.

---

## Subscriptions (reader-side)

### GET `{platform}/subscriptions?tvOnly=false`

Pubs the user is subscribed TO (not owned). `tvOnly` required — 400 without it.

### GET `{platform}/subscriptions/page_v2`

Paginated subscriptions (use `_v2` for new code).

### GET `{platform}/subscriptions/top/v2`

Most-engaged-with subscriptions for discovery surfaces.

### GET `{pub}/subscription`

Your subscription to this specific pub.

---

## Recommendations

**Some endpoints 403 from curl but 200 from a real browser** — send browser-style headers if headless.

### PUT `{pub}/recommendations`

Add recommendation (idempotent): `{recommended_publication_id, recommending_publication_id, source, suggested}`.

### DELETE `{pub}/recommendations/`

Remove recommendation. ⚠ **Trailing slash** in path (`/recommendations/` NOT `/recommendations`).

### GET `{pub}/recommendations/from/{publicationId}`

Outgoing recommendations. Optional: `offset`, `limit`, `paginate=true`.

### GET `{pub}/recommendations/exist`

Quick "recommendations enabled?" probe.

### GET `{pub}/recommendations/{publicationId}/suggested`

ML-suggested pubs to recommend.

### GET `{pub}/recommendations/from/{from}/to/{to}`

Specific recommendation edge check.

### GET `{pub}/recommendations/stats/to`

Incoming recommendations with subscriber-acquisition stats.

### GET `{pub}/publication/search?query=...&page=N`

Search pubs by name (for recommendation picker).

---

## Substack Chat (threads)

### POST `{pub}/community/publications/{pubId}/publication_threads_settings`

Enable/configure: `{threads_v2_enabled, create_thread_minimum_role, reader_thread_notifications_enabled}`.

### POST `{pub}/community/publications/{pubId}/posts`

Send thread. ⚠ **`id` is client-generated UUID** (used as canonical thread id).

### GET `{pub}/community/publications/{pubId}/posts`

List threads.

### GET `{pub}/community/publications/{pubId}/posts/scheduled`

Scheduled threads.

### DELETE `{pub}/community/posts/{threadId}`

Delete thread. ⚠ Path is `/community/posts/{id}`, NOT `/community/publications/{pub}/posts/{id}`.

---

## DMs / Messages

### GET `{platform}/messages/inbox`

DMs inbox.

### GET `{platform}/messages/unread-count`

Combined badge counts: `{unreadCount, pendingInviteCount, pendingInviteUnreadCount, newPendingInviteUnreadCount, pubChatUnreadCount}`.

Send-DM endpoint not yet mapped (likely `POST /messages` with `{recipient_user_id, body}`).

---

## Search & Discovery

### GET `{platform}/search/explore/web?query=...`

Global search across pubs, posts, and Notes.

### GET `{platform}/search-modules`

Discovery surface — trending topics + per-category lists.

### GET `{platform}/categories`

All publication categories (Culture, Tech, etc.). Public.

### GET `{platform}/category/public/{categoryId}/{categoryType}`

Pubs in a category. `categoryType`: `all`, `top`, `new`.

---

## Activity & Realtime

### GET `{platform}/activity/unread`

Activity feed unread count: `{count, max: bool, lastViewedAt}`.

### GET `{platform}/realtime/token`

JWT (`aud: zync`) for websocket subscriptions to Notes refresh + chat.

---

## Auth

### POST `{platform}/login`

Legacy email+password: `{email, password}`.

### POST `{platform}/email-login`

Magic-link: `{email}`.

---

## Live Streams

### GET `{pub}/live_streams`

List live streams. Query: `status` (`scheduled`/`live`/`ended`), `stream_type` (`rtmp_only`).

### GET `{pub}/live_stream/eligible_hosts`

Users who can host: `{users: [{id, name, handle}]}`.

---

## Audio Upload

4-step S3 presigned multipart:
1. `POST {pub}/audio/upload` → `media_upload_id` + S3 presigned PUT URL.
2. `PUT <s3-url>` to `substack-video.s3-accelerate.amazonaws.com`. Save `ETag`.
3. `POST {pub}/audio/upload/{id}/transcode` with `{duration, multipart_upload_id, multipart_upload_etags}`.
4. `GET {pub}/audio/upload/{id}` — poll status.

---

## Video Cross-posting

### GET `{pub}/video/youtube/check-authorization`

YouTube auth status.

### GET `{pub}/video/youtube/show-banner`

Whether to show the YouTube connect banner.

### GET `{pub}/video/linkedin/check-authorization`

LinkedIn auth status.

### GET `{pub}/video/linkedin/{postId}/auto-upload-state`

LinkedIn auto-upload state for a post.

---

## Utilities

### GET `{platform}/blocks/ids`

Flat array of blocked user IDs.

### GET `{platform}/settings`

Account-level settings.

### PUT `{platform}/user-setting`

Per-user key/value setter: `{type, value_<typed>}`. Verified: `newest_seen_chat_item_published_at`.

### PUT `{pub}/user/writer_referrals/code`

Get/create writer referral code (idempotent).

### GET `{pub}/notification_settings/post/{postId}/mute`

Per-post notification mute state.

### GET `{platform}/comment/moderation/delete_reasons`

Moderator delete reasons enum.

### GET `{platform}/user/{userId}-{handle}/public_profile/self`

Own public profile via slug form.

### GET `{platform}/reader/posts`

Global reader feed — posts from across subscriptions.

### POST `{pub}/publication`

**Captcha-gated** — create pub. Required: `{name, subdomain, hero_text}`. Not headlessly automatable.

### GET `{pub}/publication/transfer_ownership/status`

Ownership transfer state.

### GET `{pub}/publication/subdomain/can_alias`

Subdomain alias permission check.

### GET `{pub}/publication/users`

User roles on the pub.

### GET `{pub}/publication_user`

Per-user publication roles + bios.

### GET `{pub}/publication_user_invite`

Pending co-author invites.

### POST `{pub}/publication/invite`

Invite co-author: `{email, name}`. ⚠ Sends real email.

### GET `{pub}/publication_pages`

Custom pub pages (about, etc.).

### GET `{pub}/publication_export`

Subscriber CSV export jobs.

### GET `{pub}/publication_launch_checklist`

Onboarding checklist state.

### GET `{pub}/feed/drafts?limit=N`

Saved Notes drafts for the publication.

---

## Cross-post / Restack

### POST `{platform}/restack/{postId}`

Cross-post a post from one publication to another. This is a **publication-level share** — it creates a link in the target publication, not a visible note.

```json
{
  "restackingPubId": 12345,
  "audience": "everyone",
  "introText": "I'm reprinting this post from another publication:"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `restackingPubId` | int | ID of the publication to cross-post INTO |
| `audience` | string | `"everyone"` or `"only_paid"` |
| `introText` | string | Optional intro text shown before the cross-posted content |

### RESTACK WORKFLOW (Note-based restack)

For a social/visible restack in the notes feed:

1. **Create attachment** — `POST /comment/attachment/`
   ```json
   { "url": "https://{pub}.substack.com/p/{slug}", "type": "link" }
   ```
   Response: `{ "id": "uuid", "type": "post" or "comment", "url": "..." }`
   
   The `type` in the response changes to `"post"` or `"comment"` based on URL content. Using `type: "link"` in the request body is correct — the server resolves it.

2. **Create note with attachment** — `POST /comment/feed/`
   ```json
   {
     "bodyJson": { "type": "doc", ... },
     "tabId": "for-you", "surface": "feed", "replyMinimumRole": "everyone",
     "attachmentIds": ["uuid-from-step-1"]
   }
   ```

3. **Clean up** — Delete the note as normal. Note: deleting a restack note does **not** decrement the source content's `restacks` counter.

You can attach **multiple** items: `attachmentIds: ["uuid1", "uuid2"]`. Notes cannot be restacked using the cross-post endpoint — only posts.

### IMAGE ATTACHMENT WORKFLOW

For attaching images to notes (renders as embedded image cards within the note):

1. **Upload image** — `POST {pub}/image` (JSON body, see [Image Upload](#image-upload))
   ```json
   { "image": "data:image/png;base64,iVBORw0KGgo..." }
   ```
   Response includes `url`, `imageWidth`, `imageHeight`, `bytes`.

2. **Create image attachment** — `POST /comment/attachment/`
   ```json
   { "url": "https://substack-post-media.s3.amazonaws.com/public/images/...", "type": "image" }
   ```
   Response:
   ```json
   {
     "id": "uuid",
     "type": "image",
     "imageUrl": "https://substack-post-media.s3.amazonaws.com/public/images/...",
     "imageWidth": 800,
     "imageHeight": 600,
     "explicit": false
   }
   ```
   > **Note**: `type: "image"` in the request body is essential. Using `type: "link"` with an image URL returns `200 null` (no attachment created).

3. **Create note with image attachment** — `POST /comment/feed/`
   ```json
   {
     "tabId": "for-you", "surface": "feed", "replyMinimumRole": "everyone",
     "attachmentIds": ["uuid-from-step-2"]
   }
   ```
   The `bodyJson` field is optional — you can create an image-only note.

4. **Attachments are single-use**. A given attachment UUID can only be used in one note. Attempting to reuse it returns `400`.

**Multiple images**: You can attach multiple images in a single note:
```json
{ "attachmentIds": ["uuid-img-1", "uuid-img-2"] }
```

**Mixing attachments**: Image attachments and post/note restack attachments can be mixed in the same note:
```json
{ "attachmentIds": ["uuid-image", "uuid-post-restack"] }
```

**Limitations**:
- Images cannot be rendered inline in the note's body text (no `image2` in ProseMirror). They appear as attachment cards below the text.
- The note `body_json` supports only text markdown (paragraphs, bold, italic, lists, links). See [CONTENT_FORMATS.md](CONTENT_FORMATS.md).

---

## Subscriber Data

### Available (reader-side)

| Source | Data | Endpoint |
|--------|------|----------|
| Public profile | Free subscriber count + rough bucket, follower count | `GET /user/{handle}/public_profile` |
| Publication info | Boolean flags: `has_paid_subs`, `payments_state`, `founding_plan_enabled` | `GET {pub}/publication` |

### Available (writer/admin-side)

| Data | Endpoint | Notes |
|------|----------|-------|
| Full subscriber list (paginated, filterable) | `POST {pub}/subscriber-stats` | ⚠ POST for a read. Returns `count`, `subscribers[]`, `chartCounts`. Includes email addresses. |
| Add a subscriber | `POST {pub}/subscriber/add` | Body: `{email, name?, tier?}`. ⚠ Real action. |
| Remove a subscriber | `DELETE {pub}/subscriber/{subscriptionId}` | `subscriptionId` from `POST /subscriber-stats` |
| CSV import job status | `GET {pub}/import` | `{total, is_added, is_skipped, passImportVerification}` |
| Stripe Connect status + plans | `GET {pub}/stripe/account` | Returns `null` when not connected |
| Paid-tier list (cents) | `GET {pub}/pledges/plans` | `{enabled, payment_pledge_plans: [{name, amount, interval, currency}]}` |
| Pledge plan summary | `GET {pub}/pledges/plans/summary` | Summary stats |

### Publication Stats (writer/admin)

| Endpoint | Returns |
|----------|---------|
| `GET {pub}/publish-dashboard/summary` | All-time: subscribers, appSubscribers, openRate, pledgesAmount, isBestseller |
| `GET {pub}/publish-dashboard/summary-v2?range={N}` | Windowed snapshots: `totalSubscribersStart/End`, `paidSubscribersStart/End`, `arrStart/End` (`range`: 7, 30, 365) |
| `GET {pub}/publication/stats/emails/timeseries` | Daily email send counts ~1 year: `[["2025/06/24", 72], ...]` |
| `GET {pub}/publication/stats/network_attribution` | Subscriber attribution by source (`subs_count` per channel) |
| `GET {pub}/publication/stats/payment_pledges` | Per-user paid-pledge breakdown |
| `GET {pub}/publication/stats/can-delete-archive` | Permission flag for deleting archived stats |
| `GET {pub}/publication/stats/growth/sources` | Growth source breakdown: `from_date`, `to_date`, `order_by` params |
| `GET {pub}/publication/stats/growth/events` | Growth events timeline: `from_date`, `to_date` params |
| `POST {pub}/publication/stats/growth/partial-timeseries` | Partial chart series (pan/zoom) |
| `GET {pub}/grow/suggestion` | Server-side growth tip for dashboard |

### Per-Post Stats

| Endpoint | Returns |
|----------|---------|
| `GET {pub}/post_management/detail/{postId}?offset=0&limit=1` | Post object with nested `stats` dict (31 fields) |

**Key `stats` fields**:
- `sent`, `delivered` — delivery metrics
- `opens`, `opened`, `open_rate` — open metrics
- `clicks`, `clicked`, `click_through_rate` — click metrics
- `views`, `shares`, `signups`, `subscribes` — engagement
- `firstWeekDailyStats` — 7 daily snapshots
- `links` — clicked-link records
- `referrers` — traffic sources
- `estimated_value` — monetization estimate

### Not Available (via public API)

- **Paid subscriber count** — no direct endpoint. Use `POST /subscriber-stats` and filter by `subscription_interval` (`"monthly"`, `"annual"`).
- **Per-post subscriber attribution** — individual posts in `GET /profile/posts` do not include subscriber counts or revenue.

---

## Pagination Patterns

### Cursor-based (most feed endpoints)

Uses opaque `?cursor=` query param (base64-encoded). Invalid cursor values return **400**. Response includes `nextCursor` (cursor for next page) and `originalCursorTimestamp`.

| Endpoint | Scope | Response pagination fields |
|----------|-------|---------------------------|
| `GET /reader/feed` | Platform | `nextCursor`, `originalCursorTimestamp`, `trackingParameters` |
| `GET /reader/feed/profile/{id}` | Platform | `nextCursor`, `originalCursorTimestamp` |
| `GET /profile/posts?profile_user_id={id}` | Platform | `nextCursor` |
| `GET /posts?limit=N&offset=N` | Publication | `offset`, `limit`, `total`, `isCapped` |
| `GET /post_management/published` | Publication | `offset`, `limit`, `total`, `isCapped` |
| `GET /post_management/drafts` | Publication | `offset`, `limit`, `total`, `isCapped` |
| `GET /post_management/scheduled` | Publication | `offset`, `limit`, `total`, `isCapped` |
| `GET /archive` | Publication | None — unpaginated |
| `GET /inbox/top` | Platform | `limit` |
| `GET /subscriptions/page_v2` | Platform | Paginated |
| `GET /subscriptions/top/v2` | Platform | Paginated |
| `GET {pub}/notes` | Publication | `nextCursor`, `originalCursorTimestamp` |
| `GET {pub}/reader/feed/profile/{id}?types=note` | Publication | `nextCursor`, `originalCursorTimestamp` |

### Offset-based (legacy, being deprecated)

Uses `?offset=` and `?limit=` params. Response includes `hasMore` (bool) and `nextCursor` (numeric string = next offset value).

| Endpoint | Scope | Notes |
|----------|-------|-------|
| `GET {pub}/drafts` | Publication | Also accepts `?cursor=` (alias for offset). Response: `nextCursor` (numeric), `hasMore`. |
| `GET {pub}/posts` | Publication | Standard offset/limit. Response: `offset`, `limit`, `total`, `isCapped`. |
| `GET {pub}/post_management/published` | Publication | Also accepts `order_by`, `order_direction`. |
| `GET {pub}/post_management/drafts` | Publication | `order_by` only accepts `draft_updated_at`. |
| `GET {pub}/post_management/scheduled` | Publication | `order_by` only accepts `draft_updated_at`. |
| `POST {pub}/subscriber-stats` | Publication | Uses `offset`/`limit` in POST body. |
| `GET {pub}/recommendations/from/{id}` | Publication | Optional `offset`, `limit`, `paginate`. |
| `GET {pub}/recommendations/stats/to` | Publication | Required `offset`, `limit`, `order_by`. |
| `GET {pub}/publication/search` | Publication | Uses `page` (zero-indexed). |

### No pagination

| Endpoint | Scope | Reason |
|----------|-------|--------|
| `GET /feed/following` | Platform | Flat array of user IDs |
| `GET /reader/feed/c-{id}` / `p-{id}` | Platform | Single feed item |
| `GET /reader/comment/{id}` | Platform | Single resource |
| `GET /reader/comment/{id}/replies` | Platform | All branches at once |
| `GET /reader/feed/tabs` | Platform | Small fixed list |
| `GET /posts/by-id/{id}` | Platform | Single resource |
| `GET /user/{handle}/public_profile` | Platform | Single resource |
| `GET /user/{id}-{handle}/public_profile/self` | Platform | Single resource |
| `GET /user/profile/self` | Platform | Single resource |
| `GET /user-settings` | Platform | Flat key-value store |
| `GET /settings` | Platform | Single resource |
| `GET /blocks/ids` | Platform | Flat array |
| `GET /activity/unread` | Platform | Single object |
| `GET /realtime/token` | Platform | Single JWT |
| `GET /categories` | Platform | Small fixed list |
| `GET /inbox/seen` | Platform | No-op |
| `GET /messages/inbox` | Platform | All at once |
| `GET /messages/unread-count` | Platform | Single object |
| `GET /search-modules` | Platform | Content modules |
| `GET /reader/posts` | Platform | Global feed |
| `GET {pub}/publication` | Publication | Single resource |
| `GET {pub}/publication/sections` | Publication | Small fixed list |
| `GET {pub}/publication/settings` | Publication | Single resource |
| `GET {pub}/publication/logo` | Publication | Single resource |
| `GET {pub}/publication/bestseller_tier` | Publication | Single value |
| `GET {pub}/publication/publication_tags` | Publication | Array |
| `GET {pub}/publication/post-tag` | Publication | Array |
| `GET {pub}/publication/post-tag/settings` | Publication | Array |
| `GET {pub}/publication/verify_status` | Publication | Single value |
| `GET {pub}/publication/subdomain/can_alias` | Publication | Single bool |
| `GET {pub}/publication/transfer_ownership/status` | Publication | Single resource |
| `GET {pub}/publication/users` | Publication | Array |
| `GET {pub}/publication_user` | Publication | Array |
| `GET {pub}/publication_user_invite` | Publication | Array |
| `GET {pub}/publication_pages` | Publication | Array |
| `GET {pub}/publication_export` | Publication | Array |
| `GET {pub}/publication_launch_checklist` | Publication | Array |
| `GET {pub}/drafts/{id}` | Publication | Single resource |
| `GET {pub}/drafts/{id}/prepublish` | Publication | Single resource |
| `GET {pub}/drafts/{id}/scheduled_release` | Publication | Array |
| `GET {pub}/post/{id}/comments` | Publication | All comments at once |
| `GET {pub}/post/{id}/theme` | Publication | Single value |
| `GET {pub}/post_management/detail/{id}` | Publication | Single resource |
| `GET {pub}/archive` | Publication | All posts at once |
| `GET {pub}/subscription` | Publication | Single resource |
| `GET {pub}/notification_settings/post/{id}/mute` | Publication | Single value |
| `GET {pub}/grow/suggestion` | Publication | Single resource |
| `GET {pub}/feed/drafts` | Publication | Paginated internally |
| `GET {pub}/live_streams` | Publication | Array |
| `GET {pub}/live_stream/eligible_hosts` | Publication | Array |
| `GET {pub}/video/youtube/check-authorization` | Publication | Single value |
| `GET {pub}/video/youtube/show-banner` | Publication | Single bool |
| `GET {pub}/video/linkedin/check-authorization` | Publication | Single value |
| `GET {pub}/user/writer_referrals/code` | Publication | Single value |
| `GET {pub}/stripe/account` | Publication | Single resource |
| `GET {pub}/pledges/plans` | Publication | Array |
| `GET {pub}/pledges/plans/summary` | Publication | Single resource |
| `GET {pub}/import` | Publication | Single resource |
| `GET {pub}/recommendations/exist` | Publication | Single bool |
| `GET {pub}/recommendations/{id}/suggested` | Publication | Array |
| `GET {pub}/recommendations/from/{from}/to/{to}` | Publication | Single resource |
| `GET {pub}/community/publications/{id}/posts` | Publication | Array |
| `GET {pub}/community/publications/{id}/posts/scheduled` | Publication | Array |
| `GET {pub}/publication/search` | Publication | Paginated in UI |

### Migration history

- **`profile/posts`**: Previously accepted `offset`/`limit`, now **rejects `offset`** (400). Must use `cursor`/`limit`.
- **`reader/feed`**: Previously used `page`/`page_size`, now cursor-based. Legacy params still accepted but ignored.
- **`pub/drafts`**: Still accepts both `offset` and `cursor` — `cursor` is simply the numeric offset as a string.

---

## Error Reference

| Status | Meaning |
|--------|---------|
| `200` | Success |
| `204` | Success, empty body (deletes, telemetry) |
| `400` | Bad request — body lists invalid/missing param |
| `401` | Cookie missing or expired |
| `403` | Cookie valid but lacking permission. Try on **different host** (platform vs pub) — some endpoints 403 on one host but 200 on the other |
| `404` (HTML) | Endpoint or resource doesn't exist |
| `404` (JSON `{error: "User not found"}`) | Resource exists but inaccessible |
| `409` | Conflict — name uniqueness violation |
| `429` | Rate limited — back off and retry |
| `500` | Substack internal error — usually transient |

### Endpoints that DON'T exist

- `GET /api/v1/me`, `GET /api/v1/account`, `GET /api/v1/account/me`
- `GET /api/v1/profile`, `GET /api/v1/users/me`
- `GET /api/v1/reader/inbox`, `GET /api/v1/notes`, `GET /api/v1/comments`
- `GET /api/v1/contacts`, `GET /api/v1/subscribers`, `GET /api/v1/free_subscribers`
- `GET /api/v1/stats`, `GET /api/v1/post_management/stats`, `GET /api/v1/post_management/draft`
- `GET /api/v1/posts/{slug}` (use `/posts/by-id/{id}` instead)

### Endpoints that 403 (even with valid cookie)

- `GET /api/v1/admin/profile`, `GET /api/v1/admin/publications`
- `GET /api/v1/user/profile` (note: WITHOUT `/self`)
- `GET /api/v1/user/me`
- `GET /api/v1/publication` on `substack.com` — but **200 from pub subdomain**
- `GET /api/v1/publication/subscriptions` (likely Pro plan+)
- `GET /api/v1/publication/recommendations` from `substack.com` — but `GET /recommendations/from/{pub}` on pub host works

### Two-host trick

Some endpoints are gated on `substack.com` but open on `{pub}.substack.com` (or vice versa). If you get 403 on one host, try the other before assuming the endpoint is dead. A small number (notably recommendations) return 403 from curl but 200 from a browser — the SPA sends headers (`Sec-Fetch-*`, `Referer`, `Origin`) that the server gates on.
