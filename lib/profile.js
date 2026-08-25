import { fetchJson } from "./client.js";
import { sleep } from "./args.js";

/**
 * Resolve a handle/slug to a profile and describe its source.
 *
 * `source.type` is `publication` when the profile has a primary publication
 * with a subdomain (posts are best fetched from its public /api/v1/archive),
 * otherwise `profile` (posts fetched via /profile/posts).
 */
export async function resolveProfile(client, handle) {
  const profile = await client.profileForSlug(handle).catch((err) => {
    throw new Error(`Failed to resolve handle "${handle}": ${err.message}`);
  });

  const pub = profile.rawData?.primaryPublication || null;
  const source = {
    type: null,
    slug: handle,
    subdomain: null,
    publication: null,
    method: null
  };

  if (pub?.subdomain && pub?.name) {
    source.type = "publication";
    source.subdomain = pub.subdomain;
    source.publication = { name: pub.name, url: `https://${pub.subdomain}.substack.com` };
    source.method = "archive";
  } else {
    source.type = "profile";
    source.method = "profile/posts";
  }

  return {
    profile: {
      id: profile.id,
      name: profile.name,
      handle: profile.handle,
      url: profile.url
    },
    rawProfile: profile,
    source
  };
}

/**
 * Fetch the publication's public archive (no auth) via offset pagination.
 * Endpoint: GET https://{subdomain}.substack.com/api/v1/archive?sort=new&limit=25&search=&offset=N
 */
export async function fetchArchivePosts({ subdomain, limit = 0, pageSize = 25 }) {
  const base = `https://${subdomain}.substack.com/api/v1/archive?sort=new&limit=${pageSize}&search=`;
  let offset = 0;
  const seen = new Set();
  const posts = [];
  while (limit <= 0 || posts.length < limit) {
    const url = `${base}&offset=${offset}`;
    const resp = await fetchJson(url, { label: "(archive) " });
    if (!Array.isArray(resp) || !resp.length) break;
    let added = 0;
    for (const raw of resp) {
      if (seen.has(raw.id)) continue;
      seen.add(raw.id);
      posts.push(raw);
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
