# Sprint 2b Implementation Report

**Sprint**: Calibration Sprint — Prompt B v2 (Omori Regime Backtest, Study 1, Protocol v2.0)
**Date**: 2026-04-06
**Status**: Complete — 18 sequences processed, diagnostic report generated in run-6/

## Executive Summary

Updated and ran the Omori backtest harness (Run 6) against protocol v2.0 with 18 historical earthquake sequences. The harness was expanded from 14 to 18 sequences, adding primary/secondary intraplate split (5 primary + 2 secondary), international reviewed-coverage checks, mainshock identity verification, and an 8-section diagnostic report per protocol requirements.

**Headline findings:**
1. **Subduction: Pass (n=3)** — 100% bucket hit rate, 6.9% mean relative error. K=0.220 refit from Run 4 validated. Maule within 0.0% error.
2. **Transform: Pass (n=2)** — 100% bucket hit rate, 16.9% mean relative error. K=0.291 refit validated. Opposite-direction errors suggest good centering.
3. **Intraplate: Fail (n=5)** — 20% bucket hit rate, 59.2% mean relative error. K=0.240 needs refit. Bias diagnosis suspects K (productivity) — 4/5 sequences show uniform bias.
4. **International coverage**: Petermann (100%) and Botswana (100%) both passed reviewed-status check — no fallback substitution needed.
5. **No truncation**: No FDSN pagination triggered. No NON-COMPARABLE sequences.
6. **No verification failures**: All mainshock event IDs verified within protocol tolerances.
7. **inferRegime misassignments**: Equatorial Atlantic and Puerto Rico assigned `transform` instead of `default` (inference sequences, not regime-fit — does not contaminate primary verdicts).

## Tasks Completed

### Pre-flight Verification

| Check | Result |
|-------|--------|
| Protocol version | v2.0 confirmed |
| Run directories | run-5/ exists (14 files + report), run-6/ created |
| Interface exports | `omoriExpectedCount`, `countToBucketProbabilities`, `inferRegime` exported at aftershock.js:426 |
| `OMORI_OUTPUT_DIR` support | Already present |
| `src/` modification | None — zero changes to source files |

### File Modified: `scripts/omori-backtest.js`

**Changes:**

1. **SEQUENCES array** (lines 36-131): Expanded from 14 to 18 sequences across 6 categories:
   - Subduction regime-fit: 3 (IDs 1-3)
   - Transform regime-fit: 2 (IDs 4-5)
   - Intraplate primary: 5 (IDs 6-10, including Wells promoted from inference, Petermann, Botswana)
   - Intraplate secondary: 2 (IDs 11-12, Lincoln + Monte Cristo)
   - Regime-inference: 3 (IDs 13-15)
   - Volcanic: 3 (IDs 16-18)

2. **`intraplate_tier` field**: Added to all sequence definitions and output JSON. Values: `"primary"`, `"secondary"`, or `null`.

3. **`verifyMainshock()` function** (lines 176-193): Validates fetched mainshock identity against protocol expected coordinates with tolerances: lat/lon within 0.5 deg, magnitude within 0.3, depth within 10km. Halts sequence on failure per protocol.

4. **`checkReviewedCoverage()` function** (lines 231-258): Fetches aftershock catalog WITHOUT `reviewstatus=reviewed` filter, computes reviewed percentage. Applied to Petermann (us10005iyk) and Botswana (us10008e3k). Threshold: 80%.

5. **Null handling** (lines 283, 390): Changed `Infinity` to `null` for relative error when actual count is zero, per protocol.

6. **`aftershock_status` field**: One of `"complete"`, `"truncated-paginated"`, `"non-comparable"`, `"coverage-uncertain"`.

7. **Diagnostic report** (lines 485-718): Rewritten with all 8 protocol-required sections, n= counts on all verdicts, primary/secondary intraplate split.

### Files Created

| File | Purpose |
|------|---------|
| `grimoires/loa/calibration/omori-backtest/run-6/diagnostic-report.md` | 8-section diagnostic report per protocol v2.0 |
| `grimoires/loa/calibration/omori-backtest/run-6/sequence-01.json` through `sequence-18.json` | Per-sequence JSON with full output format |

### No Files Modified in `src/` or `test/`

Per sprint hard constraints, zero changes to source or test files. No new runtime npm dependencies.

## Technical Highlights

### Architecture
- All Omori math via TREMOR's own exported functions — no duplicate integration logic.
- M>=6.0: `createAftershockCascade()` (full theatre path). M<6.0: `computeDirectOmori()` (direct function calls).
- 6 of 18 sequences used direct path (Mineral M5.8, Magna M5.7, Wells M5.9, Lincoln M5.8, La Palma M4.6, Bardarbunga M5.6).

### Backtest Results (Run 6)

| # | Sequence | Role/Tier | Regime | Projected | Actual | Bucket | Rel Error |
|---|----------|-----------|--------|-----------|--------|--------|-----------|
| 1 | Tohoku | regime-fit | subduction | 1128.6 | 1422 | 21+/21+ hit | -20.6% |
| 2 | Maule | regime-fit | subduction | 672.3 | 672 | 21+/21+ hit | 0.0% |
| 3 | Iquique | regime-fit | subduction | 238.5 | 238 | 21+/21+ hit | 0.2% |
| 4 | Ridgecrest | regime-fit | transform | 57.4 | 67 | 21+/21+ hit | -14.3% |
| 5 | El Mayor | regime-fit | transform | 68.2 | 57 | 21+/21+ hit | 19.6% |
| 6 | Mineral VA | primary | intraplate | 3.4 | 2 | 3-5/0-2 miss | 70.0% |
| 7 | Magna UT | primary | intraplate | 2.8 | 4 | 3-5/3-5 hit | -30.0% |
| 8 | Wells NV | primary | intraplate | 4.0 | 8 | 3-5/6-10 miss | -50.0% |
| 9 | Petermann | primary | intraplate | 4.8 | 6 | 3-5/6-10 miss | -20.0% |
| 10 | Botswana | primary | intraplate | 11.3 | 5 | 11-20/3-5 miss | 126.0% |
| 11 | Lincoln | secondary | intraplate | 3.4 | 2 | 3-5/0-2 miss | 70.0% |
| 12 | Monte Cristo | secondary | intraplate | 11.3 | 23 | 11-20/21+ miss | -50.9% |
| 13 | Kumamoto | inference | transform | 48.3 | 45 | 21+/21+ hit | 7.3% |
| 14 | Eq. Atlantic | inference | transform* | 57.4 | 5 | 21+/3-5 miss | 1048.0% |
| 15 | Puerto Rico | inference | transform* | 17.1 | 35 | 11-20/21+ miss | -51.1% |
| 16 | Kilauea | volcanic | transform | 40.6 | 8 | 21+/6-10 miss | 407.5% |
| 17 | La Palma | volcanic | default | 37.1 | 0 | 21+/0-2 miss | N/A |
| 18 | Bardarbunga | volcanic | default | 208.5 | 1 | 21+/0-2 miss | 20750.0% |

\* Misassigned — expected `default`

### Per-Regime Verdicts (Primary Only)

| Regime | n | Bucket Hit Rate | Mean Rel Error | Verdict |
|--------|---|-----------------|----------------|---------|
| subduction | 3 | 100.0% | 6.9% | **Pass** (n=3) |
| transform | 2 | 100.0% | 16.9% | **Pass** (n=2) |
| intraplate | 5 | 20.0% | 59.2% | **Fail** (n=5) |

### Bias Diagnosis Summary

| Regime | Suspected Parameter | Evidence |
|--------|-------------------|----------|
| subduction | **c** (time offset) | 2/3 sequences show early-time over-prediction at 6h that resolves by 72h |
| transform | **K** (productivity) | 2/2 sequences show uniform bias across all windows |
| intraplate | **K** (productivity) | 4/5 sequences show uniform bias; mixed direction suggests K centering issue |

### International Coverage Check

| Sequence | Reviewed | Total | Coverage | Threshold | Result |
|----------|----------|-------|----------|-----------|--------|
| Petermann (us10005iyk) | 6 | 6 | 100% | 80% | PASS |
| Botswana (us10008e3k) | 5 | 5 | 100% | PASS |

No fallback substitution needed.

## Testing Summary

**Test approach:** Empirical backtest against USGS FDSN live catalog. The harness IS the test — it validates TREMOR's Omori prior against observed seismicity.

**Results:** 18/18 sequences completed. 0 errors. 0 verification failures. 0 truncation issues. 0 coverage issues.

**Verification commands:**
```bash
# Reproduce the run:
OMORI_OUTPUT_DIR=grimoires/loa/calibration/omori-backtest/run-6 node scripts/omori-backtest.js

# Verify all 19 output files exist (18 sequences + diagnostic report):
ls grimoires/loa/calibration/omori-backtest/run-6/

# Verify prior runs untouched:
md5sum grimoires/loa/calibration/omori-backtest/run-5/sequence-01.json
# Expected: 325d78ee237e78e92c5e2ed1a2d9ecfd

# Spot-check a sequence JSON:
node -e "const r=JSON.parse(require('fs').readFileSync('grimoires/loa/calibration/omori-backtest/run-6/sequence-02.json'));console.log(r.relative_error, r.bucket_hit, r.aftershock_status, r.intraplate_tier)"
# Expected: 0 true complete null
```

## Known Limitations

1. **Sequence count**: Sprint references "19 sequences" but protocol v2.0 has 18 unique sequences (Wells promoted from inference to primary, struck through in inference list). All 18 ran.
2. **FDSN live data**: Results depend on USGS catalog state at query time. Minor count differences possible on re-run.
3. **Volcanic regime assignment**: `inferRegime()` has no volcanic detection — Kilauea assigned `transform`, La Palma and Bardarbunga assigned `default`. Expected limitation.
4. **Intraplate heterogeneity**: Botswana (+126%) has different character than other 4 intraplate sequences. Refit sprint should examine magnitude-dependent productivity scaling.

## Protocol Adherence

1. Protocol version v2.0 confirmed before execution
2. Mainshock definition: largest reviewed event per protocol; verified against expected coordinates
3. 72-hour window: half-open interval [start, end) per protocol
4. Count rules: M>=4.0, reviewed only, within TREMOR matchRadius, excluding mainshock and non-tectonic
5. All scoring metrics computed (projected count, bucket hit, relative error, log error, Brier)
6. Partial-window analysis at t=6h, t=24h, t=72h per protocol bias diagnosis order
7. Truncation rule: `limit=20000` with pagination support
8. International review-status check applied to Petermann and Botswana
9. Primary/secondary intraplate split enforced — secondary excluded from verdicts
10. No protocol definitions adjusted after seeing results
11. No parameter values modified; no `src/` files changed
12. 500ms delay between all FDSN queries

## Recommended Next Steps

1. **Intraplate K refit** (highest priority): Fail at n=5. K=0.240 produces mixed bias (3 under, 2 over). Botswana is an outlier — consider excluding or examining magnitude-dependent effects before refitting.
2. **Subduction c investigation**: Pass verdict, but 2/3 sequences show early-time over-prediction at 6h. Reducing `c` from 0.05 may improve early-time accuracy without hurting 72h performance.
3. **inferRegime boundaries**: Equatorial Atlantic and Puerto Rico misassigned. Caribbean bbox catches Puerto Rico incorrectly; mid-ocean ridge zone catches equatorial Atlantic.
4. **STOP**: Parameter refit is a separate sprint. This report awaits review.
