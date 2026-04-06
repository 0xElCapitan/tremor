# Implementation Report: sprint-isc-verification

## Executive Summary

The ISC Bulletin verification study was designed to determine whether the ISC preserves NEIC/USGS automatic-stage magnitude values with enough temporal metadata to serve as a proxy for the automatic→reviewed transition. **The study halted at Phase 0 (API preflight)** because the ISC FDSN API does not provide timestamp or ordering metadata on magnitude entries, making it impossible to distinguish automatic-stage from reviewed-stage NEIC reports.

**Outcome**: Phase 0 blocker triggered. Phases 1–3 not executed per sprint plan.
**Artifact produced**: `grimoires/loa/calibration/isc-metadata-blocker.md`

## Phase 0 Results

### Endpoints Tested

| Endpoint | Protocol | Result |
|----------|----------|--------|
| IRIS mirror FDSN (`isc-mirror.iris.washington.edu`) | HTTP | ✅ Works (text and QuakeML formats) |
| IRIS mirror FDSN | HTTPS | ❌ `ERR_TLS_CERT_ALTNAME_INVALID` |
| ISC direct CSV (`www.isc.ac.uk/cgi-bin/web-db-v4`) | HTTP | ❌ "request BULLETIN is not available" |

### Test Events

| Event | ISC Event ID | NEIC Mags Found | Ordering Metadata |
|-------|-------------|-----------------|-------------------|
| 2020 Puerto Rico M6.4 | 617125982 | 5 entries (mb 6.30, ML 6.00, Ms_20 6.40, Mwb 6.30, Mww 6.40) | None |
| 2021 Haiti M7.2 | 620986707 | 2 entries (mb 6.80, Ms_20 7.40) | None |
| 2019 Ridgecrest M7.1 | 616203758 | 6 entries (Mwb 6.90, Mww 7.10, mb 6.10, ML 6.50, Ms_20 7.20, Mwr 6.90) | None |

### Preflight Verdict

Checks 1–3 passed (endpoint works, NEIC present, multiple magnitudes). **Check 4 failed**: no timestamp, sequence number, `creationTime`, or `evaluationStatus` on NEIC magnitude/origin entries.

Per sprint plan: *"If endpoints work but NEIC entries lack ordering metadata: write `isc-metadata-blocker.md` and stop."*

## Files Created

| File | Purpose |
|------|---------|
| `grimoires/loa/calibration/isc-metadata-blocker.md` | Phase 0 blocker with full evidence and remaining options |

## Files Modified

None. Sprint plan explicitly states: "Do not modify any source file."

## Phases Not Executed

| Phase | Reason |
|-------|--------|
| Phase 1 (Event list construction) | Blocked by Phase 0 — ordering metadata absent |
| Phase 2 (ISC query and classification) | Depends on Phase 1 |
| Phase 3 (Scoring and recommendation) | Depends on Phase 2 |

## Key Findings

1. **ISC has rich NEIC data** — multiple magnitude types and origins per event, with station counts and uncertainty values. The data exists; the ordering metadata does not.

2. **Multiple NEIC origins suggest processing stages** — e.g., Ridgecrest has PAS/NEIC (85 phases) and NEIC (196 phases) origins. This *could* represent automatic→reviewed stages, but there is no metadata to confirm this and the sprint plan explicitly prohibits inferring ordering from proxies.

3. **ISC direct CSV endpoint appears decommissioned** — the `web-db-v4` bulletin request failed. The IRIS FDSN mirror is the only working endpoint found.

4. **HTTPS is broken on the IRIS mirror** — TLS cert alt-name mismatch. HTTP works. This is a stability concern for production use.

## Remaining Options (from blocker document)

1. **Real-time collector** — deploy scraper for M4+ automatic-stage snapshots (recommended, weeks/months to accumulate data)
2. **Direct ISC inquiry** — ask ISC staff if internal timestamp metadata exists (low-cost, worth pursuing)
3. **USGS internal archives** — contact USGS about automatic-stage catalog access
4. **Accept TBD** — permanently defer Studies 2, 3, 5

## Verification Steps

1. Read `grimoires/loa/calibration/isc-metadata-blocker.md` — confirm all four preflight checks documented with evidence
2. Verify the three ISC test queries are reproducible:
   ```
   curl -sS "http://isc-mirror.iris.washington.edu/fdsnws/event/1/query?format=xml&starttime=2020-01-07T08:24:00&endtime=2020-01-07T08:25:00&latitude=17.9&longitude=-66.8&maxradius=0.5&includeallmagnitudes=true&includeallorigins=true" | grep "creationTime"
   ```
   Should return only the top-level query timestamp, no per-magnitude timestamps
3. Confirm no source files were modified: `git diff src/`

## Hard Constraints Compliance

| Constraint | Status |
|------------|--------|
| Zero new runtime npm dependencies | ✅ No dependencies added |
| All ISC queries use public endpoints | ✅ IRIS mirror, no auth required |
| 500ms delay between API requests | ✅ Manual sequential queries |
| Do not draw calibration conclusions from ISC data | ✅ No conclusions drawn — study halted at preflight |
| Do not modify any source file | ✅ No source files touched |
