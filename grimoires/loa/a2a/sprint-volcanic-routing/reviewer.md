# Implementation Report: Sprint Volcanic Routing

**Sprint**: Volcanic Regime Routing
**Date**: 2026-04-06
**Status**: COMPLETE — all acceptance criteria met

---

## Executive Summary

Implemented volcanic event routing away from Aftershock Cascade and toward Swarm Watch. Added `assessAftershockApplicability()` routing helper, updated `createAftershockCascade` to return structured skip results (replacing bare `null`), updated `src/index.js` to record routing decisions in machine-readable state, validated Swarm Watch against 3 pinned volcanic sequences, and updated `BUTTERFREEZONE.md`. Conservative routing policy: no auto-spawn of Swarm Watch — operator decides. **74/74 tests pass** with zero regressions.

---

## Tasks Completed

### Step 1: `assessAftershockApplicability()` helper

- **File**: `src/theatres/aftershock.js:426-462`
- **Approach**: New exported pure function. Takes `{ regime, mag, lat, lon, depth_km }`, returns `{ omoriApplicable, routeTo, manualReview, volcanicSubtype, reason }`. Two volcanic subtypes: `'swarm'` (M<6.0, no manual review) and `'boundary'` (M≥6.0, flags manual review). Non-volcanic regimes return `standard_tectonic`.
- **Contract preserved**: `inferRegime` return type unchanged — still a plain string. Routing policy is a separate concern.

### Step 2: Structured skip results in `createAftershockCascade`

- **File**: `src/theatres/aftershock.js:213-243`
- **Changes**:
  - Added internal `skipResult(reason, detail)` helper (not exported)
  - M<6.0 guard: `return null` → `return skipResult('magnitude_below_threshold', { mainMag })`
  - Volcanic routing: calls `assessAftershockApplicability()`, returns `skipResult('volcanic_routing', routing)` when `!routing.omoriApplicable`
- **Contract**: `createAftershockCascade` now returns either a theatre object or `{ skipped: true, reason, detail }`. Bare `null` is no longer returned for any skip path.

### Step 3: `src/index.js` auto-spawn logic + routing decisions

- **File**: `src/index.js:44` — `_routingDecisions` array initialized in constructor
- **File**: `src/index.js:238-267` — M≥6.0 auto-spawn block updated to handle `cascadeResult?.skipped`
- **File**: `src/index.js:85-87` — `openAftershockCascade()` updated to handle structured skip
- **File**: `src/index.js:474` — `getState()` now exposes `routing_decisions`
- **Routing decision shape**: `{ event_id, timestamp, reason, detail, swarm_watch_recommended, manual_review_required }`
- **Retention**: Capped at 100 most recent decisions to prevent unbounded growth
- **Policy**: No Swarm Watch auto-spawn — conservative. Logs recommendation, operator decides.

### Step 4: Swarm Watch volcanic sequence validation

- **Script**: `scripts/validate-volcanic-swarm-watch.mjs`
- **Results**: `grimoires/loa/calibration/volcanic-swarm-watch-validation.md`

| Sequence | Events | Label | Notes |
|----------|--------|-------|-------|
| 2018 Kīlauea LERZ | 71 | **operationally useful** | Opened, 59 updates, p peaked at 0.700, b-value dropped to 0.31 (strong escalation) |
| 2021 La Palma onset | 0 | **NON-COMPARABLE** | Precursor swarm catalogued by IGN at M<3.0, not in USGS FDSN |
| 2014 Bárðarbunga intrusion | 0 | **NON-COMPARABLE** | Catalogued by IMO, appears in USGS only after Aug 23 |

**Conclusion**: Swarm Watch is operationally ready for USGS-covered volcanic systems (Hawaii-type). A follow-on calibration sprint is warranted to integrate IGN/IMO feeds or lower the FDSN magnitude floor for European volcanic zones.

### Step 5: BUTTERFREEZONE.md update

- **File**: `BUTTERFREEZONE.md:185-189` — Added "Volcanic Routing" section with routing policy description

---

## Test Changes

| Change | File | Description |
|--------|------|-------------|
| Updated assertion | `test/tremor.test.js:440-443` | `'returns null for M<6.0'` → `'returns structured skip for M<6.0'` — checks `result?.skipped === true` and `result.reason === 'magnitude_below_threshold'` |
| New test | `test/tremor.test.js:467-472` | `'returns structured skip for volcanic regime events'` — verifies `volcanic_routing` skip with `routeTo: 'swarm_watch'` |
| New suite | `test/tremor.test.js:475-500` | `assessAftershockApplicability` — 3 tests: volcanic swarm (M<6), volcanic boundary (M≥6), standard tectonic |

**Total**: 74 tests across 23 suites (was 70/22). Zero regressions.

---

## Definition of Done Checklist

- [x] `inferRegime` return type unchanged — still a plain string
- [x] `assessAftershockApplicability()` exported from `aftershock.js` with volcanic subtype distinction
- [x] `createAftershockCascade` returns structured skip result (not bare null) for all skip reasons
- [x] All existing `=== null` call sites updated to handle structured skip
- [x] `src/index.js` records routing decisions in `this._routingDecisions` and exposes via `getState()`
- [x] No Swarm Watch auto-spawn — conservative policy documented in comments
- [x] Swarm Watch validated against 3 pinned volcanic sequences, results in calibration folder
- [x] `BUTTERFREEZONE.md` routing note added
- [x] Full test suite passes with zero regressions (74/74)
- [x] `assessAftershockApplicability` has at least 3 inline test assertions
- [x] No K, c, p, bath_delta, or exponent values changed
- [x] Summary: Swarm Watch produces meaningful output for USGS-covered volcanic systems. Needs its own calibration sprint for non-USGS-covered systems (IGN/IMO feed integration).

---

## Verification Steps

```bash
# Run full test suite (expect 74/74 pass)
node --test test/tremor.test.js test/post-audit.test.js

# Verify routing_decisions exposed in getState()
node -e "import { TremorConstruct } from './src/index.js'; const t = new TremorConstruct(); console.log('routing_decisions:', t.getState().routing_decisions);"

# Verify assessAftershockApplicability export
node -e "import { assessAftershockApplicability } from './src/theatres/aftershock.js'; console.log(assessAftershockApplicability({ regime: 'volcanic', mag: 5.0, lat: 19.4, lon: -155.3, depth_km: 5 }));"
```

---

## Hard Constraints Verified

- [x] Zero new runtime npm dependencies
- [x] `inferRegime` return type unchanged (plain string)
- [x] K, c, p, bath_delta, 0.75 exponent values unchanged
- [x] Swarm Watch detection logic unchanged
- [x] `src/processor/regions.js` untouched
- [x] All existing `// source:` and `// TBD:` comment blocks preserved
