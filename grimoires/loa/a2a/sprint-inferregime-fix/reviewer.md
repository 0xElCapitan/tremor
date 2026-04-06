# Implementation Report: Sprint inferregime-fix

## Executive Summary

Two targeted fixes applied to `src/theatres/aftershock.js`: expanded `inferRegime` heuristic bounds to cover South America, Indonesia/Philippines, and Caribbean, and exported three pure functions for external use. 70/70 tests pass with zero regressions.

## Tasks Completed

### Fix 1 — `inferRegime` heuristic bounds (`aftershock.js:137-168`)

**Approach**: Added three new geographic bounding-box checks before the existing Pacific ring check, and lowered the subduction depth threshold from 30km to 20km in all ring zones.

**Changes (old → new)**:

| Region | Old bounds | New bounds |
|--------|-----------|------------|
| South America Andes | Not covered (lon -82 to -65 excluded by `lon < -100` check) | lon [-82, -65], lat [-55, 12] — subduction if depth > 20km |
| Indonesia/Philippines | Partially covered by `lon > 100` | lon [95, 145], lat [-10, 20] — subduction if depth > 20km |
| Caribbean | Not covered | lon [-85, -60], lat [10, 25] — always transform |
| Pacific ring depth threshold | 30km | 20km |

**Corrected regime assignments**:

| Sequence | Depth | Lat, Lon | Old assignment | New assignment |
|----------|-------|----------|---------------|----------------|
| Tohoku (2011) | 29km | 38.3, 142.4 | transform (depth 29 < 30) | **subduction** (depth 29 > 20) |
| Maule (2010) | 22.9km | -35.9, -72.7 | default (lon -72.7 outside Pacific ring) | **subduction** (Andes zone, depth 22.9 > 20) |
| Iquique (2014) | 25km | -19.6, -70.8 | default (lon -70.8 outside Pacific ring) | **subduction** (Andes zone, depth 25 > 20) |
| Ridgecrest (2019) | ~8km | 35.8, -117.6 | transform | transform (unchanged) |
| Puerto Rico | ~10km | 18.5, -67.0 | default | **transform** (Caribbean zone) |
| Equatorial Atlantic | 10km | 2, -30 | transform (mid-ocean ridge) | transform (unchanged) |

**Files modified**: `src/theatres/aftershock.js:137-168` (inferRegime function)

### Fix 2 — Export three pure functions (`aftershock.js:391`)

**Approach**: Added `omoriExpectedCount`, `countToBucketProbabilities`, and `inferRegime` to the existing named export block.

**Old**: `export { BUCKETS, REGIME_PARAMS };`
**New**: `export { BUCKETS, REGIME_PARAMS, omoriExpectedCount, countToBucketProbabilities, inferRegime };`

**Verification**: All three functions import and execute correctly from outside the module. Smoke test confirmed `omoriExpectedCount` returns finite values and `countToBucketProbabilities` returns a valid probability distribution.

## Technical Highlights

- **No K/c/p/bath_delta values changed** — only geographic bounds and depth threshold modified
- **M<6.0 guard in `createAftershockCascade` preserved** — untouched
- **All `// source:` and `// TBD:` comments preserved** — new regions include appropriate `// TBD:` annotations
- **Evaluation order matters**: Andes, Indonesia/Philippines, and Caribbean checks are placed before the general Pacific ring check so specific regions take precedence over the broader catch-all

## Testing Summary

- **Test suite**: 70/70 pass, 0 fail, 0 skipped
- **Command**: `node --test`
- **No existing tests broke** — no test was asserting the old (incorrect) regime assignments for the affected sequences
- **No new test file needed** — sprint explicitly stated no new test file unless existing tests import from aftershock.js

## Known Limitations

- Bounding boxes are still approximate heuristics (documented with `// TBD:` comments)
- Caribbean is assigned `transform` uniformly despite being a complex boundary (documented as acceptable per sprint spec)
- Equatorial approximation for degree conversion (111 km/degree) unchanged — pre-existing limitation

## Verification Steps

1. `node --test` — 70/70 pass
2. Import and call all three exported functions — verified working
3. Manual regime assignment check for all six reference sequences — all correct per sprint spec

## Hard Constraints Compliance

- [x] Zero new runtime npm dependencies
- [x] Only `src/theatres/aftershock.js` changed
- [x] No K, c, p, or bath_delta values changed
- [x] M<6.0 guard in `createAftershockCascade` unchanged
- [x] All `// source:` and `// TBD:` comment blocks preserved
