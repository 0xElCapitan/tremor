# TREMOR Post-Audit Implementation Sprint

**Invoke with**: `/implement sprint-1` or paste directly into Claude Code as task context.
**Source artifacts**: `grimoires/loa/consistency-report.md`, `grimoires/loa/drift-report.md`, `grimoires/loa/reality/hygiene-report.md`, and the empirical validation audit (locate the actual path in `grimoires/loa/` before acting — treat all paths in this document as hints, not ground truth).
**Posture**: Fix in priority order. Do not batch across groups. Verify each fix before moving to the next.

---

Scope: Implement Groups 1 and 2 only. After Group 2 is complete, run the full test suite, summarize what changed, and list any unresolved issues. Stop there. Do not begin Group 3. Group 3 runs in a separate sprint after review.

---

## Pre-flight: Verify before touching code

Before changing anything, verify all referenced files, paths, and line numbers against the live repo. If a path or line number has drifted from what this prompt states, use the live file as truth and note the drift. Do not invent around a stale reference.

---

## Invariants — preserve these across every Group 1 fix

These are non-negotiable correctness properties. Any fix that violates them is not a fix.

1. **One resolution event → one theatre resolution → one certificate artifact.** No event may produce duplicate theatre spawns or duplicate exported certificates, including under retry.
2. **All disk writes for certificate export must be atomic or idempotent.** A partial write followed by a crash must not produce a corrupt or duplicate artifact on retry.
3. **Fail closed on malformed core uncertainty inputs.** If `doubt_price`, threshold-crossing probability, or any Brier-critical field cannot be computed to a finite, valid value from required upstream fields, reject the bundle and log clearly. Do not substitute fallback math for core uncertainty values. Silent fallback is how bogus confidence gets laundered into clean-looking output.

---

## Group 1 — Code fixes that can silently corrupt outputs (do these first, in order)

Run the full test suite (`node --test test/**/*.test.js`) after each fix before moving to the next. If a fix breaks an existing test, fix the test — do not weaken the assertion.

### 1a. Poll scheduling and certificate export idempotency (highest priority)

**Location**: `src/index.js` — poll loop and certificate export path
**Problem**: If two poll cycles overlap, an M≥6.0 event can trigger duplicate `Aftershock Cascade` spawns and duplicate `exportCertificate()` calls. Duplicate certificates corrupt the RLMF training dataset. A boolean in-flight flag prevents overlap but does not protect against the underlying scheduling failure.

**Fix**:
- Replace `setInterval`-based polling with **single-flight scheduling**: poll completes, then schedule the next poll after a fixed delay. This eliminates overlap at the source.
- Make certificate export **idempotent**: generate a deterministic `certificate_id` from the event ID and resolution timestamp before writing. Before any write, check whether a certificate with that ID already exists on disk. If it does, skip the write and log at debug level. This ensures a retry after a crash cannot duplicate output.
- Add `skipped_poll_count` to `getState()`. Increment it any time a poll is skipped for any reason. Silence is acceptable in logs; not acceptable in observability.

**Success criteria** (all must pass):
- Two overlapping poll invocations against the same event produce exactly one theatre spawn, exactly one `'resolved'` state transition, and exactly one certificate artifact on disk.
- A forced retry of an already-exported resolution produces no new file and no duplicate record.
- `getState()` exposes `skipped_poll_count`.

---

### 1b. NaN propagation in magnitude/bundle pipeline — fail closed

**Location**: `src/processor/magnitude.js` and `src/processor/bundles.js`
**Problem**: Missing or malformed upstream USGS fields (`nst`, `gap`, `rms`) can produce `NaN` in `buildMagnitudeUncertainty()`. `NaN` propagates silently through `doubt_price`, `thresholdCrossingProbability()`, `position_history`, and Brier computation. A theatre can export a certificate with a NaN Brier score.

**Fix**:

For **core uncertainty fields** (`doubt_price` and any value feeding `thresholdCrossingProbability()` or Brier output): fail closed. If the value cannot be computed to a `Number.isFinite()` result from the required upstream inputs, reject the bundle at `buildBundle()` with a logged error that includes the event ID and the specific field that is missing or non-finite. Do not pass the event downstream.

For **secondary metadata** (fields used only for logging or human-readable output, not feeding probability math): a documented safe default is acceptable. Mark any such default with `// FALLBACK: <reason>`.

Specific paths to guard in `magnitude.js`:
- `magnitude.js:68-70` — `1.5 − 0.5·min(1, nst/20)`: guard `nst` null/undefined before division
- `magnitude.js:72` — missing-nst ×1.3 branch: verify it is actually reached for `undefined` vs `0`
- `magnitude.js:80` — ×0.7 reviewed adjustment: apply only when `status === 'reviewed'`, not when status is missing
- `magnitude.js:84` — `min(1, σ/0.5)`: σ must be finite and positive before this executes

At `buildBundle()` in `bundles.js`: validate that `doubt_price` is `Number.isFinite()` and in `[0, 1]`. If not, reject the bundle.

**Success criteria**:
- Feed a feature with `nst: null`, `gap: undefined`, `rms: null`. Verify it is rejected at `buildBundle()` with a logged error. Verify nothing reaches the processor or any theatre.
- Feed a fully valid feature. Verify the full pipeline produces a finite Brier score.

---

### 1c. Export failure leaving theatre in inconsistent state — atomic writes

**Location**: `src/rlmf/certificates.js` and resolution paths in each theatre
**Problem**: If `exportCertificate()` throws after theatre state is set to `'resolved'`, the theatre is permanently resolved in memory with no certificate on disk. The silent loss is undetectable on next poll.

**Additional problem**: If export writes a partial file then throws (e.g., JSON serialization fails mid-stream), a retry can produce a corrupt or duplicate artifact. This is not fixed by state-ordering alone.

**Fix**:
1. Use **atomic write semantics**: write to a temp file (same directory, unique name), then `fs.renameSync()` or `fs.rename()` to the final path. On POSIX this is atomic. This prevents partial-write corruption on retry.
2. Combine with the idempotent certificate ID from 1a: before writing even the temp file, check whether the final path already exists.
3. Only after the atomic rename succeeds: update theatre `state` to `'resolved'`.
4. If export fails: log the error with event ID and full context, leave theatre in prior state, expose failure in `getState()` as a `pending_exports` list or equivalent. Do not silently swallow.

**Success criteria**:
- Mock `exportCertificate()` to throw on first call. Verify theatre state is not `'resolved'` after the failure and the event is surfaced in `getState()`.
- Mock a partial write (throw after temp file created, before rename). Verify no corrupt file exists at the final path after the failure.
- Verify a successful retry after a prior failure produces exactly one certificate.

---

### 1d. USGS/EMSC response schema validation

**Location**: `src/oracles/usgs.js` — `fetchFeed()` and `fetchDetail()`; `src/oracles/emsc.js` — `crossValidateEMSC()`
**Problem**: Oracles trust the GeoJSON schema without validation. Missing or malformed fields surface as NaN or undefined dereference downstream rather than clear oracle errors.

**Required fields to validate** (if missing: log a structured warning with event ID and field name, skip the event, do not pass downstream):
- `id`
- `properties.mag` (must be a finite number)
- `properties.magType` (must be a non-empty string)
- `properties.place`
- `properties.time`
- `properties.status`
- `properties.updated` (used for deduplication)
- `geometry.coordinates` (must be an array of at least 2 finite numbers)

**Success criteria**: Feed a GeoJSON feature with `properties.mag` missing. Verify rejection at the oracle layer with a structured warning. Verify nothing reaches the processor.

---

### 1e. Poll failure visibility and retry behavior

**Location**: `src/index.js` — poll loop error handling; `src/oracles/usgs.js` — `pollAndIngest()`
**Problem**: Feed failures may be swallowed or logged at too low a level for operators to detect degradation. No documented retry policy exists.

**Fix**:
- Catch all fetch errors at the oracle layer. Log at `warn` level with: feed URL, error type, timestamp.
- Do not retry within the same poll cycle. The next scheduled poll is the natural retry.
- Add to `getState()`: `last_successful_poll` (timestamp), `consecutive_poll_failures` (count). If `consecutive_poll_failures >= 3`, emit an `error`-level log.

**Success criteria**: Mock the USGS fetch to fail three times consecutively. Verify `getState()` reflects `consecutive_poll_failures: 3` and that an error-level log is emitted on the third failure.

---

## Group 2 — Documentation honesty fixes (do after Group 1)

### 2a. IRIS integration — remove the claim or relabel it

**Location**: Verify exact location in `README.md` and `BUTTERFREEZONE.md` before editing (line numbers in this prompt may have drifted).
**Fix**: Change any claim that IRIS is an active data source to "USGS and EMSC (IRIS integration planned for v0.2)." Update consistently across both files.

---

### 2b. On-chain P&L — relabel as aspirational

**Location**: `src/rlmf/certificates.js` at the `on_chain` option, and any README reference.
**Fix**: Add inline comment at the parameter site: `// on_chain: reserved for v0.2 — on-chain P&L attribution not yet implemented`. Update README to match.

---

### 2c. Add `source:` or `// TBD: empirical calibration needed` to every uncited magic number

Verify all line numbers against the live repo before acting. For each hardcoded value, add one of:
- `// source: <citation>` where a source exists
- `// TBD: empirical calibration needed — see empirical validation audit` where no source exists

**Prefer grouped comment blocks above parameter clusters** rather than sprinkling individual comment lines. One honest block above a related group of constants is cleaner than per-line noise.

Files and targets (verify paths and lines before editing):
- `src/processor/quality.js` — `statusWeights` block and all five composite weights, missing-value defaults
- `src/processor/settlement.js` — `TWO_HOURS`, `ONE_HOUR`, `SEVEN_DAYS` constants; `composite > 0.5` gate; all three `brier_discount` values
- `src/processor/regions.js` — all `REGION_PROFILES` fields; `DEFAULT_REGION`; `DENSITY_NORM`
- `src/processor/magnitude.js` — reported-error floor factor; station-count formula; missing-nst penalty; reviewed-status adjustment; doubt-price normalization ceiling
- `src/theatres/aftershock.js` — match-radius multiplier; degree conversion; Omori-blend correction; blending floor; `inferRegime` heuristic bounds

Do not change any values. Labels only.

---

## Group 3 — Repo governance (do after Group 2)

### 3a. Create `CHANGELOG.md`
Document v0.1.0 features. Sections: Added, Known Gaps (IRIS, on-chain P&L), Planned for v0.2.

### 3b. Create `SECURITY.md`
Include: vulnerability disclosure channel, expected response timeline, scope statement for a zero-external-dependency CLI construct.

### 3c. Create `CONTRIBUTING.md`
Include: how to file a bug, how to propose a feature, testing requirements (full suite must pass via `node --test`), and that zero new runtime dependencies is a hard constraint unless explicitly approved.

### 3d. Create `ROADMAP.md`
At minimum:
- v0.2.0: IRIS oracle, on-chain P&L, empirical calibration of regional profiles and settlement discounts
- v0.3.0: Omori regime backtest results merged, quality composite weight refit

### 3e. Add GitHub Actions

Three workflows. For `build.yml`, do not hardcode `--help` as the smoke test — verify the actual documented CLI invocation from the README and use that. The goal is: "documented entry point exits 0 on Node.js 20.x and 22.x."

- `test.yml`: run full test suite on every push to `master` and every PR
- `lint.yml`: run `eslint src/` on every PR
- `build.yml`: verify the documented CLI smoke path exits 0 on Node.js 20.x and 22.x

---

## Hard constraints

- **Do not tune any quantitative parameter values.** Group 2c adds labels; recalibration is a future sprint with empirical backing.
- **Do not add runtime npm dependencies.** All fixes use Node.js 20+ built-ins only.
- **Do not refactor module boundaries.** Fixes must be local to identified files.
- **Preserve JSDoc headers** in any modified file. Update them if behavior changes.
- **Verify paths and line numbers before acting.** This prompt is a hint, not ground truth.

---

## Definition of done

- [ ] Group 1: All five code fixes implemented, each with a test that would have caught the bug before this sprint
- [ ] Invariants verified: one event → one theatre resolution → one certificate; atomic export writes; fail-closed NaN handling
- [ ] Group 2: IRIS and on-chain P&L relabeled; every uncited magic number in the five files has a grouped `source:` or `TBD:` comment block
- [ ] Group 3: Four governance files created; three GitHub Actions workflows added; `build.yml` smoke path verified against live README
- [ ] Full test suite passes with no regressions
- [ ] `getState()` exposes `skipped_poll_count`, `consecutive_poll_failures`, `last_successful_poll`, `pending_exports`
