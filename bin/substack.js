#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pkg = require("../package.json");

const COMMANDS = {
  export: { path: "../commands/export.js" },
  convert: { path: "../commands/convert.js" },
  "fetch-new": { path: "../commands/fetch-new.js" },
  lookup: { path: "../commands/lookup.js" },
  edit: { path: "../commands/edit.js" }
};

// Write side (merged from SubstackCLI): namespaces handled by commands/write.js.
const WRITE_NS = new Set(["drafts", "published", "scheduled", "sync"]);

function printHelp() {
  const lines = [
    `substack v${pkg.version} — download, read and publish Substack content`,
    "",
    "Usage: substack <command> [arguments]",
    "",
    "Read commands:"
  ];
  for (const [name, meta] of Object.entries(COMMANDS)) {
    const mod = require(meta.path);
    lines.push(`  ${name.padEnd(10)} ${mod.description}`);
  }
  lines.push(
    "",
    "Write commands (upload/manage drafts and posts):",
    "  drafts      create|list|get|update|delete|publish|schedule|unschedule|export|translate|counts",
    "  published   list",
    "  scheduled   list",
    "  sync        folder ↔ publication sync (pull/push Markdown)",
    "",
    "Run `substack <command> --help` for each command's flags, or see README.md."
  );
  console.log(lines.join("\n"));
}

async function main() {
  const cmd = process.argv[2];
  const positional = process.argv.slice(3).filter((a) => !a.startsWith("-"));

  if (!cmd || cmd === "--help" || cmd === "-h" || cmd === "help") {
    printHelp();
    return;
  }

  const meta = COMMANDS[cmd];
  if (!meta) {
    if (WRITE_NS.has(cmd)) {
      // Write side parses the full argv itself (flags + namespaces).
      const mod = require("../commands/write.js");
      await mod.run();
      return;
    }
    console.error(`Unknown command: "${cmd}"`);
    printHelp();
    process.exit(1);
  }

  const mod = require(meta.path);
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log(`Usage: ${mod.usage}`);
    console.log("");
    console.log(mod.description);
    return;
  }

  await mod.run(positional);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
