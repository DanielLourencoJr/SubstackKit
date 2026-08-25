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
  lookup: { path: "../commands/lookup.js" }
};

function printHelp() {
  const lines = [
    `substack-kit v${pkg.version} — downloader/exportador de dados públicos do Substack`,
    "",
    "Uso: substack <comando> [argumentos]",
    "",
    "Comandos:"
  ];
  for (const [name, meta] of Object.entries(COMMANDS)) {
    const mod = require(meta.path);
    lines.push(`  ${name.padEnd(10)} ${mod.description}`);
  }
  lines.push("");
  lines.push("Rode `substack <comando> --help` para flags de cada comando, ou veja README.md.");
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
    console.error(`Comando desconhecido: "${cmd}"`);
    printHelp();
    process.exit(1);
  }

  const mod = require(meta.path);
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log(`Uso: ${mod.usage}`);
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
