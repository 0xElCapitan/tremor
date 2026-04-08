# Implementation Report: Sprint GEOFON Oracle

**Sprint**: sprint-geofon-oracle
**Date**: 2026-04-08
**Status**: COMPLETE — all acceptance criteria met

---

## Executive Summary

Added GEOFON (GFZ German Research Centre) as a permanent third cross-validation source alongside EMSC. Created `src/oracles/geofon.js` with pipe-delimited text parsing, updated `src/index.js` to run EMSC + GEOFON in parallel via `Promise.allSettled`, and changed `bundle.cross_validation` from a flat single-source shape to an aggregate multi-source shape. **81/81 tests pass** (74 baseline + 7 new) with zero regressions.

---

## Shape Change: `bundle.cross_validation`

**Previous shape** (EMSC-only, flat):

```js
{
  sources_checked: ['EMSC'],
  magnitude_readings: { USGS: 5.2, EMSC: 5.1 },
  max_divergence: 0.1,
  paradox_flag: false,
  matched: true,
  emsc_event_id: 'emsc-abc123',
}
```

**New shape** (aggregate multi-source):

```js
{
  sources_checked: ['EMSC', 'GEOFON_GFZ'],
  max_divergence: 0.4,          // max across all sources
  paradox_flag: true,            // any source divergence >= 0.3
  emsc: { /* full EMSC result or null */ },
  geofon: { /* full GEOFON result or null */ },
}
```

Individual source results are nested under `emsc` and `geofon` keys. The top-level `sources_checked`, `max_divergence`, and `paradox_flag` are aggregated. Either source may be `null` if it failed or returned no match — the other source still populates the aggregate.

---

## Tasks Completed

### T1: `src/oracles/geofon.js` (new file)

- **File**: `src/oracles/geofon.js` (96 lines)
- **Approach**: New async function `crossValidateGEOFON(feature)` that queries GEOFON FDSN with `start`/`end` params (not `starttime`/`endtime`), parses pipe-delimited text response, and returns structured result with divergence math.
- **Key details**:
  - Time window: ±60s (tighter than EMSC's ±120s, per sprint spec)
  - Spatial window: 1° maxradius
  - Response parsing: splits on `\n`, filters `#` header and blank lines, splits data on `|`
  - Returns `null` on: HTTP error, empty body, no data lines, NaN magnitude, network error
  - Never throws — all failures are graceful `null` returns
  - `paradox_flag: true` when `divergence >= 0.3`
  - Divergence rounded to 4 decimal places: `Math.round(Math.abs(...) * 10000) / 10000`

### T2: `src/index.js` cross-validation block

- **File**: `src/index.js:15` — added GEOFON import
- **File**: `src/index.js:209-243` — replaced EMSC-only block with parallel EMSC + GEOFON
- **File**: `src/index.js:530` — added `crossValidateGEOFON` re-export
- **Approach**:
  - Extracted `featureLike` to avoid duplicating the feature construction
  - `Promise.allSettled` ensures one source failure doesn't block the other
  - Aggregate shape merges `sources_checked`, computes `max_divergence`, and derives `paradox_flag` from any source divergence >= 0.3
  - `emsc` or `geofon` keys are `null` when that source fails or returns no match

### T3: `test/geofon.test.js` (new file)

- **File**: `test/geofon.test.js` (7 tests in 1 suite)
- **Test names** (exact as specified):
  1. `test_geofon_valid_response_returns_cross_validation_result`
  2. `test_geofon_divergence_gte_0_3_sets_paradox_flag`
  3. `test_geofon_divergence_lt_0_3_no_flag`
  4. `test_geofon_malformed_response_returns_null`
  5. `test_geofon_network_error_returns_null`
  6. `test_geofon_no_data_lines_in_response_returns_null`
  7. `test_cross_validation_sources_checked_contains_both_emsc_and_geofon`
- **Approach**: `globalThis.fetch` mocked per-test. Test 7 uses URL-based routing to return EMSC JSON for `seismicportal.eu` and GEOFON text for `geofon.gfz.de`. No live network calls.

### T4: `BUTTERFREEZONE.md` updates

- **File**: `BUTTERFREEZONE.md:150` — GEOFON GFZ row added to OSINT Feeds table
- **File**: `BUTTERFREEZONE.md:43` — `crossValidateGEOFON` added to Key Capabilities
- **File**: `BUTTERFREEZONE.md:157` — `src/oracles/` count updated from 2 to 3

---

## Known Limitations

- **`evidenceClass = 'cross_validated'` upgrade path unreachable**: The upgrade in `src/processor/bundles.js:70–77` reads `config.crossValidation` at bundle-build time, but cross-validation calls happen after `buildBundle` returns. The upgrade path is currently unreachable for both EMSC and GEOFON. Do not fix in this sprint — candidate for Sprint B.
- **GEOFON 204 on narrow time windows**: GEOFON returns HTTP 204 (no content) when no events match the query window. The oracle handles this correctly (non-200 → `null`), but it means GEOFON cross-validation will show `null` for events in quiet periods. This is correct behavior.

---

## Testing Summary

| Suite | Tests | Status |
|-------|-------|--------|
| Baseline (`test/tremor.test.js` + `test/post-audit.test.js`) | 74 | All pass |
| New (`test/geofon.test.js`) | 7 | All pass |
| **Total** | **81** | **81/81 pass** |

---

## Hard Constraints Verified

- [x] Zero new runtime dependencies
- [x] `src/processor/bundles.js` untouched
- [x] No files in `src/theatres/` modified
- [x] `src/rlmf/certificates.js` untouched
- [x] GEOFON endpoint exactly `https://geofon.gfz.de/fdsnws/event/1/query`
- [x] GEOFON uses `text` format (pipe-delimited), not `geojson`
- [x] Divergence threshold for `paradox_flag` is ≥ 0.3
- [x] All 74 existing tests pass unchanged
- [x] All `// source:` and `// TBD:` comments preserved

---

## Definition of Done Checklist

- [x] Preflight checks passed (74 baseline tests verified, GEOFON endpoint confirmed live — 204)
- [x] `node --test test/tremor.test.js` → 74/74 pass
- [x] `node --test test/post-audit.test.js` → all pass
- [x] `node --test test/geofon.test.js` → 7/7 pass
- [x] `crossValidateGEOFON` importable from `src/index.js`
- [x] `bundle.cross_validation` shape change documented (see above)
- [x] `BUTTERFREEZONE.md` updated with GEOFON oracle
- [x] `package.json` has zero new entries in `dependencies` or `devDependencies`
- [x] Implementation report saved to `grimoires/loa/a2a/sprint-geofon-oracle/reviewer.md`

---

## Verification Steps

```bash
# Run all tests (expect 81/81 pass)
node --test test/tremor.test.js test/post-audit.test.js test/geofon.test.js

# Verify GEOFON re-export from index.js
node -e "import { crossValidateGEOFON } from './src/index.js'; console.log('type:', typeof crossValidateGEOFON);"

# Verify zero new dependencies
node -e "import pkg from './package.json' with { type: 'json' }; console.log('deps:', Object.keys(pkg.default.dependencies ?? {}));"
```
