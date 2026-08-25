import { escapeMdNotes, normalizeNewlines } from "../args.js";

// ---------- ProseMirror -> Markdown ----------

function marksToMd(text, marks = []) {
  let out = escapeMdNotes(text);
  for (const mark of marks) {
    if (mark.type === "bold") out = `**${out}**`;
    if (mark.type === "italic") out = `*${out}*`;
    if (mark.type === "strike") out = `~~${out}~~`;
    if (mark.type === "code") out = `\`${out}\``;
    if (mark.type === "link" && mark.attrs?.href) {
      out = `[${out}](${mark.attrs.href})`;
    }
  }
  return out;
}

export function pmToMd(node) {
  if (!node) return "";
  if (node.type === "text") {
    return marksToMd(node.text || "", node.marks || []);
  }
  if (node.type === "hard_break") return "\n";
  if (node.type === "paragraph") {
    const inner = (node.content || []).map(pmToMd).join("");
    return `${inner}\n\n`;
  }
  if (node.type === "bulletList") {
    return (node.content || [])
      .map((li) => {
        const body = (li.content || []).map(pmToMd).join("").trim();
        return `- ${body}\n`;
      })
      .join("");
  }
  if (node.type === "orderedList") {
    let i = 1;
    return (node.content || [])
      .map((li) => {
        const body = (li.content || []).map(pmToMd).join("").trim();
        const line = `${i}. ${body}\n`;
        i += 1;
        return line;
      })
      .join("");
  }
  if (node.type === "substack_mention" && node.attrs?.label) {
    return `@${node.attrs.label}`;
  }
  if (node.type === "image" && node.attrs?.src) {
    const alt = node.attrs?.alt || "";
    return `![${escapeMdNotes(alt)}](${node.attrs.src})\n\n`;
  }
  if (node.type === "blockquote") {
    const inner = (node.content || []).map(pmToMd).join("").trim();
    return inner
      .split("\n")
      .map((l) => (l ? `> ${l}` : ">"))
      .join("\n")
      .concat("\n\n");
  }
  if (node.content) {
    return (node.content || []).map(pmToMd).join("");
  }
  return "";
}

/**
 * Render a note body (either ProseMirror body_json or plain text).
 * Tolerates raw feed items, library Note entities (rawData) and plain comments.
 */
export function noteBodyToMd(source) {
  const comment = source?.rawData?.comment ?? source?.comment ?? source;
  const bodyJson = comment?.body_json ?? source?.body_json ?? null;
  if (bodyJson && bodyJson.type === "doc") {
    return normalizeNewlines(pmToMd(bodyJson)).trim();
  }
  const bodyText = comment?.body ?? source?.body ?? "";
  if (bodyText) return normalizeNewlines(bodyText).trim();
  return "";
}

// ---------- Restack / attachment renderers ----------

export function formatRestackAttachment(att) {
  if (att.type === "image") return formatImageRestack(att);
  if (att.type === "link") return formatLinkRestack(att);
  if (att.type === "video") return formatVideoRestack(att);
  if (att.type === "publication") return formatPublicationRestack(att);
  if (att.type === "post") return formatPostRestack(att);
  if (att.type === "comment") {
    const nested = formatRestack(att);
    return nested.split("\n").map((l) => l || ">").join("\n");
  }
  return "";
}

export function formatRestack(attachment) {
  const c = attachment?.comment || {};
  const u = c?.user || {};
  const name = u?.name || "unknown";
  const handle = u?.handle ? ` (@${u?.handle})` : "";
  const body = noteBodyToMd(c);
  const lines = [`> **Restacked from ${name}${handle}:**`];
  if (body) {
    lines.push(...body.split("\n").map((l) => (l ? `> ${l}` : ">")));
  }
  if (c.attachments?.length) {
    for (const att of c.attachments) {
      const rendered = formatRestackAttachment(att);
      if (rendered) {
        lines.push(">");
        lines.push(rendered);
      }
    }
  }
  return lines.join("\n");
}

export function formatPostRestack(attachment) {
  const post = attachment?.post || {};
  const pub = attachment?.publication || {};
  const selection = attachment?.postSelection;
  const byline = post?.publishedBylines?.[0] || {};
  const name = byline?.name || pub?.author_name || "unknown";
  const handle = byline?.handle || pub?.author_handle || "";
  const handleStr = handle ? ` (@${handle})` : "";
  const url = post?.canonical_url || "";
  const title = post?.title || "Untitled post";
  const subtitle = post?.subtitle || post?.description || "";
  const pubName = pub?.name || "";
  const lines = [`> **Restacked post from ${name}${handleStr}:** ${title}`];
  if (subtitle || pubName) {
    const metaLine = [subtitle, pubName].filter(Boolean).join(" — ");
    lines.push(`> *${metaLine}*`);
  }
  if (selection?.text) {
    lines.push(">");
    lines.push("> > " + selection.text.split("\n").join("\n> > "));
  }
  if (url) lines.push(`> ${url}`);
  return lines.join("\n");
}

export function formatImageRestack(attachment) {
  return `> ![Image](${attachment.imageUrl || ""})`;
}

export function formatVideoRestack(attachment) {
  const mu = attachment?.mediaUpload || {};
  const playbackId = mu?.mux_playback_id || "";
  const dur = mu?.duration ? ` (${Math.round(mu.duration)}s)` : "";
  const url = playbackId ? `https://stream.mux.com/${playbackId}.m3u8` : "";
  return url ? `> Video${dur}: ${url}` : `> Video${dur}`;
}

export function formatLinkRestack(attachment) {
  const meta = attachment?.linkMetadata || {};
  const url = meta?.url || "";
  const title = meta?.title || url || "Link";
  const desc = meta?.description || "";
  const img = meta?.image || "";
  const lines = [`> **Link:** [${escapeMdNotes(title)}](${url})`];
  if (desc) lines.push(`> *${escapeMdNotes(desc)}*`);
  if (img) lines.push(`> ![Preview](${img})`);
  return lines.join("\n");
}

export function formatPublicationRestack(attachment) {
  const pub = attachment?.publication || {};
  const name = pub?.name || "Publication";
  const subdomain = pub?.subdomain || "";
  const url = subdomain ? `https://${subdomain}.substack.com` : "";
  return url
    ? `> **Publication:** [${escapeMdNotes(name)}](${url})`
    : `> **Publication:** ${escapeMdNotes(name)}`;
}

export function renderReplyAttachment(att, prefix) {
  let rendered;
  if (att.type === "image") rendered = formatImageRestack(att);
  else if (att.type === "link") rendered = formatLinkRestack(att);
  else if (att.type === "video") rendered = formatVideoRestack(att);
  else if (att.type === "publication") rendered = formatPublicationRestack(att);
  else if (att.type === "post") rendered = formatPostRestack(att);
  else if (att.type === "comment") rendered = formatRestack(att);
  if (!rendered) return "";
  return rendered.replace(/^> /gm, prefix);
}
