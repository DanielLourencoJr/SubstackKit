import { fetchJson, fetchText, retryFetch } from "./client.js";
import { sleep } from "./args.js";

/**
 * Normalize a raw post object to the standard shape consumed by the schema.
 * Accepts either archive/preview posts or /posts/by-id full posts.
 */
export function normalizeRawPost(raw, sourceType) {
  return {
    ...raw,
    source: sourceType || raw.source || null,
    url: raw.canonical_url || raw.url || "",
    likesCount: raw.reaction_count ?? raw.likesCount ?? 0,
    commentsCount: raw.comment_count ?? raw.commentsCount ?? 0,
    description: raw.description || raw.subtitle || "",
    publishedAt: raw.post_date || raw.published_at || raw.date || "",
    body: raw.truncated_body_text || raw.description || ""
  };
}

/**
 * Fetch publication sections (requires auth when hide_posts_from_pub_listings=true).
 * Returns array of {id, slug, name} or [] if unavailable.
 */
export async function fetchSections({ subdomain, token }) {
  const sid = token || process.env.SUBSTACK_SID || "";
  const url = `https://${subdomain}.substack.com/api/v1/publication/sections`;
  try {
    const headers = { "User-Agent": "Mozilla/5.0" };
    if (sid) headers["Cookie"] = `substack.sid=${sid}`;
    const resp = await fetch(url, { headers });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    if (!Array.isArray(data)) return [];
    return data;
  } catch (e) {
    // Sections are optional; fail silently and return only main archive
    console.log(`  sections unavailable: ${e.message}`);
    return [];
  }
}

/**
 * Strategy "publication": all posts of a publication via its public archive.
 * Supports optional sectionId to fetch a single section's archive.
 */
export async function fetchArchivePosts({ subdomain, limit = 0, pageSize = 25, sectionId = null }) {
  const sectionParam = sectionId ? `&section_id=${encodeURIComponent(sectionId)}` : "";
  const base = `https://${subdomain}.substack.com/api/v1/archive?sort=new&limit=${pageSize}&search=${sectionParam}`;
  let offset = 0;
  const seen = new Set();
  const posts = [];
  while (limit <= 0 || posts.length < limit) {
    const url = `${base}&offset=${offset}`;
    const label = sectionId ? `(archive s:${sectionId}) ` : "(archive) ";
    const resp = await fetchJson(url, { label });
    if (!Array.isArray(resp) || !resp.length) break;
    let added = 0;
    for (const raw of resp) {
      if (seen.has(raw.id)) continue;
      seen.add(raw.id);
      posts.push(normalizeRawPost(raw, "publication"));
      added++;
      if (limit > 0 && posts.length >= limit) break;
    }
    if (!added) break;
    offset += resp.length;
    if (limit > 0 && posts.length >= limit) break;
    await sleep(800);
  }
  return posts;
}

/**
 * Strategy "profile": posts by a user across publications via /profile/posts.
 * Cursor-based pagination (offset is rejected with 400 by the API).
 */
export async function fetchProfilePosts({ client, profileId, limit = 0, pageSize = 25 }) {
  let cursor = null;
  const seen = new Set();
  const posts = [];
  while (limit <= 0 || posts.length < limit) {
    let url = `/profile/posts?profile_user_id=${profileId}&limit=${pageSize}`;
    if (cursor) url += `&cursor=${encodeURIComponent(cursor)}`;
    const resp = await retryFetch(() => client.substackClient.get(url), undefined, "(profile) ");
    const rawPosts = resp.posts || [];
    if (!rawPosts.length) break;
    let added = 0;
    for (const raw of rawPosts) {
      if (seen.has(raw.id)) continue;
      seen.add(raw.id);
      posts.push(normalizeRawPost(raw, "profile"));
      added++;
      if (limit > 0 && posts.length >= limit) break;
    }
    if (!added) break;
    cursor = resp.nextCursor || null;
    if (!cursor) break;
    await sleep(800);
  }
  return posts;
}

/**
 * Fetch all posts for a handle using the auto-selected strategy.
 * source: resolved from resolveProfile().
 * For publications, also fetches each section's archive (handles hide_posts_from_pub_listings=true).
 */
export async function fetchPosts({ client, profile, source, limit = 0 }) {
  if (source.type === "publication") {
    // Main archive (excludes hidden-section posts)
    const mainPosts = await fetchArchivePosts({ subdomain: source.subdomain, limit });

    // Discover sections (needs SID for hidden sections)
    const token = process.env.SUBSTACK_SID || "";
    const sections = await fetchSections({ subdomain: source.subdomain, token });

    if (!sections.length) return mainPosts;

    console.log(`  found ${sections.length} section(s): ${sections.map((s) => s.slug).join(", ")}`);

    // Fetch each section's posts and merge (dedup by id)
    const seen = new Set(mainPosts.map((p) => p.id));
    const allPosts = [...mainPosts];
    for (const sec of sections) {
      // Respect limit: if we already have enough, stop
      if (limit > 0 && allPosts.length >= limit) break;
      const remaining = limit > 0 ? limit - allPosts.length : 0;
      const secPosts = await fetchArchivePosts({
        subdomain: source.subdomain,
        limit: remaining,
        sectionId: sec.id
      });
      console.log(`  section ${sec.slug}: ${secPosts.length} posts`);
      for (const p of secPosts) {
        if (seen.has(p.id)) continue;
        seen.add(p.id);
        allPosts.push(p);
        if (limit > 0 && allPosts.length >= limit) break;
      }
    }
    // Keep newest first
    allPosts.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
    return limit > 0 ? allPosts.slice(0, limit) : allPosts;
  }
  return fetchProfilePosts({ client, profileId: profile.id, limit });
}

/**
 * Enrich each post with its full body via GET /posts/by-id/{id}.
 */
export async function enrichPostBodies({ client, posts, delayMs = 600 }) {
  for (let i = 0; i < posts.length; i++) {
    const p = posts[i];
    try {
      const resp = await retryFetch(
        () => client.substackClient.get(`/posts/by-id/${p.id}`),
        undefined,
        "(by-id) "
      );
      if (resp?.post?.body_html) p.body_html = resp.post.body_html;
      if (resp?.post?.canonical_url) p.url = resp.post.canonical_url;
      if (resp?.post?.title) p.title = resp.post.title;
      if (resp?.post?.subtitle) p.subtitle = resp.post.subtitle;
    } catch (e) {
      console.log(`  warn post ${p.id}: ${e.message}`);
    }
    await sleep(delayMs);
  }
  return posts;
}

/**
 * Incremental strategy: parse the publication RSS feed (/feed) for slugs,
 * then fetch each missing post's full body via the window._preloads JSON
 * embedded in the post HTML page.
 */
export async function fetchRssPreloads({ handle, subdomain = null, knownSlugs = new Set(), limit = 0 }) {
  // subdomain may differ from handle (e.g. anajoquebede1 -> joquebedeana);
  // using handle alone silently reads the wrong feed (302/empty -> "no new posts")
  const sub = subdomain || handle;
  const feed = await fetchText(`https://${sub}.substack.com/feed`, "feed");
  const items = [];
  const re = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = re.exec(feed))) {
    const b = m[1];
    const link = (b.match(/<link>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/) ?? [])[1] ?? "";
    const pub = (b.match(/<pubDate>([^<]+)<\/pubDate>/) ?? [])[1] ?? "";
    const slug = (link.match(/\/p\/([^/?#]+)/) ?? [])[1] ?? "";
    if (slug && !knownSlugs.has(slug)) items.push({ slug, publishedAt: pub.trim(), link: link.trim() });
  }
  if (limit > 0) items.length = Math.min(items.length, limit);

  const posts = [];
  for (let i = 0; i < items.length; i++) {
    const { slug } = items[i];
    try {
      const raw = await fetchPreloadsPost(sub, slug);
      posts.push(normalizeRawPost(raw, "rss+preloads"));
      console.log(`  ok ${slug} (${posts[posts.length - 1].title})`);
    } catch (e) {
      console.log(`  ERROR ${slug}: ${e.message}`);
    }
    await sleep(2000);
  }
  return posts;
}

async function fetchPreloadsPost(sub, slug) {
  const url = `https://${sub}.substack.com/p/${slug}`;
  const html = await fetchText(url, slug);
  const mm = html.match(/window\._preloads\s*=\s*JSON\.parse\(\"([\s\S]*?)\"\)\s*<\/script>/);
  if (!mm) throw new Error(`${slug}: _preloads not found`);
  let jsonStr = mm[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  const data = JSON.parse(jsonStr);
  const post = data.post ?? data;
  if (!post) throw new Error(`${slug}: no post in preloads`);
  return post;
}
