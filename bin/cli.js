#!/usr/bin/env node
// Compat shim: `substack-cli ...` is an alias for the write side of `substack ...`.
// Kept so existing scripts/notes referencing the old SubstackCLI binary keep working.
import { run } from "../commands/write.js";

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
