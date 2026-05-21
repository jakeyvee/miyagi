#!/usr/bin/env tsx
/**
 * verify-network-paths.ts — static scan for any direct provider URL in
 * client-readable code. All LLM traffic must go through `app/api/**` route
 * handlers; the kid and parent surfaces should only ever talk to same-origin
 * `/api/*` paths.
 *
 * Fails (exit 1) if any source file under `app/**` or `lib/**` references a
 * direct OpenAI URL (e.g. `https://api.openai.com/...`) outside `app/api/**`
 * or `lib/server/**`. Server-only files are technically allowed to call the
 * provider, but in practice they go through the OpenAI SDK in
 * `lib/server/openai.ts`, so a literal URL there is also flagged for review.
 *
 * Usage:
 *   npm run verify:network
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const SCAN_ROOTS = ["app", "lib"];

const SCAN_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
]);

const SKIP_DIR_NAMES = new Set([
  "node_modules",
  ".next",
  ".git",
]);

// Direct provider URLs that should never appear in app/** or lib/**.
// Anchored to common OpenAI and OpenAI-compatible base hosts. If you add a
// new provider, list its base URL here too.
const FORBIDDEN_URL_RES: { pattern: RegExp; label: string }[] = [
  { pattern: /https?:\/\/api\.openai\.com/i, label: "api.openai.com" },
  {
    pattern: /https?:\/\/api\.anthropic\.com/i,
    label: "api.anthropic.com (unsupported provider)",
  },
  {
    pattern: /https?:\/\/generativelanguage\.googleapis\.com/i,
    label: "generativelanguage.googleapis.com (unsupported provider)",
  },
];

interface Hit {
  file: string;
  line: number;
  snippet: string;
  label: string;
}

async function* walk(dir: string): AsyncGenerator<string> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIR_NAMES.has(entry.name)) continue;
      yield* walk(full);
    } else if (entry.isFile()) {
      yield full;
    }
  }
}

async function main(): Promise<void> {
  const hits: Hit[] = [];
  let filesScanned = 0;

  for (const root of SCAN_ROOTS) {
    for await (const abs of walk(path.join(REPO_ROOT, root))) {
      const rel = path.relative(REPO_ROOT, abs).split(path.sep).join("/");
      if (!SCAN_EXTENSIONS.has(path.extname(rel))) continue;
      filesScanned += 1;
      const text = await fs.readFile(abs, "utf8");
      const lines = text.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i] ?? "";
        for (const { pattern, label } of FORBIDDEN_URL_RES) {
          if (pattern.test(line)) {
            hits.push({
              file: rel,
              line: i + 1,
              snippet: line.trim().slice(0, 240),
              label,
            });
          }
        }
      }
    }
  }

  const header = "kid-quest network paths verify";
  console.log(`\n${header}`);
  console.log("=".repeat(header.length));
  console.log(`Files scanned: ${filesScanned}`);
  console.log(`Allowed network targets from app/**, lib/**: same-origin /api/* only.`);

  if (hits.length === 0) {
    console.log("\nResult: PASS — no direct provider URLs found.\n");
    process.exit(0);
  }

  console.log(`\nResult: FAIL — ${hits.length} direct provider URL reference(s):\n`);
  for (const h of hits) {
    console.log(`  ${h.file}:${h.line}  ${h.label}`);
    console.log(`    > ${h.snippet}`);
  }
  console.log("");
  process.exit(1);
}

main().catch((err) => {
  console.error("verify-network-paths: unexpected error", err);
  process.exit(2);
});
