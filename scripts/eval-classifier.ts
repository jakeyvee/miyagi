#!/usr/bin/env tsx
/**
 * eval-classifier.ts — runs the labeled corpus against a deployed (or local)
 * classifier endpoint and emits a Markdown scorecard.
 *
 * Usage:
 *   npm run eval:classifier
 *
 * Environment:
 *   EVAL_BASE_URL       Base URL of the app to hit. Default: http://localhost:3000
 *   EVAL_CONCURRENCY    Max in-flight requests. Default: 4
 *   EVAL_MIN_ACCURACY   Overall accuracy floor; exits nonzero below. Default: 0.7
 *   EVAL_TIMEOUT_MS     Per-request timeout. Default: 30000
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  AGE_BANDS,
  VERDICTS,
  isVerdict,
  type AgeBand,
  type Verdict,
} from "@/lib/contracts";
import {
  loadCorpus,
  type CorpusRecord,
} from "@/data/classifier-corpus/index";

interface EvalConfig {
  baseUrl: string;
  concurrency: number;
  minAccuracy: number;
  timeoutMs: number;
}

interface EvalResult {
  record: CorpusRecord;
  actual: Verdict | null;
  confidence: number | null;
  latencyMs: number;
  error: string | null;
}

interface BandMetrics {
  total: number;
  correct: number;
  accuracy: number;
  confusion: Record<Verdict, Record<Verdict, number>>;
  meanConfidenceCorrect: number | null;
  meanConfidenceIncorrect: number | null;
  p50LatencyMs: number;
  p95LatencyMs: number;
  errors: number;
}

function parseConfig(): EvalConfig {
  const baseUrl = process.env.EVAL_BASE_URL ?? "http://localhost:3000";
  const concurrencyRaw = process.env.EVAL_CONCURRENCY;
  const minAccuracyRaw = process.env.EVAL_MIN_ACCURACY;
  const timeoutRaw = process.env.EVAL_TIMEOUT_MS;
  const concurrency = concurrencyRaw ? Number.parseInt(concurrencyRaw, 10) : 4;
  const minAccuracy = minAccuracyRaw ? Number.parseFloat(minAccuracyRaw) : 0.7;
  const timeoutMs = timeoutRaw ? Number.parseInt(timeoutRaw, 10) : 30_000;
  if (!Number.isFinite(concurrency) || concurrency < 1) {
    throw new Error(`EVAL_CONCURRENCY must be a positive integer (got ${concurrencyRaw})`);
  }
  if (!Number.isFinite(minAccuracy) || minAccuracy < 0 || minAccuracy > 1) {
    throw new Error(
      `EVAL_MIN_ACCURACY must be between 0 and 1 (got ${minAccuracyRaw})`,
    );
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1) {
    throw new Error(`EVAL_TIMEOUT_MS must be a positive integer (got ${timeoutRaw})`);
  }
  return { baseUrl, concurrency, minAccuracy, timeoutMs };
}

async function runOne(
  record: CorpusRecord,
  config: EvalConfig,
): Promise<EvalResult> {
  const url = `${config.baseUrl.replace(/\/$/, "")}/api/classifier`;
  const startedAt = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        input: record.input,
        topicLock: record.topicLock,
        ageBand: record.ageBand,
      }),
      signal: controller.signal,
    });
    const latencyMs = performance.now() - startedAt;
    if (!res.ok) {
      const bodyText = await res.text().catch(() => "");
      return {
        record,
        actual: null,
        confidence: null,
        latencyMs,
        error: `http_${res.status}${bodyText ? `: ${bodyText.slice(0, 200)}` : ""}`,
      };
    }
    let body: unknown;
    try {
      body = await res.json();
    } catch (err) {
      return {
        record,
        actual: null,
        confidence: null,
        latencyMs,
        error: `invalid_json: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
    if (!body || typeof body !== "object") {
      return {
        record,
        actual: null,
        confidence: null,
        latencyMs,
        error: "response_not_object",
      };
    }
    const v = (body as Record<string, unknown>).verdict;
    const c = (body as Record<string, unknown>).confidence;
    if (!isVerdict(v)) {
      return {
        record,
        actual: null,
        confidence: null,
        latencyMs,
        error: `bad_verdict:${String(v)}`,
      };
    }
    const confidence = typeof c === "number" && Number.isFinite(c) ? c : null;
    return {
      record,
      actual: v,
      confidence,
      latencyMs,
      error: null,
    };
  } catch (err) {
    const latencyMs = performance.now() - startedAt;
    const message = err instanceof Error ? err.message : String(err);
    return {
      record,
      actual: null,
      confidence: null,
      latencyMs,
      error: `network_error: ${message}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Tiny manual semaphore — runs `worker(item)` over `items` with at most
 * `limit` concurrent workers. No external deps.
 */
async function runWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  const pump = async (): Promise<void> => {
    while (true) {
      const i = nextIndex++;
      if (i >= items.length) return;
      const item = items[i];
      // We populate results in order — never undefined except briefly while
      // workers race ahead. The caller only reads results after all pumps end.
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      results[i] = await worker(item!, i);
    }
  };
  const workers: Array<Promise<void>> = [];
  const parallelism = Math.min(limit, items.length);
  for (let i = 0; i < parallelism; i++) {
    workers.push(pump());
  }
  await Promise.all(workers);
  return results;
}

function emptyConfusion(): Record<Verdict, Record<Verdict, number>> {
  const out = {} as Record<Verdict, Record<Verdict, number>>;
  for (const expected of VERDICTS) {
    const row = {} as Record<Verdict, number>;
    for (const actual of VERDICTS) {
      row[actual] = 0;
    }
    out[expected] = row;
  }
  return out;
}

function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const idx = Math.min(
    sortedAsc.length - 1,
    Math.max(0, Math.ceil((p / 100) * sortedAsc.length) - 1),
  );
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return sortedAsc[idx]!;
}

function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

function computeMetrics(results: readonly EvalResult[]): BandMetrics {
  const confusion = emptyConfusion();
  const confidencesCorrect: number[] = [];
  const confidencesIncorrect: number[] = [];
  const latencies: number[] = [];
  let correct = 0;
  let errors = 0;
  for (const r of results) {
    latencies.push(r.latencyMs);
    if (r.actual === null) {
      errors++;
      continue;
    }
    confusion[r.record.expected][r.actual] += 1;
    if (r.actual === r.record.expected) {
      correct++;
      if (r.confidence !== null) confidencesCorrect.push(r.confidence);
    } else if (r.confidence !== null) {
      confidencesIncorrect.push(r.confidence);
    }
  }
  const sortedLatencies = [...latencies].sort((a, b) => a - b);
  return {
    total: results.length,
    correct,
    accuracy: results.length === 0 ? 0 : correct / results.length,
    confusion,
    meanConfidenceCorrect: mean(confidencesCorrect),
    meanConfidenceIncorrect: mean(confidencesIncorrect),
    p50LatencyMs: percentile(sortedLatencies, 50),
    p95LatencyMs: percentile(sortedLatencies, 95),
    errors,
  };
}

function formatConfidence(value: number | null): string {
  return value === null ? "n/a" : value.toFixed(3);
}

function formatLatency(ms: number): string {
  return `${ms.toFixed(0)}ms`;
}

function renderConfusion(
  confusion: Record<Verdict, Record<Verdict, number>>,
): string {
  const header = ["expected \\ actual", ...VERDICTS].join(" | ");
  const sep = ["---", ...VERDICTS.map(() => "---")].join(" | ");
  const rows = VERDICTS.map((expected) => {
    const cells = VERDICTS.map((actual) =>
      String(confusion[expected][actual]),
    );
    return [`**${expected}**`, ...cells].join(" | ");
  });
  return [`| ${header} |`, `| ${sep} |`, ...rows.map((r) => `| ${r} |`)].join(
    "\n",
  );
}

function renderMetricsBlock(label: string, m: BandMetrics): string {
  return [
    `### ${label}`,
    "",
    `- total: ${m.total}`,
    `- correct: ${m.correct}`,
    `- errors: ${m.errors}`,
    `- accuracy: ${(m.accuracy * 100).toFixed(2)}%`,
    `- mean confidence on correct: ${formatConfidence(m.meanConfidenceCorrect)}`,
    `- mean confidence on incorrect: ${formatConfidence(m.meanConfidenceIncorrect)}`,
    `- latency p50: ${formatLatency(m.p50LatencyMs)}`,
    `- latency p95: ${formatLatency(m.p95LatencyMs)}`,
    "",
    "Confusion matrix:",
    "",
    renderConfusion(m.confusion),
    "",
  ].join("\n");
}

function renderFailures(results: readonly EvalResult[]): string {
  const failures = results.filter(
    (r) => r.actual !== null && r.actual !== r.record.expected,
  );
  const errors = results.filter((r) => r.actual === null);
  if (failures.length === 0 && errors.length === 0) return "_No failures._";
  const parts: string[] = [];
  if (failures.length > 0) {
    parts.push(`#### Misclassifications (${failures.length})`);
    parts.push("");
    parts.push("| id | age | topic | expected | actual | confidence | input |");
    parts.push("| --- | --- | --- | --- | --- | --- | --- |");
    for (const f of failures.slice(0, 50)) {
      parts.push(
        `| ${f.record.id} | ${f.record.ageBand} | ${f.record.topicLock} | ${f.record.expected} | ${f.actual} | ${formatConfidence(f.confidence)} | ${escapeCell(f.record.input)} |`,
      );
    }
    if (failures.length > 50) {
      parts.push(`_…and ${failures.length - 50} more misclassifications._`);
    }
    parts.push("");
  }
  if (errors.length > 0) {
    parts.push(`#### Errors (${errors.length})`);
    parts.push("");
    parts.push("| id | age | error |");
    parts.push("| --- | --- | --- |");
    for (const e of errors.slice(0, 50)) {
      parts.push(
        `| ${e.record.id} | ${e.record.ageBand} | ${escapeCell(e.error ?? "")} |`,
      );
    }
    if (errors.length > 50) {
      parts.push(`_…and ${errors.length - 50} more errors._`);
    }
    parts.push("");
  }
  return parts.join("\n");
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function renderReport(
  config: EvalConfig,
  startedAt: Date,
  finishedAt: Date,
  overall: BandMetrics,
  byBand: Record<AgeBand, BandMetrics>,
  results: readonly EvalResult[],
): string {
  const parts = [
    `# Classifier evaluation — ${startedAt.toISOString()}`,
    "",
    `- base URL: \`${config.baseUrl}\``,
    `- concurrency: ${config.concurrency}`,
    `- min accuracy threshold: ${(config.minAccuracy * 100).toFixed(2)}%`,
    `- records evaluated: ${overall.total}`,
    `- wall time: ${((finishedAt.getTime() - startedAt.getTime()) / 1000).toFixed(2)}s`,
    "",
    "## Overall",
    "",
    renderMetricsBlock("Overall", overall),
    "## Per age band",
    "",
  ];
  for (const band of AGE_BANDS) {
    parts.push(renderMetricsBlock(`Age band ${band}`, byBand[band]));
  }
  parts.push("## Failures");
  parts.push("");
  parts.push(renderFailures(results));
  parts.push("");
  return parts.join("\n");
}

function summarize(label: string, m: BandMetrics): string {
  return `${label.padEnd(12)} acc=${(m.accuracy * 100).toFixed(1)}%  correct=${m.correct}/${m.total}  err=${m.errors}  p50=${formatLatency(m.p50LatencyMs)} p95=${formatLatency(m.p95LatencyMs)}`;
}

async function main(): Promise<void> {
  const config = parseConfig();
  const corpus = await loadCorpus();
  if (corpus.length === 0) {
    throw new Error("Corpus is empty — nothing to evaluate.");
  }
  console.log(
    `Evaluating ${corpus.length} records against ${config.baseUrl} ` +
      `(concurrency=${config.concurrency}, timeout=${config.timeoutMs}ms)`,
  );
  const startedAt = new Date();

  const results = await runWithConcurrency(
    corpus,
    config.concurrency,
    (record) => runOne(record, config),
  );

  const finishedAt = new Date();

  const byBand = {} as Record<AgeBand, BandMetrics>;
  for (const band of AGE_BANDS) {
    byBand[band] = computeMetrics(results.filter((r) => r.record.ageBand === band));
  }
  const overall = computeMetrics(results);

  // Print summary first so it shows even if the writer fails.
  console.log("");
  console.log(summarize("OVERALL", overall));
  for (const band of AGE_BANDS) {
    console.log(summarize(band, byBand[band]));
  }
  console.log("");

  const report = renderReport(
    config,
    startedAt,
    finishedAt,
    overall,
    byBand,
    results,
  );
  const reportsDir = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "data",
    "classifier-corpus",
    "reports",
  );
  await fs.mkdir(reportsDir, { recursive: true });
  const stamp = startedAt.toISOString().replace(/[:.]/g, "-");
  const reportPath = path.join(reportsDir, `${stamp}.md`);
  await fs.writeFile(reportPath, report, "utf8");
  console.log(`Report written to ${reportPath}`);

  if (overall.accuracy < config.minAccuracy) {
    console.error(
      `FAIL: overall accuracy ${(overall.accuracy * 100).toFixed(2)}% < threshold ` +
        `${(config.minAccuracy * 100).toFixed(2)}%`,
    );
    process.exit(1);
  }
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`eval-classifier failed: ${message}`);
  if (err instanceof Error && err.stack) {
    console.error(err.stack);
  }
  process.exit(1);
});
