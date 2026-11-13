// Portable credential resolution shared by the read side (client.js) and the
// write side (auth.js). Replaces the old hardcoded /mnt/HD/Junior/Projects
// fallbacks so the tool works on any machine.
//
// Resolution order (first hit wins):
//   1. explicit token (--sid)
//   2. explicit envFile (--env) — loaded first
//   3. files already in process.env (shell export wins over files)
//   4. $SUBSTACK_CREDENTIALS_FILE           (written by install.sh)
//   5. ~/.config/substack/credentials.env   (symlink created by install.sh)
//   6. <projectsRoot>/.substack-credentials.env  (central store; suffixed
//      vars — SUBSTACK_SID_TEST is preferred, MAIN is never auto-picked)
//   7. <projectsRoot>/.substack.test.env
//   8. <repoRoot>/.env and cwd .env          (last resort)
//
// Safety: a shared/central file that only carries SUBSTACK_SID_TEST /
// SUBSTACK_SID_MAIN suffixes resolves to TEST — writes must never silently
// fall back to MAIN. Pass --env or export SUBSTACK_SID to override.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { loadDotEnv } from "./args.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PROJECTS_ROOT = path.dirname(REPO_ROOT);

/** Ordered list of credential files to try (existing or not). */
export function credentialCandidates() {
  const out = [];
  const add = (p) => {
    if (p && !out.includes(p)) out.push(p);
  };
  add(process.env.SUBSTACK_CREDENTIALS_FILE);
  add(path.join(os.homedir(), ".config", "substack", "credentials.env"));
  add(path.join(PROJECTS_ROOT, ".substack-credentials.env"));
  add(path.join(PROJECTS_ROOT, ".substack.test.env"));
  add(path.join(REPO_ROOT, ".env"));
  add(path.resolve(".env"));
  return out;
}

/**
 * Resolve the Substack session cookie. Returns "" when nothing is found
 * (callers decide whether to throw). Side effect: sets process.env.SUBSTACK_SID
 * so later calls in the same process reuse it.
 */
export function resolveSid({ envFile, token } = {}) {
  if (token) return token;
  const files = [];
  if (envFile) files.push(envFile);
  files.push(...credentialCandidates());

  for (const p of files) {
    if (!p || !fs.existsSync(p)) continue;
    loadDotEnv(p); // sets undefined env vars only — shell exports win
    if (!process.env.SUBSTACK_SID && process.env.SUBSTACK_SID_TEST) {
      // Central/suffixed file: default to the TEST account (never MAIN).
      process.env.SUBSTACK_SID = process.env.SUBSTACK_SID_TEST;
    }
    if (process.env.SUBSTACK_SID) return process.env.SUBSTACK_SID;
  }
  return process.env.SUBSTACK_SID || process.env.SUBSTACK_SID_TEST || "";
}
