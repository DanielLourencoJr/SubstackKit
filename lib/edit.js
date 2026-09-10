import { retryFetch } from "./client.js";
import { sleep } from "./args.js";

/**
 * Convert plain text to a minimal Tiptap doc and return JSON.stringify'd string
 * as required by Substack `draft_body` (must be stringified, not object).
 * Splits on blank lines (\\n\\n) into paragraphs. Single newlines become hardBreak.
 */
export function plainTextToTiptapString(text) {
  const normalized = String(text ?? "").replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return JSON.stringify({ type: "doc", attrs: { schemaVersion: "v1" }, content: [{ type: "paragraph" }] });
  }
  const paras = normalized.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const content = paras.map((para) => {
    // split para on single newline to insert hardBreak nodes
    const lines = para.split("\n");
    const paraContent = [];
    for (let i = 0; i < lines.length; i++) {
      if (lines[i]) paraContent.push({ type: "text", text: lines[i] });
      if (i < lines.length - 1) paraContent.push({ type: "hardBreak" });
    }
    return { type: "paragraph", content: paraContent.length ? paraContent : [{ type: "text", text: "" }] };
  });
  const doc = { type: "doc", attrs: { schemaVersion: "v1" }, content };
  return JSON.stringify(doc);
}

/**
 * Validate that a Tiptap JSON string parses and has doc shape.
 * Throws if invalid.
 */
export function validateDraftBodyString(s) {
  let parsed;
  try {
    parsed = JSON.parse(s);
  } catch (e) {
    throw new Error(`draft_body is not valid JSON: ${e.message}`);
  }
  if (parsed?.type !== "doc" || !Array.isArray(parsed?.content)) {
    throw new Error(`draft_body must be a Tiptap doc with type:"doc" and content array`);
  }
  return s;
}

/**
 * Resolve draft_bylines required for PUT/POST.
 * Fetch from /user/profile/self and map publicationUsers to byline shape.
 */
export async function fetchDraftBylines({ client, publicationId }) {
  const profile = await retryFetch(() => client.substackClient.get("/user/profile/self"), 8, "(bylines) ");
  const pubUsers = profile.publicationUsers || [];
  let pubUser = null;
  if (publicationId) {
    pubUser = pubUsers.find((pu) => pu.publication?.id === publicationId || pu.publication_id === publicationId);
  }
  if (!pubUser) pubUser = pubUsers.find((pu) => pu.is_primary) || pubUsers[0];
  if (!pubUser) throw new Error("Cannot resolve draft_bylines: no publicationUsers found for account");
  return [{ id: profile.id, publicationUserId: pubUser.id }];
}

/**
 * Fetch a single draft by id (publication-scoped).
 * Returns raw draft object with draft_title, draft_body (string), etc.
 */
export async function fetchDraft({ publicationClient, draftId }) {
  return retryFetch(() => publicationClient.get(`/drafts/${draftId}`), 8, "(get-draft) ");
}

/**
 * Find a draft/post id by slug via paginated GET /drafts.
 * Publication-scoped, searches both drafts and published.
 * Returns id or null if not found.
 */
export async function findDraftIdBySlug({ publicationClient, slug, maxPages = 20 }) {
  let offset = 0;
  const limit = 25;
  for (let page = 0; page < maxPages; page++) {
    const resp = await retryFetch(() => publicationClient.get(`/drafts?offset=${offset}&limit=${limit}`), 8, "(find-draft) ");
    const posts = resp.posts || [];
    if (!posts.length) break;
    for (const p of posts) {
      if (p.slug === slug) return p.id;
    }
    if (!resp.hasMore) break;
    // nextCursor is numeric string offset
    const next = resp.nextCursor ? Number(resp.nextCursor) : offset + posts.length;
    if (!Number.isFinite(next) || next <= offset) break;
    offset = next;
    await sleep(600);
  }
  return null;
}

/**
 * Resolve slugOrId to numeric draft id.
 * If numeric (all digits), return Number. Otherwise treat as slug and search.
 */
export async function resolveDraftId({ publicationClient, slugOrId }) {
  if (/^\d+$/.test(String(slugOrId))) {
    return Number(slugOrId);
  }
  const id = await findDraftIdBySlug({ publicationClient, slug: slugOrId });
  if (!id) throw new Error(`No draft/post found with slug "${slugOrId}" (searched via GET /drafts)`);
  return id;
}

/**
 * Update a draft (PUT) and optionally publish to make live.
 * For published posts, PUT alone updates draft fields only — need publish send:false to sync live.
 *
 * opts:
 *  - publicationClient
 *  - draftId
 *  - updates: { title?, subtitle?, bodyText?, bodyJsonString?, audience?, type? }
 *  - existing: raw draft object (from fetchDraft) to preserve unspecified fields
 *  - bylines
 *  - publish: boolean (default true -> POST /drafts/{id}/publish send:false)
 *  - send: boolean (default false, if true emails subscribers — irreversible, require force)
 */
export async function updateDraftAndPublish({
  publicationClient,
  draftId,
  existing,
  updates = {},
  bylines,
  publish = true,
  send = false,
}) {
  const draftTitle = updates.title !== undefined ? updates.title : existing.draft_title ?? existing.title ?? "";
  const draftSubtitle = updates.subtitle !== undefined ? updates.subtitle : existing.draft_subtitle ?? existing.subtitle ?? "";
  // body handling: prefer explicit bodyJsonString, else bodyText plain -> tiptap, else keep existing
  let draftBody;
  if (updates.bodyJsonString !== undefined) {
    draftBody = validateDraftBodyString(updates.bodyJsonString);
  } else if (updates.bodyText !== undefined) {
    draftBody = plainTextToTiptapString(updates.bodyText);
  } else {
    draftBody = existing.draft_body ?? existing.body ?? plainTextToTiptapString("");
    // ensure it's a string
    if (typeof draftBody !== "string") draftBody = JSON.stringify(draftBody);
  }

  const type = updates.type ?? existing.type ?? "newsletter";
  const audience = updates.audience ?? existing.audience ?? "everyone";

  const payload = {
    draft_title: draftTitle,
    draft_subtitle: draftSubtitle,
    draft_body: draftBody,
    type,
    audience,
    draft_bylines: bylines,
  };

  // Some publishes need section id preserved if present
  if (existing.draft_section_id !== undefined && existing.draft_section_id !== null) {
    payload.draft_section_id = existing.draft_section_id;
  }

  const putResp = await retryFetch(() => publicationClient.put(`/drafts/${draftId}`, payload), 8, "(put-draft) ");

  let publishResp = null;
  if (publish) {
    // publish with send flag (default false = silent update)
    publishResp = await retryFetch(
      () => publicationClient.post(`/drafts/${draftId}/publish`, { send: !!send, share_automatically: false }),
      8,
      "(publish) "
    );
  }

  return { putResp, publishResp, payload };
}
