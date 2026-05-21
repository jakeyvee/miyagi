# Brute-force detection

Kid-quest discourages the failure mode where a kid pastes the same critical
question repeatedly hoping the assistant will eventually cave and hand over
an answer. We call this "brute-forcing the tree" because the visual
consequence is that the kid's plant wilts and then dies.

There are two layers today:

## Phase 1 — client-side heuristic (shipped, VOL-184)

Lives in `lib/kid/tree/hook.ts` and `lib/kid/tree/state.ts`.

- Watches the session event bus.
- Two consecutive `classifier_verdict === "critical"` events (with a
  `kid_input_submitted` between them and no intervening
  `tree_state_changed` or `session_ended`) count as a brute-force attempt.
- Threshold ladder:
  - `WILT_THRESHOLD = 2` → the tree wilts.
  - `DEAD_THRESHOLD = 3` → the tree dies (absorbing state for the session).

This is purely string-equality / event-sequence based — paraphrasing the
question defeats it.

## Phase 2 — server-side semantic detector (VOL-190, advisory)

Lives in `lib/server/brute-force.ts` and `lib/server/embeddings.ts`.

- The classifier route (`POST /api/classifier`) calls
  `evaluateCriticalReask()` ONLY when `verdict === "critical"` and the
  request carried an optional `sessionId`. Older clients that omit
  `sessionId` get the exact Phase 1 response shape with no extra latency.
- The detector embeds the kid input with OpenAI
  `text-embedding-3-small` (see `EMBEDDING_MODEL`) and compares cosine
  similarity against earlier critical inputs from the same session window.
- A new critical input counts as a re-ask if EITHER:
  - cosine similarity to any prior critical query is ≥
    `SEMANTIC_REASK_THRESHOLD = 0.86`, OR
  - the normalized (trimmed, lowercased) input exactly matches a prior
    critical query in the window.
- The same threshold ladder as Phase 1 (`wilt` at 2 re-asks, `dead` at 3)
  maps to the optional `reask.consequence` field on the classifier
  response.

### Why 0.86?

`text-embedding-3-small` returns 1536-dim vectors. Empirically — and
consistent with OpenAI's own examples for paraphrase-style equivalence —
real paraphrases tend to score between 0.85 and 0.95, while unrelated kid
questions on different topics typically sit below 0.75. 0.86 is a
deliberately conservative starting point that prefers false negatives
(missing some genuine re-asks) over false positives (killing the tree on a
legitimately new question).

Tuning notes:

- If kids report unfair wilting, lower the threshold slowly (0.88, 0.90).
- If brute force keeps slipping through, raise toward 0.82 but also watch
  the false-positive rate on the parent log.
- Per-age-band tuning is a candidate follow-up — younger kids tend to
  rephrase more.

### Privacy

The kid's input text is sent to OpenAI for embedding. This is the same
trust boundary as the existing classifier path — no new permission surface
is introduced, and the OpenAI SDK is only ever imported from
`lib/server/openai.ts`. Embeddings stay in process memory (per-request
hash-keyed cache) and are not persisted.

### Compatibility

The client-side tree state machine in `lib/kid/tree/state.ts` continues to
compute its own consequence from the session event bus. The
server-provided `reask.consequence` is **advisory** for now — the kid
client does not read it. VOL-184's reducer remains the visual source of
truth for the tree.

A follow-up ticket should move the source of truth to the server-provided
value (or reconcile the two), so the semantic detector actually drives the
visible wilt/death. Until then, Phase 2 exists primarily so the parent log
can surface "we caught X paraphrased re-asks this session" and so we have
the wiring in place when the cutover happens.

### Open issues

- The server cannot observe `session_ended` events from the kid surface
  today. Session windows expire passively via the 30-minute sliding TTL.
  `resetSession(sessionId)` is exported from `lib/server/brute-force.ts`
  so a future ticket can hook it up to an explicit end-of-session signal.
- The in-memory session map does not survive serverless cold starts. For
  Vercel functions this means a redeploy or scale-out can lose state mid
  session. Acceptable for the advisory phase; a durable backing store
  (KV / DB) is the right answer when this becomes load-bearing.
- The embedding cache is process-local and unbounded inside the TTL
  window. The window itself caps growth in practice; revisit if a session
  with many distinct critical questions causes memory pressure.
