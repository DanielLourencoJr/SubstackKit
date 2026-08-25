# Substack Internal API — Endpoint Reference

> Quick-reference tables. See [API_REFERENCE.md](API_REFERENCE.md) for detailed docs with JSON examples.

## Conventions

| Prefix | Scope | Base URL |
|--------|-------|----------|
| `{pub}` | Publication | `https://{pub}.substack.com/api/v1` |
| (none)  | Platform  | `https://substack.com/api/v1` |

**Auth**: All endpoints use `Cookie: substack.sid=<session>` as the sole credential (see [AUTH.md](AUTH.md)).

---

## Platform Endpoints (`substack.com/api/v1`)

| Method | Endpoint | Auth | Pagination | Description |
|--------|----------|------|------------|-------------|
| GET | `/user/{handle}/public_profile` | ❌ No | — | Public profile by handle |
| GET | `/user/{user_id}-{handle}/public_profile/self` | ✅ Yes | — | Own public profile via slug form (`{id}-{handle}`) |
| GET | `/user/profile/self` | ✅ Yes | — | Own profile, every publication + `publicationUserId` for bylines |
| GET | `/handle/options` | ✅ Yes | — | Available handles/slugs |
| GET | `/user-settings` | ✅ Yes | — | User settings (flat key-value store) |
| GET | `/settings` | ✅ Yes | — | Account-level settings (notifications, defaults) |
| PUT | `/user-setting` | ✅ Yes | — | Generic per-user key/value setter (`{type, value_<typed>}`) |
| PUT | `/user/writer_referrals/code` | ✅ Yes | — | Get/create writer referral code (idempotent) |
| GET | `/blocks/ids` | ✅ Yes | — | Flat array of blocked user IDs |
| GET | `/activity/unread` | ✅ Yes | — | Activity feed unread count (`{count, max, lastViewedAt}`) |
| GET | `/realtime/token` | ✅ Yes | — | JWT for websocket subscriptions to Notes refresh + chat |
| GET | `/categories` | ❌ No | — | All publication categories (Culture, Tech, etc.) |
| GET | `/category/public/{categoryId}/{categoryType}` | ❌ No | — | Publications in a category. `categoryType`: `all`, `top`, `new` |
| GET | `/profile/posts?profile_user_id={id}&limit={n}` | ❌ No | cursor | Published posts for a user. ⚠ `offset` rejected (400). |
| GET | `/posts/by-id/{id}` | ❌ No | — | Single published post with full `body_html` |
| GET | `/reader/posts` | ✅ Yes | — | Global reader feed — posts from across subscriptions |
| GET | `/reader/feed` | ❌ No | cursor | "For You" home feed — ML-ranked mix of posts, notes, suggestions. Auth changes the entire item set (personalized). |
| GET | `/reader/feed?user_id={id}` | ❌ No | cursor | Same as above — `user_id` param is accepted but has no effect |
| GET | `/reader/feed/profile/{profileId}` | ❌ No | cursor | **All content** by a user across all publications. `?types=note\|post\|replies\|likes` to filter. |
| GET | `/reader/feed/tabs` | ❌ No | — | Notes home feed tabs: `for-you`, `subscribed`, etc. |
| GET | `/reader/feed/c-{commentId}` | ❌ No | — | Single feed item via entity_key (note) |
| GET | `/reader/feed/p-{postId}` | ❌ No | — | Single feed item via entity_key (post) |
| POST | `/reader/feed/{entityKey}/seen` | ✅ Yes | — | Mark a feed item as seen (analytics) |
| GET | `/reader/comment/{id}` | ❌ No | — | Read a single note/comment by ID |
| GET | `/reader/comment/{id}/replies` | ❌ No | — | List threaded replies to a note (`commentBranches`) |
| POST | `/comment/feed/` | ✅ Yes | — | Create a note (ProseMirror JSON). `parent_id` (number) for threaded replies. |
| DELETE | `/comment/{id}` | ✅ Yes | — | Delete a note or comment |
| POST | `/comment/attachment/` | ✅ Yes | — | Resolve URL to attachment UUID |
| GET | `/feed/following` | ✅ Yes | — | Flat array of followed user IDs (first = own id) |
| GET | `/feed/drafts?limit=N` | ✅ Yes | — | Saved Notes drafts for the publication |
| GET | `/inbox/top` | ✅ Yes | cursor | Reader inbox — posts from subscribed pubs. `surface` enum: `inbox_all`, `inbox_listen`, `inbox_paid`, `inbox_saved`, `inbox_history` |
| POST | `/inbox/seen` | ✅ Yes | — | Mark all inbox items as seen |
| GET | `/subscriptions?tvOnly=false` | ✅ Yes | — | Publications you're subscribed TO (not owned). `tvOnly` required. |
| GET | `/subscriptions/page_v2` | ✅ Yes | — | Paginated subscriptions list |
| GET | `/subscriptions/top/v2` | ✅ Yes | — | Most-engaged-with subscriptions (for discovery surfaces) |
| GET | `/subscription` | ✅ Yes | — | Your subscription to a specific pub (check "am I subscribed?") |
| POST | `/restack/{postId}` | ✅ Yes | — | Cross-post a post to another publication |
| POST | `/post/{postId}/reaction` | ✅ Yes | — | Like/unlike a post (`{reaction: "❤", surface: "reader"}`) |
| DELETE | `/post/{id}/reaction` | ✅ Yes | — | Explicit unlike a post |
| POST | `/comment/{id}/reaction` | ✅ Yes | — | Like/unlike a note/comment |
| DELETE | `/comment/{id}/reaction` | ✅ Yes | — | Explicit unlike note |
| GET | `/threads/reactions` | ❌ No | — | Catalog of reaction emojis for Notes/comments (named strings) |
| GET | `/comment/moderation/delete_reasons` | ✅ Yes | — | Enum of moderator delete reasons |
| GET | `/search/explore/web?query=...` | ❌ No | — | Global search across pubs, posts, and Notes |
| GET | `/search-modules` | ❌ No | — | Discovery surface — trending topics + per-category lists |
| GET | `/messages/inbox` | ✅ Yes | — | DMs inbox |
| GET | `/messages/unread-count` | ✅ Yes | — | Combined badge counts: DMs, invites, pub chat |
| POST | `/login` | ✅ Yes | — | Legacy email+password login |
| POST | `/email-login` | ✅ Yes | — | Magic-link email login |
| POST | `/firehose/batch` | ✅ Yes | — | ⚠ Telemetry — client-side analytics batch (204 No Content) |

---

## Publication Endpoints (`{pub}.substack.com/api/v1`)

| Method | Endpoint | Auth | Pagination | Description |
|--------|----------|------|------------|-------------|
| GET | `/publication` | ✅ Yes | — | Publication info (name, logo, custom domain, etc.) |
| PUT | `/publication` | ✅ Yes | — | Update publication settings (single field per call) |
| GET | `/publication_settings` | ✅ Yes | — | Flat key/value map of boolean toggles |
| PUT | `/publication_settings` | ✅ Yes | — | Update a single boolean toggle |
| GET | `/publication/sections` | ✅ Yes | — | Sections/categories |
| GET | `/publication/settings` | ✅ Yes | — | Publication settings (may 403 for non-admins) |
| GET | `/publication/logo` | ✅ Yes | — | Logo metadata |
| GET | `/publication/bestseller_tier` | ✅ Yes | — | Bestseller badge tier (or null) |
| GET | `/publication/publication_tags` | ✅ Yes | — | Discovery category tags (not post tags) |
| GET | `/publication/post-tag` | ✅ Yes | — | Per-post tags configured for the pub |
| GET | `/publication/post-tag/settings` | ✅ Yes | — | Tags with navigation bar visibility |
| POST | `/publication/post-tag` | ✅ Yes | — | Create a new post tag (body: `{name}`) |
| DELETE | `/publication/post-tag/{id}` | ✅ Yes | — | Delete a post tag |
| GET | `/publication/subdomain/can_alias` | ✅ Yes | — | Subdomain alias permission check |
| GET | `/publication/transfer_ownership/status` | ✅ Yes | — | In-flight ownership transfer state |
| GET | `/publication/verify_status` | ✅ Yes | — | Verification/blue-check status |
| GET | `/publication/users` | ✅ Yes | — | Users with roles on this pub |
| GET | `/publication_user` | ✅ Yes | — | Pub user roles + bios |
| GET | `/publication_user_invite` | ✅ Yes | — | Pending co-author invites |
| POST | `/publication/invite` | ✅ Yes | — | Invite co-author (⚠ sends real email) |
| GET | `/publication_pages` | ✅ Yes | — | Custom pub pages (about, etc.) |
| GET | `/publication_export` | ✅ Yes | — | Subscriber CSV export jobs |
| GET | `/publication_launch_checklist` | ✅ Yes | — | Onboarding checklist state |
| GET | `/publication/search?query=...&page=N` | ✅ Yes | — | Search publications by name (for recommendation picker) |
| POST | `/publication` (creation) | ✅ Yes | — | **Captcha-gated** — create pub (`{name, subdomain, hero_text}`) |
| GET | `/archive` | ✅ Yes | — | Unpaginated publication archive (all published posts) |
| GET | `/posts?limit=N&offset=N` | ❌ No | offset | Published post listings for browsing |
| GET | `/post_management/published` | ✅ Yes | offset | Admin view — published posts with engagement context |
| GET | `/post_management/drafts` | ✅ Yes | offset | Paginated drafts list |
| GET | `/post_management/scheduled` | ✅ Yes | offset | Scheduled posts |
| GET | `/post_management/counts` | ✅ Yes | — | Dashboard counts (`published`, `drafts`, `scheduled`) |
| GET | `/post_management/live_stream_drafts` | ✅ Yes | — | Live stream drafts |
| GET | `/post_management/detail/{postId}` | ✅ Yes | — | Post with **31-field stats** (open rate, CTR, views, etc.) |
| GET | `/post/{postId}/theme` | ✅ Yes | — | Post-level theme override (null = pub default) |
| GET | `/post/{postId}/comments` | ✅ Yes | — | All comments on a post (includes `automod_hidden_comments`) |
| POST | `/post/{postId}/comment` | ✅ Yes | — | Create a comment on a post |
| POST | `/post/{postId}/tag/{tagId}` | ✅ Yes | — | Attach a tag to a post (body: empty) |
| DELETE | `/post/{postId}/tag/{tagId}` | ✅ Yes | — | Detach a tag from a post |
| DELETE | `/comment/{id}` | ✅ Yes | — | Delete a comment on a post (publication scope) |
| POST | `/post/{postId}/reaction` | ✅ Yes | — | Like/unlike a post |
| DELETE | `/post/{postId}/reaction` | ✅ Yes | — | Explicit unlike |
| GET | `/drafts` | ✅ Yes | offset / cursor | All content (drafts + published) |
| GET | `/drafts/{id}` | ✅ Yes | — | Single draft by ID |
| POST | `/drafts` | ✅ Yes | — | Create a draft (Tiptap JSON body). **`draft_bylines` required.** |
| PUT | `/drafts/{id}` | ✅ Yes | — | Update a draft |
| DELETE | `/drafts/{id}` | ✅ Yes | — | Delete a draft |
| POST | `/drafts/{id}/publish` | ✅ Yes | — | Publish a draft (`{send, share_automatically}`) |
| GET | `/drafts/{id}/prepublish` | ✅ Yes | — | Pre-flight check (`{errors, suggestions}`) |
| POST | `/drafts/{id}/scheduled_release` | ✅ Yes | — | Schedule a draft (`{trigger_at, post_audience}`) |
| GET | `/drafts/{id}/scheduled_release` | ✅ Yes | — | Get schedule info for a draft |
| DELETE | `/drafts/{id}/scheduled_release` | ✅ Yes | — | Unschedule a draft |
| POST | `/image` | ✅ Yes | — | Upload image (JSON Base64 data URI — NOT multipart) |
| GET | `/notes` | ✅ Yes | cursor | Notes feed for the publication |
| GET | `/reader/feed/profile/{profileId}?types=note` | ✅ Yes | cursor | Notes for a user profile within this publication |
| POST | `/subscriber-stats` | ✅ Yes | offset | **POST** for a read — list subscribers with filters |
| POST | `/subscriber/add` | ✅ Yes | — | Add a subscriber (⚠ real action) |
| DELETE | `/subscriber/{subscriptionId}` | ✅ Yes | — | Remove a subscriber |
| GET | `/import` | ✅ Yes | — | CSV import job status |
| GET | `/stripe/account` | ✅ Yes | — | Stripe Connect account status + plans |
| GET | `/pledges/plans` | ✅ Yes | — | Paid-tier list (amounts in cents) |
| GET | `/pledges/plans/summary` | ✅ Yes | — | Pledge plan summary stats |
| GET | `/publish-dashboard/summary` | ✅ Yes | — | All-time pub stats (subscribers, open rate, etc.) |
| GET | `/publish-dashboard/summary-v2?range={N}` | ✅ Yes | — | Windowed snapshots (`range`: 7, 30, 365) |
| GET | `/publication/stats/emails/timeseries` | ✅ Yes | — | Daily email sends (~1 year) |
| GET | `/publication/stats/network_attribution` | ✅ Yes | — | Subscriber attribution by source |
| GET | `/publication/stats/payment_pledges` | ✅ Yes | — | Per-user paid pledge breakdown |
| GET | `/publication/stats/can-delete-archive` | ✅ Yes | — | Permission flag for deleting archived stats |
| GET | `/publication/stats/growth/sources` | ✅ Yes | — | Growth source breakdown for a date window |
| GET | `/publication/stats/growth/events` | ✅ Yes | — | Growth events timeline |
| POST | `/publication/stats/growth/partial-timeseries` | ✅ Yes | — | Partial chart series updates (pan/zoom) |
| GET | `/grow/suggestion` | ✅ Yes | — | Server-side growth tip for dashboard |
| GET | `/notification_settings/post/{postId}/mute` | ✅ Yes | — | Per-post notification mute state |
| PUT | `/recommendations` | ✅ Yes | — | Add recommendation (idempotent) |
| DELETE | `/recommendations/` | ✅ Yes | — | Remove recommendation (⚠ trailing slash) |
| GET | `/recommendations/from/{publicationId}` | ✅ Yes | offset | Outgoing recommendations list |
| GET | `/recommendations/exist` | ✅ Yes | — | Quick "recommendations enabled?" probe |
| GET | `/recommendations/{publicationId}/suggested` | ✅ Yes | — | ML-suggested pubs to recommend |
| GET | `/recommendations/from/{fromPubId}/to/{toPubId}` | ✅ Yes | — | Specific recommendation edge check |
| GET | `/recommendations/stats/to` | ✅ Yes | offset | Incoming recommendations with acquisition stats |
| POST | `/community/publications/{pubId}/publication_threads_settings` | ✅ Yes | — | Enable/configure Substack Chat |
| GET | `/community/publications/{pubId}/posts` | ✅ Yes | — | List threads for publication |
| POST | `/community/publications/{pubId}/posts` | ✅ Yes | — | Send a thread (⚠ client-generated UUID) |
| GET | `/community/publications/{pubId}/posts/scheduled` | ✅ Yes | — | Scheduled threads |
| DELETE | `/community/posts/{threadId}` | ✅ Yes | — | Delete a thread (path: NOT under `/community/publications/`) |
| GET | `/live_streams` | ✅ Yes | — | List live streams (`status`, `stream_type` params) |
| GET | `/live_stream/eligible_hosts` | ✅ Yes | — | Users who can host a live stream |
| POST | `/audio/upload` | ✅ Yes | — | Initiate audio upload → S3 presigned URL |
| POST | `/audio/upload/{id}/transcode` | ✅ Yes | — | Complete multipart upload, start transcode |
| GET | `/audio/upload/{id}` | ✅ Yes | — | Poll upload + transcode status |
| GET | `/video/youtube/check-authorization` | ✅ Yes | — | YouTube cross-post auth status |
| GET | `/video/youtube/show-banner` | ✅ Yes | — | Whether to show YouTube connect banner |
| GET | `/video/linkedin/check-authorization` | ✅ Yes | — | LinkedIn cross-post auth status |
| GET | `/video/linkedin/{postId}/auto-upload-state` | ✅ Yes | — | LinkedIn auto-upload state for a post |

---

## Auth Matrix Summary

- **Publication scope**: All endpoints require auth → 403 without cookie.
- **Platform scope**, public reads: No auth needed.
- **Platform scope**, writes/personalized: Auth required.
