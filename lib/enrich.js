/**
 * Deduplication of non-PT posts that are translations/duplicates of PT posts.
 * Ported from Essayer/scripts/download_posts.js. Opt-in via --dedupe.
 */
export function dedupePosts(posts, { keepLanguage = "pt" } = {}) {
  function normTitle(s) {
    return (s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 4);
  }

  function shareWord(a, b) {
    const wa = normTitle(a.title);
    const wb = normTitle(b.title);
    for (const x of wa) {
      for (const y of wb) {
        if (x === y) return true;
        const maxLen = Math.min(x.length, y.length);
        let k = 0;
        while (k < maxLen && x[k] === y[k]) k++;
        if (k >= Math.max(3, Math.floor(maxLen * 0.7))) return true;
      }
    }
    return false;
  }

  const discarded = [];
  for (let i = 0; i < posts.length; i++) {
    const a = posts[i];
    if (discarded.includes(a.id)) continue;
    if (a.language === keepLanguage) continue;
    const dA = new Date(a.publishedAt || a.post_date || 0).getTime();
    for (let j = 0; j < posts.length; j++) {
      if (i === j || discarded.includes(posts[j].id)) continue;
      const b = posts[j];
      if (b.language !== keepLanguage) continue;
      const w1 = a.wordcount || 0;
      const w2 = b.wordcount || 0;
      if (!w1 || !w2) continue;
      const ratio = w1 / w2;
      const dB = new Date(b.publishedAt || b.post_date || 0).getTime();
      const days = Math.abs(dA - dB) / 86400000;
      if (ratio >= 0.8 && ratio <= 1.25 && days <= 5 && shareWord(a, b)) {
        console.log(`  dedup: descartando "${a.slug}" (${a.language}) em favor de "${b.slug}" (${keepLanguage})`);
        discarded.push(a.id);
        break;
      }
    }
  }

  if (!discarded.length) return posts;
  const kept = posts.filter((p) => !discarded.includes(p.id));
  console.log(`  ${discarded.length} versões não-${keepLanguage} descartadas; restam ${kept.length} posts.`);
  return kept;
}
