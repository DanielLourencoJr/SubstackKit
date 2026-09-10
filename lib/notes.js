import { retryFetch } from "./client.js";
import { sleep } from "./args.js";

function compareByTopLevelParent(a, b) {
  const aTop = parseInt(a.ancestor_path.split(".")[1] || a.id);
  const bTop = parseInt(b.ancestor_path.split(".")[1] || b.id);
  if (aTop !== bTop) return aTop - bTop;
  if (a.depth !== b.depth) return a.depth - b.depth;
  return a.id - b.id;
}

/**
 * Fetch one page of replies to a comment, including nested descendants.
 * Endpoint: GET /reader/comment/{commentId}/replies (cursor paginated).
 */
async function fetchCommentReplies(client, commentId, baseDepth = 0) {
  const fetched = [];
  let cursor = null;
  do {
    const url = cursor
      ? `/reader/comment/${commentId}/replies?cursor=${encodeURIComponent(cursor)}`
      : `/reader/comment/${commentId}/replies`;
    const replyPage = await retryFetch(() => client.substackClient.get(url), undefined, "(replies) ");
    const hasMore = replyPage.moreBranches === 1 || replyPage.moreBranches === true;
    for (const branch of replyPage.commentBranches || []) {
      if (branch.comment) {
        fetched.push(extractReply(branch.comment, baseDepth));
      }
      for (const dc of branch.descendantComments || []) {
        if (dc.comment) {
          fetched.push(
            extractReply(
              dc.comment,
              baseDepth + (dc.comment.tracking_parameters?.item_thread_depth ?? 1)
            )
          );
        }
      }
    }
    cursor = hasMore ? (replyPage.nextCursor || null) : null;
  } while (cursor);
  return fetched;
}

function extractReply(comment, depth) {
  return {
    id: comment.id,
    name: comment.name,
    body: comment.body,
    body_json: comment.body_json,
    date: comment.date,
    edited_at: comment.edited_at,
    reaction_count: comment.reaction_count,
    reactions: comment.reactions,
    children_count: comment.children_count ?? 0,
    depth,
    ancestor_path: comment.ancestor_path,
    attachments: comment.attachments ?? []
  };
}

/**
 * Recursively fetch all replies (all nesting depths) for a single note.
 * Returns the flattened, thread-ordered reply list.
 */
async function fetchAllReplies(client, commentId) {
  const replies = [];
  const seenIds = new Set();
  const initial = await fetchCommentReplies(client, commentId, 0);
  for (const r of initial) {
    seenIds.add(r.id);
    replies.push(r);
  }
  const processedParents = new Set();
  const queue = initial.filter((r) => r.children_count > 0).map((r) => r.id);
  while (queue.length) {
    const parentId = queue.shift();
    if (processedParents.has(parentId)) continue;
    processedParents.add(parentId);
    const children = await fetchCommentReplies(
      client,
      parentId,
      (replies.find((r) => r.id === parentId)?.depth ?? 0) + 1
    );
    for (const r of children) {
      if (!seenIds.has(r.id)) {
        seenIds.add(r.id);
        replies.push(r);
        if (r.children_count > 0) queue.push(r.id);
      }
    }
    await sleep(1200);
  }
  replies.sort(compareByTopLevelParent);
  return replies;
}

/**
 * Fetch notes for a profile via direct cursor pagination with 429 retry.
 *
 * Previous implementation used the library's `profile.notes()` iterator which
 * silently swallows *any* error (including 429) and truncates pagination
 * (`dist/index.js:369` → `yield* []`). That caused nondeterministic loss of
 * older notes (e.g. 204 vs 240 vs 290). We now hit the raw endpoint directly
 * with `retryFetch` and a 800ms gap between pages (see `docs/LIMITS.md`).
 */
export async function fetchNotes({ client, profile, limit = 0, includeReplies = true }) {
  // Raw pagination — bypass the `substack-api` iterator which truncates on 429.
  const notes = [];
  let cursor = undefined;
  // Prefer publicationClient (what NoteService uses) but fall back to substackClient
  const http = client.publicationClient ?? client.substackClient ?? client.substackClient;
  while (true) {
    const url = cursor
      ? `/reader/feed/profile/${profile.id}?types=note&cursor=${encodeURIComponent(cursor)}`
      : `/reader/feed/profile/${profile.id}?types=note`;
    const resp = await retryFetch(() => http.get(url), 8, "(notes) ");
    const items = resp.items || [];
    if (!items.length) break;
    for (const item of items) {
      if (limit > 0 && notes.length >= limit) break;
      // Mimic the `Note` entity shape expected downstream (`note.rawData.comment.id`, etc).
      // `normalizeNote` in `lib/schema.js:38` reads `rawData.comment` / `context.users`.
      notes.push({ rawData: item, id: item.entity_key, entityKey: item.entity_key });
    }
    if (limit > 0 && notes.length >= limit) break;
    if (!resp.nextCursor) break;
    cursor = resp.nextCursor;
    await sleep(800);
  }

  if (includeReplies) {
    const withReplies = notes.filter((n) => (n.rawData?.comment?.children_count || 0) > 0);
    if (withReplies.length) {
      console.log(`Fetching replies for ${withReplies.length} notes...`);
      for (let i = 0; i < withReplies.length; i++) {
        const note = withReplies[i];
        const commentId = note.rawData.comment.id;
        try {
          const replies = await fetchAllReplies(client, commentId);
          note.rawData.replies = replies;
          const expected = note.rawData.comment.children_count;
          if (!replies.length && expected > 0) {
            console.warn(`  Note #${commentId}: expected ${expected} replies, got 0 (may be deleted)`);
          } else {
            console.log(`  Note #${commentId}: ${replies.length} reply(s)`);
          }
        } catch (err) {
          note.rawData.replies = [];
          console.warn(`  Warning: failed to fetch replies for note #${commentId}: ${err.message}`);
        }
        await sleep(1200);
      }
    }
  }

  return notes;
}
