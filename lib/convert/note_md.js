import { escapeMdNotes, normalizeNewlines } from "../args.js";
import { formatGmtMinus3 } from "./post_md.js";
import {
  noteBodyToMd,
  pmToMd,
  formatRestack,
  formatPostRestack,
  formatImageRestack,
  formatVideoRestack,
  formatLinkRestack,
  formatPublicationRestack,
  renderReplyAttachment
} from "./pm_to_md.js";

export function formatIsoMinus3(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const ms = d.getTime() - 3 * 60 * 60 * 1000;
  const local = new Date(ms);
  const pad = (n, len = 2) => String(n).padStart(len, "0");
  const msPart = String(local.getUTCMilliseconds()).padStart(3, "0");
  return `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(
    local.getUTCDate()
  )}T${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}:${pad(
    local.getUTCSeconds()
  )}.${msPart}-03:00`;
}

export function extractNoteMeta(note) {
  const r = note?.rawData?.comment ?? note ?? {};
  const user = note?.rawData?.context?.users?.[0] ?? {};
  return {
    id: note?.id ?? r?.id ?? "",
    publishedAt: note?.publishedAt ?? r?.date ?? "",
    likes: note?.likes ?? r?.reaction_count ?? 0,
    reactions: note?.reactions ?? r?.reactions ?? null,
    restacks: note?.restacks ?? r?.restacks ?? null,
    replies: note?.repliesCount ?? r?.children_count ?? null,
    url: note?.url ?? r?.url ?? null,
    editedAt: note?.editedAt ?? r?.edited_at ?? null,
    language: note?.language ?? r?.language ?? null,
    ancestorPath: note?.ancestorPath ?? r?.ancestor_path ?? null,
    authorName: note?.author?.name ?? r?.name ?? user?.name ?? "",
    authorHandle: note?.author?.handle ?? r?.handle ?? user?.handle ?? "",
    authorBio: note?.author?.bio ?? user?.bio ?? null,
    authorPublication: note?.author?.primaryPublication?.name ?? user?.primary_publication?.name ?? null,
    attachments: note?.attachments ?? r?.attachments ?? [],
    repliesData: note?.replies ?? note?.rawData?.replies ?? r?.replies ?? []
  };
}

function formatEntry(meta, body, opts = {}) {
  const { includeMeta = "basic", includeRestacks = false } = opts;
  const lines = [];

  const gmt3 = formatGmtMinus3(meta.publishedAt);

  const title = meta.publishedAt
    ? `## ${gmt3} — ${meta.likes} likes`
    : `## (no date) — ${meta.likes} likes`;
  lines.push(title);

  const stats = [`Likes: ${meta.likes}`];
  if (meta.restacks !== null) stats.push(`Restacks: ${meta.restacks}`);
  if (meta.replies !== null) stats.push(`Replies: ${meta.replies}`);
  lines.push(stats.join(" | "));

  if (meta.url) lines.push(`URL: ${meta.url}`);

  if (includeMeta === "full") {
    if (meta.authorName) {
      lines.push(
        `**Author:** ${meta.authorName}${meta.authorHandle ? ` (@${meta.authorHandle})` : ""}`
      );
    }
    if (meta.reactions && Object.keys(meta.reactions).length) {
      lines.push(
        `**Reactions:** ${Object.entries(meta.reactions)
          .map(([k, v]) => `${k}: ${v}`)
          .join(", ")}`
      );
    }
    if (meta.editedAt) lines.push(`*Edited: ${formatGmtMinus3(meta.editedAt)}*`);
    if (meta.language) lines.push(`*Language: ${meta.language}*`);
    if (meta.ancestorPath) lines.push(`*Thread ancestor: ${meta.ancestorPath}*`);
    if (meta.authorBio) lines.push(`*Bio: ${meta.authorBio}*`);
    if (meta.authorPublication) lines.push(`*Publication: ${meta.authorPublication}*`);
  }

  lines.push("");
  lines.push(body || "_(no content)_");

  if (includeRestacks && meta.attachments?.length) {
    for (const att of meta.attachments) {
      if (att.type === "comment") {
        lines.push("");
        lines.push(formatRestack(att));
      } else if (att.type === "post") {
        lines.push("");
        lines.push(formatPostRestack(att));
      } else if (att.type === "image") {
        lines.push("");
        lines.push(formatImageRestack(att));
      } else if (att.type === "video") {
        lines.push("");
        lines.push(formatVideoRestack(att));
      } else if (att.type === "link") {
        lines.push("");
        lines.push(formatLinkRestack(att));
      } else if (att.type === "publication") {
        lines.push("");
        lines.push(formatPublicationRestack(att));
      }
    }
  }

  if (meta.repliesData?.length) {
    lines.push("");
    lines.push("### Replies");
    for (let ri = 0; ri < meta.repliesData.length; ri++) {
      if (ri > 0) lines.push("");
      const reply = meta.repliesData[ri];
      const depth = reply.depth || 0;
      const prefix = "> ".repeat(depth + 1);
      const dateStr = formatGmtMinus3(reply.date);
      const bodyText =
        reply.body_json && reply.body_json.type === "doc"
          ? normalizeNewlines(pmToMd(reply.body_json)).trim()
          : escapeMdNotes(reply.body || "(no content)");
      const nameSafe = escapeMdNotes(reply.name || "unknown");
      const bodyLines = bodyText.split("\n");
      const replyLines = [];
      for (let i = 0; i < bodyLines.length; i++) {
        const content = i === 0 ? `**${nameSafe}:** ${bodyLines[i]}` : bodyLines[i];
        replyLines.push(bodyLines[i] ? `${prefix}${content}` : prefix);
      }
      if (replyLines.length) replyLines[replyLines.length - 1] += ` — *${dateStr}*`;
      lines.push(...replyLines);
      if (reply.attachments?.length) {
        for (const att of reply.attachments) {
          const attLines = renderReplyAttachment(att, prefix);
          if (attLines) {
            lines.push(`${prefix}`);
            lines.push(attLines);
          }
        }
      }
    }
  }

  return lines.join("\n").trim();
}

export function formatNote(note, opts = {}) {
  const meta = extractNoteMeta(note);
  return formatEntry(meta, noteBodyToMd(note), opts);
}

/**
 * Build the monthly files header block (Scraper standard).
 */
export function notesHeader(data) {
  const profileMeta = data?.meta?.profile || {};
  const source = data?.meta?.source || {};
  const notesSource = data?.meta?.notesSource || {};
  return [
    "# Notes Export",
    "",
    `ExportedAt: ${data?.meta?.exportedAt || ""}`,
    `Profile: ${profileMeta?.name || ""} (@${profileMeta?.handle || ""})`,
    `ProfileID: ${profileMeta?.id || ""}`,
    `Notes source: ${source?.slug || notesSource?.slug || ""}`,
    ""
  ].join("\n");
}

export function monthKeyFor(note) {
  const meta = extractNoteMeta(note);
  const isoLocal = formatIsoMinus3(meta.publishedAt);
  return isoLocal ? isoLocal.slice(0, 7) : "unknown";
}
