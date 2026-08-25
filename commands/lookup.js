import { getArg, normalizeDir } from "../lib/args.js";
import { clientFromEnv } from "../lib/client.js";
import { sleep } from "../lib/args.js";

export const description = "Localiza slugs específicos dentro do histórico de posts de um perfil.";

export const usage = "substack lookup <handle> <slug1> <slug2> ... [--env .env]";

export async function run(positional) {
  const handle = positional[0] || getArg("handle");
  const slugs = positional.slice(1).filter(Boolean);
  if (!handle || !slugs.length) {
    console.error(`Uso: ${usage}`);
    process.exit(1);
  }

  const envFile = getArg("env", normalizeDir(".env"));
  const client = clientFromEnv({ envFile });
  const profile = await client.profileForSlug(handle).catch((err) => {
    console.error(`Falha ao resolver o handle "${handle}": ${err.message}`);
    process.exit(1);
  });
  console.log(`perfil: ${profile.name} id=${profile.id}`);

  const wanted = new Set(slugs);
  const found = [];
  let cursor = null;
  let total = 0;
  while (true) {
    let url = `/profile/posts?profile_user_id=${profile.id}&limit=50`;
    if (cursor) url += `&cursor=${encodeURIComponent(cursor)}`;
    const resp = await client.substackClient.get(url);
    const rawPosts = resp.posts || [];
    if (!rawPosts.length) break;
    total += rawPosts.length;
    for (const raw of rawPosts) {
      const slug = raw.slug ?? "";
      if (slug && wanted.has(slug)) {
        found.push(raw);
        console.log(
          `achou: ${slug} id=${raw.id} lang=${raw.language} title=${raw.title} date=${raw.post_date}`
        );
      }
    }
    cursor = resp.nextCursor || null;
    if (!cursor) break;
    await sleep(800);
  }
  console.log(`percorridos ${total} posts, encontrados ${found.length}/${slugs.length}`);
  return { total, found: found.length };
}
