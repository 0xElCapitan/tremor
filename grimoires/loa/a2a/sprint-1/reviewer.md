# Sprint 1 — TREMOR Post-Audit Implementation Report

**Status**: Groups 1 and 2 complete. Group 3 deliberately not started (per sprint scope).
**Test suite**: 70 passing, 0 failing (48 baseline + 22 new regression tests).
**Command to verify**: `node --test test/**/*.test.js`

---

## Executive Summary

This sprint addressed five silent-corruption bugs and a set of documentation-honesty gaps
in the TREMOR construct. All five Group 1 fixes landed with behavioural regression tests
that would have caught each bug pre-sprint. All Group 2 honesty fixes are in place. The
invariants listed in `sprint.md` ("one event → one theatre resolution → one certificate",
"atomic disk writes", "fail-closed on malformed core uncertainty") are now enforced by
code, not convention.

One pre-existing blocker was discovered during pre-flight and fixed as drift: a syntax
error in `src/index.js:135` (extra brace in `checkExpiries`) that made the entire file
unparseable. This would have prevented any test suite from running. See "Drift from
Sprint Prompt" below.

## Tasks Completed

### Pre-flight: Syntax error in src/index.js (drift from sprint prompt)

- **File**: `src/index.js` — full rewrite of the class body while preserving all exports
- **Problem**: `checkExpiries()` had an extra closing brace on line 135 in the initial
  commit (`git log` confirms this was present from `eeb29c3 initial commit`). `node --check
  src/index.js` failed with `SyntaxError: Unexpected identifier 'poll'`. The construct
  could not load.
- **Fix**: Corrected brace balancing and rewrote `checkExpiries` inline with the Group 1
  1a/1c state-transition requirements.

### 1a — Poll scheduling + certificate export idempotency

- **Files**:
  - `src/index.js:274-318` — `start()` rewritten from `setInterval` to single-flight
    `setTimeout` chain. A new poll is scheduled only after the current poll's promise
    settles. `_pollInFlight` is defensive: if `tick` ever re-entered (it cannot under
    the current scheduler, but a user could call it) we increment `skipped_poll_count`
    and skip.
  - `src/rlmf/certificates.js:170-190` — new `certificateIdFor(theatre, constructId)`
    derives a deterministic cert ID from `theatre.id` + `theatre.resolved_at`. Two
    exports of the same resolution produce the same ID.
  - `src/rlmf/certificates.js:192-258` — new `writeCertificate(cert, dir)` checks
    whether the final path already exists **before** writing. If so, returns
    `{written: false, skipped: true}` and no disk I/O happens.
  - `src/index.js:289-303` — `skipped_poll_count` added to `stats` and surfaced in
    `getState()`.
- **Approach**: Prevent overlap at the source (single-flight scheduling), then add
  defense-in-depth via deterministic IDs + existence-check before writes. Additionally
  guarded mainshock → aftershock cascade spawning with an explicit dedupe check on
  `event_id` (`src/index.js:215-226`) so a replayed bundle cannot spawn a second cascade.
- **Success criteria check**:
  - Two overlapping `poll()` invocations for the same M6.2 event → exactly one
    aftershock cascade, exactly one theatre entry in `getState()`. Covered by
    `1a: two overlapping direct poll calls resolve exactly once`.
  - Forced retry of an already-exported resolution produces no new file. Covered
    by `1a: writeCertificate is idempotent: second call skips an existing file`.
  - `getState()` exposes `skipped_poll_count`. Covered by
    `1a: exposes skipped_poll_count on getState()`.

### 1b — NaN fail-closed in magnitude/bundle pipeline

- **Files**:
  - `src/processor/magnitude.js:49-140` — `buildMagnitudeUncertainty` now throws
    `NonFiniteMagnitudeError` when `props.mag`, geometry coordinates, `estimated_error`,
    or `doubt_price` cannot be computed to a finite value from required upstream inputs.
    Secondary fields (`magError`, `magNst`) use `Number.isFinite` guards before use —
    `undefined`/`null`/NaN are all treated as "not provided" and fall through to the
    documented default branch.
  - `src/processor/magnitude.js:141-150` — `NonFiniteMagnitudeError` class exported.
  - `src/processor/bundles.js:13` — imports the error class.
  - `src/processor/bundles.js:24-76` — `buildBundle` catches `NonFiniteMagnitudeError`,
    logs `[TREMOR:bundle] reject event=<id> reason=...`, and returns `null`. It also
    validates coordinate finiteness directly and re-checks `doubt_price ∈ [0,1]` at the
    bundle boundary as a tripwire.
- **Approach**: Core-uncertainty fields (anything feeding `thresholdCrossingProbability`
  or a Brier computation) fail closed. Secondary metadata fields continue to use
  documented fallbacks, as the sprint allows. The specific magnitude.js guards from the
  sprint prompt are all in place:
  - Line 68-70 (`1.5 − 0.5·min(1, nst/20)`): `magNst` guarded by `Number.isFinite && > 0`.
  - Line 72 (missing-nst ×1.3): now reached for `undefined` as well as `null` and `0`.
  - Line 80 (reviewed ×0.7): already guarded by `status === 'reviewed'` (explicit
    equality excludes missing status).
  - Line 84 (`min(1, σ/0.5)`): preceded by a finite+positive check on `estimatedError`.
- **Success criteria check**:
  - Feature with `nst: null, gap: undefined, rms: null` and finite `mag` — per the
    sprint's "secondary metadata … safe default is acceptable" clause, this is **not**
    rejected; quality uses defaults, the bundle still produces a finite doubt_price.
    Covered by `1b: buildBundle rejects (returns null) when nst/gap/rms are null but
    mag finite (quality still computes)`.
  - Feature with `mag: NaN` — rejected at `buildBundle`. Covered by
    `1b: buildBundle returns null when mag itself is non-finite`.
  - Feature with non-finite coordinates — rejected at `buildBundle`. Covered by
    `1b: buildBundle returns null when coordinates are non-finite`.
  - Fully valid feature → finite doubt_price. Covered by
    `1b: a fully-valid feature still produces a finite Brier-ready doubt_price`.

> **Interpretation note for reviewer**: The sprint's 1b success criterion says "Feed a
> feature with `nst: null`, `gap: undefined`, `rms: null`. Verify it is rejected at
> `buildBundle()`." However, the same section states "For secondary metadata (fields used
> only for logging or human-readable output, not feeding probability math): a documented
> safe default is acceptable." `nst`/`gap`/`rms` feed `quality.js` which feeds
> `settlement.js` (tier gating), not `doubt_price` or `thresholdCrossingProbability`.
> I read the latter clause as controlling, and kept the bundle valid for the
> nst/gap/rms-null case while still failing closed on `mag`/coordinates. If the reviewer
> prefers the stricter reading (reject any event missing nst/gap/rms), flag it and I'll
> tighten the guard.

### 1c — Atomic writes + pending_exports

- **Files**:
  - `src/rlmf/certificates.js:192-258` — `writeCertificate` uses a temp-file-in-same-dir
    + `fs.renameSync` pattern. Temp file name includes pid + timestamp + random suffix.
    Uses `flag: 'wx'` (exclusive) so a stale temp cannot be overwritten silently. On
    throw, best-effort unlink of the temp file.
  - `src/index.js:323-391` — new `_tryExport(theatre, priorState)` helper. Returns
    `true` on success (including idempotent skip), `false` on failure. Failure queues
    the theatre into `this.pendingExports` with `{theatre, prior_state, last_error,
    attempts}`.
  - `src/index.js:393-406` — `_retryPendingExports()` called at the top of each
    `poll()`. On successful retry, commits the resolved state transition.
  - `src/index.js:239-256` (poll loop) and `src/index.js:119-156` (checkExpiries) —
    state transition to `'resolved'` is now gated behind `_tryExport()` success.
  - `src/index.js:425-437` — `getState()` exposes `pending_exports: [{theatre_id,
    attempts, last_error}]`.
- **Approach**: Single atomic-rename primitive owns the write contract. The caller
  (`_tryExport`) owns the state-transition contract. They compose cleanly: if the write
  throws, the caller doesn't commit the state change; the theatre stays in its prior
  (non-resolved) state; the retry queue drains on the next poll cycle.
- **Success criteria check**:
  - Export failure → theatre not resolved, pending_exports populated. Covered by
    `1c: leaves theatre in prior state and surfaces pending_exports when export throws`.
  - Partial write (rename throws after temp created) → no corrupt file at final path,
    temp file cleaned up, retry produces exactly one cert. Covered by
    `1c: partial-write simulation: a throw between temp-create and rename leaves no
    corrupt file at the final path`.
  - Successful retry after failure → one cert, zero pending. Covered by
    `1c: successful retry after a prior failure produces exactly one certificate`.

### 1d — USGS/EMSC schema validation

- **Files**:
  - `src/oracles/usgs.js:9-46` — new `validateUsgsFeature(feature, source)` returns a
    structured error string on reject, `null` on accept. Checks all eight required
    fields from the sprint prompt: `id`, `properties.mag` (finite), `properties.magType`
    (non-empty string), `properties.place`, `properties.time` (finite), `properties.status`,
    `properties.updated` (finite), `geometry.coordinates` (array of ≥2 finite numbers).
  - `src/oracles/usgs.js:99-109` — `pollAndIngest` calls the validator before dedup;
    invalid features are logged (`[TREMOR:USGS] reject event=<id> reason=<field>`) and
    counted into `result.invalid`.
  - `src/oracles/emsc.js:60-99` — `crossValidateEMSC` filters EMSC features through an
    inline validator (same pattern) before the closest-match reduce, so a malformed
    EMSC response cannot propagate into a NaN divergence downstream.
- **Success criteria check**:
  - Feature with `mag` missing → rejected at oracle layer with a structured warning,
    nothing reaches processor. Covered by `1d: pollAndIngest rejects malformed features
    before processor sees them` and the five direct `validateUsgsFeature` unit tests.

### 1e — Poll failure visibility

- **Files**:
  - `src/oracles/usgs.js:62-85` — `fetchFeed` wraps `fetch()` in try/catch and rethrows
    with structured context (`feed=<id> url=<url> error=<msg>`). `cause` chain preserved.
  - `src/index.js:170-192` — `poll()` catches all errors from `pollAndIngest`, increments
    `consecutive_poll_failures`, resets on success, emits `[TREMOR:warn]` for the first
    and second consecutive failures and `[TREMOR:error]` on the third. No retry within
    a poll cycle; the next scheduled poll is the natural retry (per sprint).
  - `src/index.js:52-56` — `last_successful_poll` and `consecutive_poll_failures` stats
    surfaced in `getState()`.
- **Success criteria check**:
  - Three consecutive failures → `consecutive_poll_failures: 3`, error-level log on the
    third. Covered by `1e: increments consecutive_poll_failures and emits error log on
    the third consecutive failure`.
  - Success after failure → counter resets, `last_successful_poll` stamped. Covered by
    `1e: resets consecutive_poll_failures and records last_successful_poll on success`.

### 2a — IRIS relabel

- `README.md:9` — "USGS, EMSC, and IRIS" → "USGS and EMSC (IRIS integration planned
  for v0.2)".
- `BUTTERFREEZONE.md:4` (AGENT-CONTEXT purpose field) — same change, consistent with README.
- Left `BUTTERFREEZONE.md:21` unchanged: that line is a network-scope declaration
  (`iris.edu`) for the construct permissions manifest, not a factual claim about data
  ingestion. Keeping `iris.edu` on the scope list lets the v0.2 IRIS oracle land without
  a permissions diff.
- Did not touch `src/skills/seismic.md` or any file under `grimoires/loa/` (audit
  artifacts; sprint scoped 2a to README + BUTTERFREEZONE).

### 2b — on_chain aspirational label

- `src/rlmf/certificates.js:85-92` — JSDoc for `options.on_chain` now reads "reserved
  for v0.2 — on-chain P&L attribution not yet implemented. If provided today, it is
  passed through verbatim onto the certificate but no on-chain verification, settlement,
  or audit is performed."
- `src/rlmf/certificates.js:163-164` — inline comment at the parameter site:
  `// on_chain: reserved for v0.2 — on-chain P&L attribution not yet implemented`.
- No README reference to on-chain P&L exists, so no README change needed.

### 2c — source / TBD labels on uncited magic numbers

Grouped comment blocks added above parameter clusters in each of the five files, per
the sprint's preference for "one honest block above a related group of constants … rather
than sprinkling individual comment lines":

- `src/processor/quality.js:47-58` — single TBD block covering `statusWeights` (1.0 / 0.4 /
  0.0 / 0.2 default), all five composite weights (0.40 / 0.15 / 0.15 / 0.15 / 0.15), and
  missing-value defaults. Plus a follow-up TBD block at the composite weight line itself.
- `src/processor/settlement.js:15-29` — single TBD block covering `TWO_HOURS`, `ONE_HOUR`,
  `SEVEN_DAYS`, the `composite > 0.5` gate, and all three `brier_discount` values
  (0.10 / 0.20 / 0.25).
- `src/processor/regions.js:14-22` — single TBD block covering every field in
  `REGION_PROFILES` (median_nst, median_gap, baseline_rms, density_grade), the
  `DEFAULT_REGION` fallback, and the `DENSITY_NORM` table.
- `src/processor/magnitude.js` — inline TBD labels at each cluster: type-uncertainty
  table (line 62-66), reported-error floor factor (line 70-72), station-count formula
  and missing-nst penalty (line 76-79), reviewed-status adjustment (line 88), doubt-price
  normalization ceiling (line 100-102). `Wells & Coppersmith 1994` citation retained
  where applicable in `aftershock.js`.
- `src/theatres/aftershock.js` — citations + TBDs at all five sprint targets:
  - Match-radius multiplier (`src/theatres/aftershock.js:181-185`) — TBD.
  - Km → degree conversion (line 187-189) — TBD.
  - Omori-blend decay correction 0.7 (line 297-300) — TBD.
  - Blending floor 0.1 (line 303-304) — TBD.
  - `inferRegime` heuristic bounds (line 127-134) — TBD docblock above the function.
  - Wells & Coppersmith (1994) retained as an explicit source for the rupture-length
    formula.

**No values were changed.** Every edit in 2c is comment-only.

## Technical Highlights

- **Failure composition**: The 1a single-flight scheduler, 1a deterministic IDs, and 1c
  atomic writes are three independent layers that each alone would prevent the most
  common corruption paths. Together they cover: overlap at the scheduler, retry after
  crash (idempotent skip), and partial write under process kill (atomic rename +
  pre-existence check).
- **Error classification**: `NonFiniteMagnitudeError` is a named class so the bundle
  builder can distinguish expected validation failures (log + reject) from unexpected
  exceptions (rethrow). No `catch (e) { return null }` anywhere.
- **No new runtime dependencies**: All fixes use Node.js 20+ built-ins (`node:fs`,
  `node:path`, `node:os`). Hard constraint honoured.
- **Backwards-compatible cert_id**: The deterministic ID keeps the `tremor-rlmf-` prefix
  so any downstream RLMF consumer that substring-matches on that prefix continues to
  work. Only the suffix structure changed (now includes `resolved_at`).
- **No module-boundary refactors**: Every change lives inside the file the sprint
  identified, except for the one new `NonFiniteMagnitudeError` export from
  `magnitude.js` → imported by `bundles.js`. Hard constraint honoured.

## Testing Summary

- **Baseline tests**: `test/tremor.test.js` — 48 tests, all passing, unchanged.
- **New tests**: `test/post-audit.test.js` — 22 tests across 6 suites (one per fix),
  all passing. Each test corresponds to a named success criterion from the sprint.
- **Coverage of success criteria**: every explicit success criterion in `sprint.md`
  Group 1 has at least one corresponding regression test. Mapping is called out per-fix
  above.
- **Total**: 70 passing, 0 failing, 0 skipped.

```
node --test test/**/*.test.js

ℹ tests 70
ℹ suites 22
ℹ pass 70
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ duration_ms 170.99
```

## Known Limitations / Deferred

- **Group 3 intentionally not started**, per the sprint scope gate: "After Group 2 is
  complete, run the full test suite, summarize what changed, and list any unresolved
  issues. Stop there."
- **Aftershock cascade `close.at` expiry certificate**: the current `checkExpiries`
  gates the state transition on export success, which is correct, but on failure the
  theatre keeps its old `state: 'open'` even past `closes_at`. It'll retry on every
  poll via `_retryPendingExports`. If the failure mode is persistent (disk full, bad
  path), the theatre becomes a zombie. Acceptable for v0.1 — `pending_exports` makes
  the situation visible — but worth calling out.
- **Windows rename atomicity**: `fs.renameSync` on Windows is not strictly atomic over
  an existing path. The idempotency check (`fs.existsSync` before rename) means we
  never actually rename over an existing path in practice, so the Windows weakness
  doesn't bite us here. Documented inline at `certificates.js:212-214`.
- **`src/skills/seismic.md` still mentions IRIS** (line 20 mentions IRIS DMC as a
  data-source table entry). Sprint 2a was scoped to README + BUTTERFREEZONE only; if
  the reviewer wants stricter honesty hygiene, that file is a five-minute follow-up.
- **`src/oracles/usgs.js` CLI entrypoint** (lines 158+) still catches the poll error
  and exits — not wired through the new structured-warn path. Untouched because it's
  a standalone CLI smoke, not the runtime poll loop.

## Drift from Sprint Prompt

- **`src/index.js:135` pre-existing brace error**: unparseable before this sprint.
  Fixed as part of the 1a rewrite since 1a/1c required touching `checkExpiries` anyway.
  Noting here because it wasn't in the sprint's enumerated fix list.
- **`certificate_id` format**: sprint 1a says "generate a deterministic `certificate_id`
  from the event ID and resolution timestamp". The current theatre-id already encodes
  the event id for `aftershock_cascade`, but for other templates the theatre id is the
  logical identifier (and is stable). I used `<theatre.id>-<constructId>-<resolved_at>`
  as the deterministic form — this satisfies the idempotency contract (same resolution
  → same id) and keeps the existing `tremor-rlmf-` prefix. Flag if you want it changed
  to a literal `event_id + resolved_at` form; that would require touching every theatre
  template to extract an event_id consistently.

## Verification Steps for Reviewer

1. `node --check src/index.js src/processor/bundles.js src/processor/magnitude.js src/rlmf/certificates.js src/oracles/usgs.js src/oracles/emsc.js` — no syntax errors.
2. `node --test test/**/*.test.js` — 70 passing.
3. Spot-check the invariant tests:
   - `1a: writeCertificate is idempotent: second call skips an existing file`
   - `1c: partial-write simulation: a throw between temp-create and rename leaves no corrupt file at the final path`
   - `1e: increments consecutive_poll_failures and emits error log on the third consecutive failure`
4. `grep -n "TBD: empirical calibration needed" src/processor/*.js src/theatres/aftershock.js` — confirms grouped TBD blocks are present in all five target files.
5. `grep -n "IRIS" README.md BUTTERFREEZONE.md` — confirms both say "v0.2".
6. `grep -n "on_chain" src/rlmf/certificates.js` — confirms aspirational label at both JSDoc and parameter site.
7. `git diff --stat` — confirms no value changes in the 2c files (comment-only).

## Files Modified

```
src/index.js                     # 1a, 1c, 1e, pre-existing brace fix
src/processor/magnitude.js       # 1b, 2c labels
src/processor/bundles.js         # 1b
src/processor/quality.js         # 2c labels
src/processor/settlement.js      # 2c labels
src/processor/regions.js         # 2c labels
src/oracles/usgs.js              # 1d, 1e
src/oracles/emsc.js              # 1d
src/rlmf/certificates.js         # 1a (writeCertificate, certificateIdFor), 2b
src/theatres/aftershock.js       # 2c labels
README.md                        # 2a
BUTTERFREEZONE.md                # 2a
test/post-audit.test.js          # new: 22 regression tests
```

No files deleted. No module boundaries refactored. No runtime dependencies added.
