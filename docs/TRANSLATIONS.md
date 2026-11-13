# Language Editions (translations)

How Substack multi-language posts work end to end: the data model, the real
API surface, how to push/activate/verify an edition with the CLI, and the
verification recipe that actually works. Derived from reverse-engineering the
web editor bundle plus live experiments on post `224426642`
("Experimentando Omarchy" → "Experimenting with Omarchy").

## The model (read this first — it explains every surprise)

- A post has **one primary language** (`post.language`, also the email/app
  language) plus **N language editions** (`post_translations[]`).
- An edition has no independent publish state. There is **no per-edition
  publish endpoint and no per-edition publish button** in the editor — by
  design. Editions become available to readers when the **post itself is
  (re)published** (the editor's *Continue → publish* flow does exactly this;
  `POST /drafts/{id}/publish` takes no language parameter).
- **The post page HTML always renders the primary language**, regardless of
  `Accept-Language`, `?language=`/`?lang=`/`?hl=` query params, or cookies.
  Readers get their edition through the reader UI: the **Translate** button
  above the title, which calls `GET /posts/{id}/translate`. Matching is by
  device/reader language.
- Readers whose language has **no custom edition** get a machine translation
  instead (when auto-translate is on). A custom edition always wins over the
  machine one for its language.

## Prerequisites

Publication **Settings → Basics** must have both toggles on:

- **Additional post languages**
- **Allow automatic translation**

Observed feature flags in the publication config:
`additional_post_languages_enabled`, `auto_translate_enabled`.
Supported edition languages (18): Arabic, Catalan, Danish, Dutch, English,
English (British), Finnish, French, German, Icelandic, Italian, Japanese,
Norwegian, Polish, Portuguese (Brazilian), Portuguese (European), Spanish,
Swedish, Turkish.

## API surface

Reverse-engineered from the editor bundle (`reactPublish.*.js`), which is the
authoritative client:

| Call | Purpose |
| ---- | ------- |
| `POST {pub}/drafts/{id}/translations/{lang}` body `{sourceLanguage}` | Create an edition (returns the new translation under `body`). The editor force-saves first. |
| `PUT {pub}/drafts/{id}` with `translations: [edition…]` | Save editions (the editor only sends the *dirty* ones — ones edited in that session) |
| `DELETE {pub}/drafts/{id}/translations/{lang}` | Remove an edition |
| `POST {pub}/drafts/{id}/publish` `{send, share_automatically, saved_segment_id}` | Publish/republish the **post** — activates every edition. No language param. |
| `GET {pub}/drafts/{id}` | Read back: top-level `language` + `post_translations[]` (`language`, `from_author`, `draft_title`, `draft_subtitle`, `draft_body`, `post_id`) |

The draft/publish responses do **not** echo `post_translations` — always read
editions back with `drafts get`.

## CLI workflow: push → activate → verify

```bash
# 1. Push the edition (works on published posts; only PUTs the draft,
#    never republishes, original body untouched)
substack drafts translate <id> en ./post.en.md --title "…" --pub <host>.substack.com

# 2. Activate: silent republish. No email goes out; the primary body stays
#    byte-identical as long as you didn't edit it.
substack drafts publish <id> --no-send --yes --pub <host>.substack.com

# 3. Verify (see below)
```

On an **unpublished** draft no activation step exists — the edition simply
travels with the draft and goes live when you publish the draft.

`sync` pushes and pulls editions too (`Published/Translations/<lang>/<slug>.md`,
frontmatter `edition: translation`).

## Verification — use the translate endpoint, never the page

Fetching the post URL proves nothing: the HTML always contains the primary
language, so a "translation missing" conclusion drawn from it is **wrong**.
This cost a long debugging detour once; don't repeat it.

Ground truth (anonymous, no cookies needed):

```bash
curl -s -H 'Accept-Language: en' \
  'https://<pub>.substack.com/api/v1/posts/<id>/translate?bodyFormat=html'
```

Response shapes:

| Requested language | Response |
| ------------------ | -------- |
| Has a **custom edition** | `{"translation":{"en":{"title","subtitle","description","previewText","truncated_body_text","body_html"}}}` |
| The post's **primary** language | `{}` (empty — nothing to translate) |
| Other language, auto-translate on | machine-translated copy of the same shape |

`?language=<code>` works for well-formed codes (`es`, `fr`, `ja`…), but a
primary-language value can behave oddly (`language=pt` returned the English
edition while `Accept-Language: pt` returned `{}`) — **prefer the
`Accept-Language` header**.

Two extra checks worth running:

1. **Custom vs machine translation**: match a distinctive *human* phrase from
   your source file in the response (machine translation will rarely reproduce
   an idiom word-for-word). E.g. `"Any Given Monday"` proved the served text
   was the hand-made edition, not MT.
2. **Primary unchanged**: `drafts get <id> --json | jq -r '.draft_body' |
   sha256sum` before and after must match, and the public page must still
   contain the original's opening sentence.

## Troubleshooting

| Symptom | Cause / fix |
| ------- | ----------- |
| Edition pushed, page still primary language | Expected — page HTML is always primary. Check `/translate`. |
| `/translate` returns only machine translation (or nothing) for your edition's language | Edition not activated yet → `drafts publish <id> --no-send --yes`. |
| `/translate` empty for every language | Settings toggles off (Settings → Basics), or wrong publication (`--pub`). |
| Editor shows no way to "publish" the English version | Correct — editions have no separate publish state. Republish the post. |
| Edition missing after re-push | `PUT` only persists the `translations` array you send; include the edition (the CLI does). |

## Discovering more API surface (recipe that worked)

1. Fetch the editor page HTML with an authed `substack.sid` cookie; extract
   every `substackcdn.com/bundle/static/js/*.js` script URL (~184 bundles).
2. Download them all and grep for the domain keyword (`post_translations`).
3. In the hit bundle, extract surrounding code for `put(`/`post(`/`delete(`
   call sites and for the payload field (`translations:`) to learn the exact
   request shapes.
4. Cross-check against Substack's help center
   (`support.substack.com` → "publish a post in a different language") so the
   reverse-engineered behavior matches the documented reader experience.
