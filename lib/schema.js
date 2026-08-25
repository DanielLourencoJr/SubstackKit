import { nowStamp } from "./args.js";

export const SCHEMA_VERSION = "substack-export@1";

/**
 * Canonical post object used in every export. All fields are always present
 * (empty string / null / 0 when unknown). `rawData` keeps the full API object
 * for fidelity.
 */
export function normalizePost(raw) {
  return {
    id: raw?.id ?? null,
    slug: raw?.slug ?? "",
    title: raw?.title ?? "",
    subtitle: raw?.subtitle || raw?.description || "",
    publishedAt: raw?.publishedAt ?? raw?.post_date ?? raw?.date ?? "",
    url: raw?.url ?? raw?.canonical_url ?? "",
    likesCount: raw?.likesCount ?? raw?.reaction_count ?? 0,
    commentsCount: raw?.commentsCount ?? raw?.comment_count ?? 0,
    restacks: raw?.restacks ?? null,
    reactions: raw?.reactions ?? null,
    tags: raw?.tags ?? raw?.postTags ?? raw?.post_tags ?? [],
    coverImage: raw?.coverImage ?? raw?.cover_image ?? "",
    wordcount: raw?.wordcount ?? null,
    language: raw?.language ?? null,
    body: raw?.body ?? raw?.truncated_body_text ?? "",
    body_html: raw?.body_html ?? "",
    source: raw?.source ?? null,
    rawData: raw ?? {}
  };
}

/**
 * Canonical note object. Normalized fields are the contract; `rawData` keeps
 * the full feed item (with comment + context + replies) for fidelity and for
 * the converters' fallback lookups.
 */
export function normalizeNote(note) {
  const raw = note?.rawData ?? note ?? {};
  const comment = raw?.comment ?? {};
  const user = raw?.context?.users?.[0] ?? {};
  const primaryPub = user?.primary_publication ?? null;
  const entityKey = raw?.entity_key ?? (comment?.id ? `c-${comment.id}` : "");
  const id = comment?.id ?? note?.id ?? null;

  return {
    id,
    entityKey,
    publishedAt: note?.publishedAt ?? comment?.date ?? "",
    url: comment?.url ?? (entityKey ? `https://substack.com/notes/${entityKey}` : ""),
    likes: note?.likesCount ?? comment?.reaction_count ?? 0,
    reactions: comment?.reactions ?? null,
    restacks: comment?.restacks ?? null,
    repliesCount: comment?.children_count ?? null,
    editedAt: comment?.edited_at ?? null,
    language: comment?.language ?? null,
    ancestorPath: comment?.ancestor_path ?? null,
    author: {
      id: user?.id ?? comment?.user_id ?? null,
      name: comment?.name ?? user?.name ?? "",
      handle: comment?.handle ?? user?.handle ?? "",
      bio: user?.bio ?? null,
      primaryPublication: primaryPub
        ? { id: primaryPub.id, name: primaryPub.name, subdomain: primaryPub.subdomain }
        : null
    },
    body: comment?.body ?? "",
    body_json: comment?.body_json ?? null,
    attachments: comment?.attachments ?? [],
    replies: raw?.replies ?? [],
    rawData: raw
  };
}

/**
 * Build the standard export document.
 * options: { limit, includePosts, includeNotes, includeReplies, includeFullBodies, dedupe, source }
 */
export function buildExport({ profile, source, posts = [], notes = [], options = {} }) {
  const normalizedPosts = posts.map(normalizePost);
  const normalizedNotes = notes.map(normalizeNote);
  return {
    schema: SCHEMA_VERSION,
    meta: {
      exportedAt: new Date().toISOString(),
      generator: { name: "substack-kit", version: "1.0.0" },
      profile,
      source,
      options: {
        limit: options.limit ?? 0,
        includePosts: options.includePosts ?? true,
        includeNotes: options.includeNotes ?? true,
        includeReplies: options.includeReplies ?? true,
        includeFullBodies: options.includeFullBodies ?? true,
        dedupe: options.dedupe ?? false
      },
      counts: {
        posts: normalizedPosts.length,
        notes: normalizedNotes.length,
        replies: normalizedNotes.reduce((s, n) => s + (n.replies?.length || 0), 0)
      }
    },
    posts: normalizedPosts,
    notes: normalizedNotes
  };
}

export function exportFilename(handle, date = new Date()) {
  return `substack-export-${handle}-${nowStamp(date)}.json`;
}
