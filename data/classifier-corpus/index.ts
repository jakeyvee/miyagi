import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  AGE_BANDS,
  isAgeBand,
  isVerdict,
  type AgeBand,
  type Verdict,
} from "@/lib/contracts";

/**
 * One labeled example for the classifier evaluation harness.
 *
 * - `id`         — stable identifier (used in reports + regression tracking).
 * - `input`      — raw kid utterance fed into the classifier.
 * - `topicLock`  — the parent-set topic lock that applies to this example.
 * - `ageBand`    — kid age band; controls which JSONL file the record lives in.
 * - `expected`   — the verdict a human grader assigned.
 * - `rationale`  — short human-readable note explaining the label, so a parent
 *                  or auditor can sanity-check the label without rerunning the
 *                  classifier.
 */
export interface CorpusRecord {
  id: string;
  input: string;
  topicLock: string;
  ageBand: AgeBand;
  expected: Verdict;
  rationale: string;
}

interface RawCorpusRecord {
  id?: unknown;
  input?: unknown;
  topicLock?: unknown;
  expected?: unknown;
  rationale?: unknown;
}

const CORPUS_DIR = path.dirname(fileURLToPath(import.meta.url));

function validateRecord(
  raw: unknown,
  ageBand: AgeBand,
  source: string,
  lineNumber: number,
): CorpusRecord {
  if (!raw || typeof raw !== "object") {
    throw new Error(
      `Invalid record in ${source} line ${lineNumber}: not an object`,
    );
  }
  const r = raw as RawCorpusRecord;
  if (typeof r.id !== "string" || r.id.length === 0) {
    throw new Error(
      `Invalid record in ${source} line ${lineNumber}: 'id' must be a non-empty string`,
    );
  }
  if (typeof r.input !== "string" || r.input.length === 0) {
    throw new Error(
      `Invalid record in ${source} line ${lineNumber} (${r.id}): 'input' must be a non-empty string`,
    );
  }
  if (typeof r.topicLock !== "string" || r.topicLock.trim().length === 0) {
    throw new Error(
      `Invalid record in ${source} line ${lineNumber} (${r.id}): 'topicLock' must be a non-empty string`,
    );
  }
  if (!isVerdict(r.expected)) {
    throw new Error(
      `Invalid record in ${source} line ${lineNumber} (${r.id}): 'expected' is not a known Verdict`,
    );
  }
  if (typeof r.rationale !== "string") {
    throw new Error(
      `Invalid record in ${source} line ${lineNumber} (${r.id}): 'rationale' must be a string`,
    );
  }
  if (!isAgeBand(ageBand)) {
    // Defensive: ageBand comes from our own iteration so this shouldn't fire,
    // but it keeps the type narrowing honest.
    throw new Error(`Invalid age band derived from ${source}: ${ageBand}`);
  }

  return {
    id: r.id,
    input: r.input,
    topicLock: r.topicLock,
    ageBand,
    expected: r.expected,
    rationale: r.rationale,
  };
}

async function loadBand(ageBand: AgeBand): Promise<CorpusRecord[]> {
  const filePath = path.join(CORPUS_DIR, `${ageBand}.jsonl`);
  const contents = await fs.readFile(filePath, "utf8");
  const records: CorpusRecord[] = [];
  const lines = contents.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Invalid JSON in ${filePath} line ${i + 1}: ${msg}`,
      );
    }
    records.push(validateRecord(parsed, ageBand, filePath, i + 1));
  }
  return records;
}

/**
 * Loads every JSONL file under `data/classifier-corpus/` and returns the full
 * labeled corpus. Throws if any file is missing or any record is malformed —
 * the corpus is treated as a strict source of ground truth.
 */
export async function loadCorpus(): Promise<CorpusRecord[]> {
  const perBand = await Promise.all(AGE_BANDS.map((band) => loadBand(band)));
  const all: CorpusRecord[] = [];
  const seenIds = new Set<string>();
  for (const records of perBand) {
    for (const record of records) {
      if (seenIds.has(record.id)) {
        throw new Error(`Duplicate corpus record id: ${record.id}`);
      }
      seenIds.add(record.id);
      all.push(record);
    }
  }
  return all;
}
