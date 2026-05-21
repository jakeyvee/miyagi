#!/usr/bin/env tsx
/**
 * verify-privacy.ts — static guardrail scanner for the kid-quest privacy
 * contract. Walks the source tree and fails (exit 1) if any of these
 * invariants is violated:
 *
 *   1. The `@anthropic-ai/sdk` package is only ever imported from
 *      `app/api/**` or `lib/server/**`.
 *   2. `ANTHROPIC_API_KEY` is never referenced with a `NEXT_PUBLIC_` prefix.
 *   3. `process.env.ANTHROPIC_API_KEY` is only read inside `app/api/**` or
 *      `lib/server/**` (the canonical reader is `lib/server/env.ts`).
 *   4. No microphone / audio / Web Speech APIs appear in any source file
 *      (typed text input only).
 *   5. No `<input ... type="file">` element appears (typed text input only).
 *
 * Print a structured report and exit 0 on pass, 1 on any violation.
 *
 * Usage:
 *   npm run verify:privacy
 *
 * See `docs/privacy-audit.md` for the rationale behind each rule.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

// Top-level directories we walk. Anything outside these is ignored by design.
const SCAN_ROOTS = ["app", "lib", "scripts", "data", "public", "docs"];

// File extensions we consider "source files" worth scanning. Markdown and
// JSON are included so secrets / API URLs accidentally checked in to docs or
// fixtures get caught too.
const SCAN_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".md",
  ".mdx",
  ".json",
  ".html",
]);

// Directories to skip entirely.
const SKIP_DIR_NAMES = new Set([
  "node_modules",
  ".next",
  ".git",
  ".turbo",
  "dist",
  "build",
  "coverage",
]);

// Specific paths (relative to repo root) to skip. The classifier corpus is a
// fixture of kid-typed strings that intentionally include words like "audio"
// or "speech"; the eval script reads from it and would otherwise false-flag.
const SKIP_PATHS = new Set<string>([
  "public/sw.js",
  "scripts/eval-classifier.ts",
  "scripts/verify-privacy.ts",
  "scripts/verify-network-paths.ts",
  "docs/privacy-audit.md",
]);

const SKIP_PATH_PREFIXES = ["data/classifier-corpus/"];

// Paths that ARE allowed to import from `openai` or read
// `process.env.ANTHROPIC_API_KEY`. Anything under these prefixes is considered
// server-only.
const SERVER_ONLY_PREFIXES = ["app/api/", "lib/server/"];

// `lib/server/env.ts` is the single canonical reader. Other files in
// `lib/server` and `app/api` are *also* allowed, but only `env.ts` is
// referenced in the audit doc as the source of truth.
const ENV_CANONICAL_PATH = "lib/server/env.ts";

// ---------------------------------------------------------------------------
// Rule definitions
// ---------------------------------------------------------------------------

interface Violation {
  rule: string;
  file: string;
  line: number;
  snippet: string;
  detail: string;
}

interface RuleContext {
  relPath: string;
  isServerOnly: boolean;
}

interface LineRule {
  id: string;
  description: string;
  // Returns a violation detail (or null) for a given line.
  check: (line: string, ctx: RuleContext) => string | null;
  // Extensions this rule applies to. Defaults to code-only extensions.
  // Markdown is excluded by default because docs intentionally name banned
  // APIs in order to explain why they are banned.
  extensions?: Set<string>;
}

const CODE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".html",
]);

// A small set of rules where ANY appearance — even in docs or JSON — is a
// real privacy bug. NEXT_PUBLIC_*ANTHROPIC* in a doc would be a leak waiting
// to be copy-pasted; a NEXT_PUBLIC_ env var literally cannot be safely
// mentioned without contradicting the policy.
const ALL_FILE_EXTENSIONS = SCAN_EXTENSIONS;

const ANTHROPIC_IMPORT_RE =
  /(?:from\s+["']@anthropic-ai\/sdk["']|require\(\s*["']@anthropic-ai\/sdk["']\s*\))/;

const NEXT_PUBLIC_ANTHROPIC_RE = /NEXT_PUBLIC_[A-Z0-9_]*ANTHROPIC[A-Z0-9_]*/;

const ANTHROPIC_ENV_READ_RE = /process\.env\.ANTHROPIC_API_KEY/;

// Microphone / audio / Web Speech API surface. Kid-quest is typed-text only.
const AUDIO_API_RE =
  /\b(?:getUserMedia|MediaRecorder|webkitSpeech(?:Recognition|Grammar(?:List)?)?|SpeechRecognition|speechSynthesis|AudioContext|MediaStreamTrack|navigator\.mediaDevices)\b/;

// File-upload inputs are out of scope — only typed text is allowed.
const FILE_INPUT_RE = /<input[^>]*type=["']file["']/;

const RULES: LineRule[] = [
  {
    id: "no-client-anthropic-import",
    description:
      "`@anthropic-ai/sdk` package may only be imported from app/api/** or lib/server/**.",
    extensions: CODE_EXTENSIONS,
    check: (line, ctx) => {
      if (ctx.isServerOnly) return null;
      if (!ANTHROPIC_IMPORT_RE.test(line)) return null;
      return "client-readable file imports from `@anthropic-ai/sdk`";
    },
  },
  {
    id: "no-next-public-anthropic",
    description:
      "ANTHROPIC_API_KEY must never be prefixed with NEXT_PUBLIC_ (anywhere — even docs — since it would normalize the leak).",
    extensions: ALL_FILE_EXTENSIONS,
    check: (line) => {
      if (!NEXT_PUBLIC_ANTHROPIC_RE.test(line)) return null;
      return "reference to NEXT_PUBLIC_*ANTHROPIC* env var";
    },
  },
  {
    id: "no-client-anthropic-env-read",
    description:
      "process.env.ANTHROPIC_API_KEY may only be read from app/api/** or lib/server/** code files.",
    extensions: CODE_EXTENSIONS,
    check: (line, ctx) => {
      if (ctx.isServerOnly) return null;
      if (!ANTHROPIC_ENV_READ_RE.test(line)) return null;
      return "client-readable file reads process.env.ANTHROPIC_API_KEY";
    },
  },
  {
    id: "no-audio-apis",
    description:
      "Microphone, audio, and Web Speech APIs are not allowed in source code (typed text only).",
    extensions: CODE_EXTENSIONS,
    check: (line) => {
      const match = line.match(AUDIO_API_RE);
      if (!match) return null;
      return `audio/speech API reference: ${match[0]}`;
    },
  },
  {
    id: "no-file-input",
    description:
      "<input type=\"file\"> is not allowed in source code; only typed text input is supported.",
    extensions: CODE_EXTENSIONS,
    check: (line) => {
      if (!FILE_INPUT_RE.test(line)) return null;
      return "file-upload input element";
    },
  },
];

// ---------------------------------------------------------------------------
// Walker
// ---------------------------------------------------------------------------

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

function shouldScan(relPath: string): boolean {
  if (SKIP_PATHS.has(relPath)) return false;
  for (const prefix of SKIP_PATH_PREFIXES) {
    if (relPath.startsWith(prefix)) return false;
  }
  const ext = path.extname(relPath);
  return SCAN_EXTENSIONS.has(ext);
}

function isServerOnly(relPath: string): boolean {
  return SERVER_ONLY_PREFIXES.some((p) => relPath.startsWith(p));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const violations: Violation[] = [];
  let filesScanned = 0;

  for (const root of SCAN_ROOTS) {
    const absRoot = path.join(REPO_ROOT, root);
    for await (const abs of walk(absRoot)) {
      const rel = path.relative(REPO_ROOT, abs).split(path.sep).join("/");
      if (!shouldScan(rel)) continue;
      filesScanned += 1;
      const text = await fs.readFile(abs, "utf8");
      const ctx: RuleContext = {
        relPath: rel,
        isServerOnly: isServerOnly(rel),
      };
      const ext = path.extname(rel);
      const lines = text.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i] ?? "";
        for (const rule of RULES) {
          const allowedExts = rule.extensions ?? CODE_EXTENSIONS;
          if (!allowedExts.has(ext)) continue;
          const detail = rule.check(line, ctx);
          if (detail) {
            violations.push({
              rule: rule.id,
              file: rel,
              line: i + 1,
              snippet: line.trim().slice(0, 240),
              detail,
            });
          }
        }
      }
    }
  }

  // Sanity check: the canonical env reader must actually exist where the
  // audit doc claims, otherwise the exception we grant it is meaningless.
  try {
    await fs.access(path.join(REPO_ROOT, ENV_CANONICAL_PATH));
  } catch {
    violations.push({
      rule: "canonical-env-reader-missing",
      file: ENV_CANONICAL_PATH,
      line: 0,
      snippet: "",
      detail: `expected canonical env reader at ${ENV_CANONICAL_PATH}`,
    });
  }

  // ---- Report --------------------------------------------------------------
  const header = "kid-quest privacy verify";
  console.log(`\n${header}`);
  console.log("=".repeat(header.length));
  console.log(`Files scanned: ${filesScanned}`);
  console.log(`Rules applied: ${RULES.length}`);

  if (violations.length === 0) {
    console.log("\nResult: PASS — no privacy guardrail violations found.\n");
    console.log("Rules checked:");
    for (const rule of RULES) {
      console.log(`  - [${rule.id}] ${rule.description}`);
    }
    process.exit(0);
  }

  console.log(`\nResult: FAIL — ${violations.length} violation(s):\n`);
  const byRule = new Map<string, Violation[]>();
  for (const v of violations) {
    const arr = byRule.get(v.rule) ?? [];
    arr.push(v);
    byRule.set(v.rule, arr);
  }
  for (const [ruleId, vs] of byRule) {
    console.log(`  [${ruleId}] ${vs.length} hit(s):`);
    for (const v of vs) {
      console.log(`    ${v.file}:${v.line}  ${v.detail}`);
      if (v.snippet) console.log(`      > ${v.snippet}`);
    }
    console.log("");
  }
  process.exit(1);
}

main().catch((err) => {
  console.error("verify-privacy: unexpected error", err);
  process.exit(2);
});
