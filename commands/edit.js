import path from "node:path";
import fs from "node:fs";
import { getArg, hasFlag, normalizeDir } from "../lib/args.js";
import { createClient, tokenFromEnv } from "../lib/client.js";
import { resolveProfile } from "../lib/profile.js";
import {
  fetchDraft,
  fetchDraftBylines,
  resolveDraftId,
  updateDraftAndPublish,
  plainTextToTiptapString,
  validateDraftBodyString,
} from "../lib/edit.js";

export const description =
  "Edit a published post (or draft) via PUT /drafts/{id} + publish. Safe preview with --dry-run. Use --env to pick MAIN vs TEST account.";

export const usage =
  "substack edit <handle> <slug|id> [--title \"New title\"] [--subtitle \"New subtitle\"] " +
  "[--body \"plain text\"] [--body-file path] [--body-json '{\"type\":\"doc\",...}'] [--body-json-file path] " +
  "[--audience everyone|only_paid] [--env .env] [--dry-run] [--no-publish] [--send] [--force]";

export async function run(positional) {
  const handle = positional[0] || getArg("handle");
  const slugOrId = positional[1] || getArg("slug") || getArg("id");
  if (!handle || !slugOrId) {
    console.error(`Usage: ${usage}`);
    console.error("  handle: publication handle (e.g. danielloureno)");
    console.error("  slug|id: post slug (api-test-updated-title) or numeric post id (201869128)");
    process.exit(1);
  }

  const title = getArg("title");
  const subtitle = getArg("subtitle");
  const body = getArg("body");
  const bodyFile = getArg("body-file");
  const bodyJson = getArg("body-json");
  const bodyJsonFile = getArg("body-json-file");
  const audience = getArg("audience");
  const type = getArg("type");
  const envFile = normalizeDir(getArg("env", path.resolve(".env")));
  const dryRun = hasFlag("dry-run") || hasFlag("dryRun");
  const noPublish = hasFlag("no-publish") || hasFlag("noPublish");
  const publish = !noPublish;
  const send = hasFlag("send");
  const force = hasFlag("force");

  const hasUpdate =
    title !== null ||
    subtitle !== null ||
    body !== null ||
    bodyFile !== null ||
    bodyJson !== null ||
    bodyJsonFile !== null ||
    audience !== null ||
    type !== null;
  if (!hasUpdate) {
    console.error("No updates provided. Use at least one of --title, --subtitle, --body, --body-file, --body-json, --body-json-file, --audience");
    console.error(`Usage: ${usage}`);
    process.exit(1);
  }

  if (send && !force && !dryRun) {
    console.error("Refusing: --send emails ALL subscribers immediately (IRREVERSIBLE). Add --force to confirm you want send:true.");
    process.exit(1);
  }
  if (send && dryRun && !force) {
    console.log("Note: --send with --dry-run would email subscribers if executed live. Add --force to actually send, or remove --send to preview silent publish.");
    // allow dry-run preview without force, but warn
  } else if (!dryRun && !force) {
    console.error("Refusing: live edit requires --force (or use --dry-run to preview). This edits the LIVE post immediately (publish send:false).");
    console.error("Add --force to confirm, or --dry-run to preview without writing.");
    process.exit(1);
  } else if (send && !dryRun) {
    console.log("⚠  WARNING: --send will EMAIL ALL SUBSCRIBERS immediately and is IRREVERSIBLE. Continuing due to --force.");
  }

  // collect bodyText / bodyJsonString
  let bodyText;
  let bodyJsonString;
  if (bodyJsonFile !== null) {
    const p = normalizeDir(bodyJsonFile);
    if (!fs.existsSync(p)) {
      console.error(`--body-json-file not found: ${p}`);
      process.exit(1);
    }
    bodyJsonString = fs.readFileSync(p, "utf8").trim();
    validateDraftBodyString(bodyJsonString);
  } else if (bodyJson !== null) {
    bodyJsonString = bodyJson.trim();
    validateDraftBodyString(bodyJsonString);
  } else if (bodyFile !== null) {
    const p = normalizeDir(bodyFile);
    if (!fs.existsSync(p)) {
      console.error(`--body-file not found: ${p}`);
      process.exit(1);
    }
    bodyText = fs.readFileSync(p, "utf8");
  } else if (body !== null) {
    bodyText = body;
  }

  const token = tokenFromEnv({ envFile });
  if (!token) {
    console.error(`SUBSTACK_SID missing (env: ${envFile}). Set it or pass --env pointing to .substack.test.env / .substack.main.env`);
    process.exit(1);
  }

  // platform client for profile resolution + self lookup
  const platformClient = createClient({ token });

  console.log(`Resolving handle "${handle}"...`);
  const { profile, source } = await resolveProfile(platformClient, handle);
  console.log(`Target: ${profile.name} (@${profile.handle}) source=${source.type} ${source.subdomain || ""}`);

  const subdomain = source.subdomain || handle;
  const pubClient = createClient({ token, publicationUrl: `https://${subdomain}.substack.com` });
  const publicationClient = pubClient.publicationClient;

  // whoami for safety banner
  let self = null;
  try {
    self = await platformClient.substackClient.get("/user/profile/self");
    console.log(`Auth as: ${self.name} (@${self.handle}) id=${self.id}`);
    if (self.handle === profile.handle) {
      console.log(`⚠  You are editing your OWN publication "${handle}" as @${self.handle}. ${dryRun ? "(dry-run, safe)" : "LIVE edit"}`);
    } else {
      console.log(`Auth handle @${self.handle} differs from target "${handle}" — ensure you have editor permission.`);
    }
  } catch (e) {
    console.log(`warn: could not fetch /user/profile/self: ${e.message}`);
  }

  console.log(`Resolving draft "${slugOrId}"...`);
  const draftId = await resolveDraftId({ publicationClient, slugOrId });
  console.log(`Draft id: ${draftId}`);

  console.log(`Fetching draft ${draftId}...`);
  const existing = await fetchDraft({ publicationClient, draftId });
  console.log(`Existing: is_published=${existing.is_published} slug="${existing.slug}" title="${existing.draft_title || existing.title}" audience=${existing.audience}`);

  const bylines = await fetchDraftBylines({ client: platformClient, publicationId: existing.publication_id });
  console.log(`Bylines: ${JSON.stringify(bylines)}`);

  const updates = {};
  if (title !== null) updates.title = title;
  if (subtitle !== null) updates.subtitle = subtitle;
  if (bodyJsonString !== undefined) updates.bodyJsonString = bodyJsonString;
  else if (bodyText !== undefined) updates.bodyText = bodyText;
  if (audience !== null) updates.audience = audience;
  if (type !== null) updates.type = type;

  // preview
  console.log("\n--- preview ---");
  if (updates.title !== undefined) console.log(`title: "${existing.draft_title}" -> "${updates.title}"`);
  if (updates.subtitle !== undefined) console.log(`subtitle: "${existing.draft_subtitle}" -> "${updates.subtitle}"`);
  if (updates.audience !== undefined) console.log(`audience: ${existing.audience} -> ${updates.audience}`);
  if (updates.bodyJsonString !== undefined) {
    console.log(`body: JSON doc (${updates.bodyJsonString.slice(0,120)}...)`);
  } else if (updates.bodyText !== undefined) {
    const previewBody = plainTextToTiptapString(updates.bodyText);
    console.log(`body: plainText -> tiptap (${previewBody.slice(0,200)}...)`);
    console.log(`plain source:\n${updates.bodyText.slice(0,500)}`);
  }
  console.log(`publish: ${publish} (send=${send})`);
  console.log("--- end preview ---\n");

  if (dryRun) {
    console.log("dry-run: no write performed. Add --force to execute (remove --dry-run).");
    return { dryRun: true, draftId, existing, updates, wouldPublish: publish, wouldSend: send };
  }

  console.log(`PUT /drafts/${draftId} ...`);
  const { putResp, publishResp } = await updateDraftAndPublish({
    publicationClient,
    draftId,
    existing,
    updates,
    bylines,
    publish,
    send,
  });

  console.log(`PUT ok: draft_title="${putResp.draft_title}" draft_updated_at=${putResp.draft_updated_at} is_published=${putResp.is_published}`);
  if (publish) {
    console.log(`POST /drafts/${draftId}/publish {send:${send}} ...`);
    console.log(`Publish ok: live title="${publishResp.title}" live updated_at=${publishResp.updated_at || publishResp.post_date} slug=${publishResp.slug}`);
    console.log(`Live URL: https://${subdomain}.substack.com/p/${publishResp.slug}`);
  } else {
    console.log("Skipped publish (--no-publish): draft updated but LIVE post unchanged. Publish later via same command without --no-publish.");
  }

  return { draftId, putResp, publishResp };
}
