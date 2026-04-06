# Sprint 2a Implementation Report

**Sprint**: Calibration Sprint — Prompt A (Citation Pass + Data Pipeline Studies 2–6)
**Date**: 2026-04-05
**Status**: Partially complete — Studies 2, 3, 5 blocked by data-provenance gate

## Executive Summary

Completed Study 6 (citation pass on all five source files) and Study 4 (regional profile recalibration against USGS FDSN data). Studies 2, 3, and 5 are **BLOCKED** because the USGS FDSN API does not preserve automatic-stage event records — the matched-window proxy approach cannot work on historical data. A detailed blocker report has been written.

**Most critical finding**: The hardcoded regional profile values in `regions.js` deviate from measured USGS medians by 40–450% across nearly every field and region. The `baseline_rms` values are systematically underestimated by 2–5× across all regions.

## Studies Completed

### Study 6 — Citation Pass ✅

**Files modified** (comments only, zero value changes):

| File | Changes |
|------|---------|
| `src/processor/quality.js` | Added TBD for missing-value defaults (gap=0.3, rms=0.3 at lines 30, 39). Updated existing TBD references to point to `grimoires/loa/calibration/`. |
| `src/processor/settlement.js` | Updated TBD reference block to point to `grimoires/loa/calibration/settlement-findings.md`. |
| `src/processor/regions.js` | Updated TBD reference to point to `grimoires/loa/calibration/regional-profiles-findings.md`. Added bbox note re rectangular approximation of tectonic provinces (GCMT/Flinn-Engdahl). |
| `src/processor/magnitude.js` | Added `TBD: plausible per literature, no specific citation` tag on `MAG_TYPE_UNCERTAINTY`. Added `source: standard normal z₀.₉₇₅` for 1.96 multiplier. Added `source: Abramowitz & Stegun §26.2.17` for normalCDF. Updated all TBD references to `grimoires/loa/calibration/`. |
| `src/theatres/aftershock.js` | Added `source: Omori (1894), Utsu (1961)` for Omori-Utsu law. Added `source: Båth (1965)` for Båth's law. Added `source: Reasenberg & Jones (1989)` for 0.75 productivity exponent. Updated all TBD references to `grimoires/loa/calibration/`. |

**Tests**: 70/70 pass (zero regressions).

### Data-Provenance Gate ⛔

**Result**: BLOCKED — automatic-stage data not recoverable from USGS FDSN.

- `reviewstatus=automatic` returns 0 events for all historical periods (2020–2026)
- Even recent events (< 7 days old) show 0 automatic-status records
- `includesuperseded=true` on detail endpoint: all origin versions show `review-status: reviewed`
- No per-event automatic-stage magnitude is preserved in the standard API

**Output**: `grimoires/loa/calibration/data-provenance-blocker.md`

### Study 4 — Regional Profile Recalibration ✅

**Script**: `scripts/calibrate-regions.js`
**Data**: 15,320 USGS FDSN M4.5+ reviewed earthquakes across 8 regions (2021–2026)
**Output**: `grimoires/loa/calibration/regional-profiles-findings.md`

**Key findings** (all DATA-FACTUAL):

| Region | Most Striking Deviation |
|--------|------------------------|
| US West Coast | `median_gap` 35° → 127.5° (+264%) |
| Japan | `median_nst` 200 → 77 (-61%), `baseline_rms` 0.12 → 0.66 (+450%) |
| Mid-Atlantic Ridge | `median_nst` 8 → 39 (+388%), `median_gap` 180° → 74° (-59%) |
| Alaska / Aleutians | `median_nst` 35 → 121 (+246%) |
| Central Asia | `median_nst` 30 → 78 (+160%) |

**Systemic pattern**: `baseline_rms` is underestimated by 2–5× across ALL regions. The USGS `rms` field (travel-time residual in seconds) has typical medians of 0.63–0.75s, not the 0.12–0.60s hardcoded. This likely stems from confusion between RMS in different contexts.

**20 out of 24 field-region pairs** exceed the 15% deviation threshold.

### Studies 2, 3, 5 — BLOCKED ⛔

| Study | Reason |
|-------|--------|
| Study 2 (Doubt-price CI) | Requires automatic-stage magnitude to check CI coverage against reviewed values |
| Study 3 (Settlement discount) | Requires automatic→reviewed Δmag distribution |
| Study 5 (Quality weights) | Requires automatic-stage events to label reviewed-status prediction |

## Files Written to `grimoires/loa/calibration/`

1. `data-provenance-blocker.md` — detailed blocker report with test methodology
2. `regional-profiles-findings.md` — per-region comparison tables and recommendations

## Files Written to `scripts/`

1. `calibrate-regions.js` — FDSN query script for Study 4

## Anomalies

1. **FDSN offset is 1-based** (not 0-based). Initial run returned HTTP 400 on all queries; fixed by starting offset at 1.
2. **South Pacific antimeridian crossing**: The South Pacific bbox (-190→-150 in lon, but stored as 160→-150) required splitting into two queries. Handled correctly.
3. **`rms` systematic deviation**: The universally high `baseline_rms` deviation across all regions suggests the original estimates may have been based on a different RMS metric or a different event population. This warrants investigation before applying the recommended replacements.
4. **`nst` field semantics**: The USGS FDSN `nst` is "number of seismic stations used to determine the earthquake location" (per FDSN spec). Regional networks (JMA, etc.) may use more stations locally than appear in the USGS global catalog. The Japan `median_nst` of 77 vs hardcoded 200 likely reflects this — 200 may have been based on JMA catalog data, not USGS.

## Verification Steps

```bash
# Confirm zero test regressions
node --test
# Expected: 70/70 pass

# Verify citation comments (grep for calibration references)
grep -r "grimoires/loa/calibration" src/

# Review calibration findings
cat grimoires/loa/calibration/regional-profiles-findings.md
cat grimoires/loa/calibration/data-provenance-blocker.md
```

## Stop Condition Met

Per sprint instructions: "After all five studies are complete and findings written to `grimoires/loa/calibration/`, summarize what ran, what the scripts produced, and any anomalies. Do not begin Prompt B (Omori backtest). Do not modify any source files in `src/`."

Studies 4 and 6 completed. Studies 2, 3, 5 blocked by data-provenance gate (per sprint instructions: "Do not run Studies 2, 3, or 5. Study 4 and Study 6 do not depend on automatic-stage data and may still proceed."). Stop condition met.
