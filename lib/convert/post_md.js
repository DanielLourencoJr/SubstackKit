import { escapeMd, yamlQuote, normalizeNewlines } from "../args.js";
import { htmlToMarkdown } from "./html_to_md.js";

export function formatGmtMinus3(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const ms = d.getTime() - 3 * 60 * 60 * 1000;
  const local = new Date(ms);
  const pad = (n, len = 2) => String(n).padStart(len, "0");
  return `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(
    local.getUTCDate()
  )} ${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}:${pad(
    local.getUTCSeconds()
  )} GMT-3`;
}

export function extractPostMeta(post) {
  return {
    id: post?.id,
    slug: post?.slug || "",
    title: post?.title || "",
    subtitle: post?.subtitle || post?.description || "",
    publishedAt: post?.publishedAt || post?.post_date || post?.date || "",
    url: post?.url || post?.canonical_url || "",
    likes: post?.likesCount ?? post?.reaction_count ?? 0,
    comments: post?.commentsCount ?? post?.comment_count ?? 0,
    reactions: post?.reactions || null,
    restacks: post?.restacks ?? null,
    tags: post?.tags ?? post?.postTags ?? [],
    coverImage: post?.coverImage ?? post?.cover_image ?? "",
    wordcount: post?.wordcount ?? null,
    language: post?.language || null
  };
}

export function formatPost(post) {
  const meta = extractPostMeta(post);

  const dateStr = formatGmtMinus3(meta.publishedAt);
  const stats = [];
  if (meta.likes) stats.push(`**Likes:** ${meta.likes}`);
  if (meta.restacks !== null) stats.push(`**Restacks:** ${meta.restacks}`);
  if (meta.comments) stats.push(`**Comments:** ${meta.comments}`);

  const metaLines = [];
  if (dateStr) metaLines.push(`**Published:** ${dateStr}`);
  if (meta.url) metaLines.push(`**URL:** ${meta.url}`);
  if (meta.tags?.length) {
    const tagList = meta.tags
      .map((t) => escapeMd(typeof t === "string" ? t : t?.name || ""))
      .join(", ");
    if (tagList) metaLines.push(`**Tags:** ${tagList}`);
  }
  if (meta.language) metaLines.push(`*Language: ${escapeMd(meta.language)}*`);
  if (meta.wordcount) metaLines.push(`*Words: ${meta.wordcount}*`);

  const front = [
    "---",
    `title: ${yamlQuote(meta.title)}`,
    `slug: ${yamlQuote(meta.slug)}`,
    meta.url ? `url: ${yamlQuote(meta.url)}` : "",
    meta.publishedAt ? `date: ${yamlQuote(meta.publishedAt)}` : "",
    `likes: ${meta.likes}`,
    `comments: ${meta.comments}`,
    meta.tags?.length
      ? `tags: ${meta.tags
          .map((t) => yamlQuote(typeof t === "string" ? t : t?.name || ""))
          .join(", ")}`
      : "",
    meta.language ? `language: ${yamlQuote(meta.language)}` : "",
    "---"
  ].filter(Boolean);

  const parts = [];
  parts.push(front.join("\n"));
  parts.push("");
  parts.push(`# ${escapeMd(meta.title) || escapeMd(String(meta.id))}`);

  if (meta.subtitle) {
    parts.push("");
    parts.push(`> ${escapeMd(meta.subtitle)}`);
  }

  const metaBlock = [...metaLines, ...stats].join("  \n");
  if (metaBlock.trim()) parts.push(metaBlock.trim());

  if (meta.coverImage) {
    parts.push("");
    parts.push(`![Cover](${meta.coverImage})`);
  }

  const body = post?.body_html
    ? htmlToMarkdown(post.body_html)
    : (post?.body || post?.description || "").trim();
  const bodyTrimmed = body.trim();
  if (bodyTrimmed) {
    parts.push("");
    parts.push(bodyTrimmed);
  }

  return replaceLineBlanks(parts.join("\n")).trim() + "\n";
}

export function replaceLineBlanks(text) {
  return normalizeNewlines(text)
    .split("\n")
    .filter((l, i, arr) => !(l.trim() === "" && arr[i - 1]?.trim() === ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

export function postFilename(post) {
  const meta = extractPostMeta(post);
  return (meta.slug || `post-${meta.id}`).replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_") + ".md";
}
