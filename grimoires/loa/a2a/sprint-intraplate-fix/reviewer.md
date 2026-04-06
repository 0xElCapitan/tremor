# Implementation Report: Sprint `intraplate-fix`

## Executive Summary

Added intraplate tectonic regime detection to `inferRegime()` in `src/theatres/aftershock.js`. Five stable-craton regions now route shallow events (depth < 30 km) to the `intraplate` regime (K=8, c=0.08, p=0.95), which previously had zero coverage. No K/c/p values changed. No new dependencies. 70/70 tests pass.

## Task Completed

### File Modified

- `src/theatres/aftershock.js:161-174` — added intraplate detection block

### Approach

Inserted a depth-gated (`depth_km < 30`) intraplate check block **after** the Caribbean transform check and **before** the Pacific ring of fire catch-all. This ordering ensures:

1. Deep events (>50 km) still route to subduction first
2. Specific subduction zones (Andes, Indonesia) are checked before intraplate
3. Caribbean transform is checked before intraplate (overlapping lon range at lat 25 boundary)
4. Intraplate is checked before the Pacific ring of fire catch-all (which was misassigning Basin and Range events as transform)

### Regions Added

| Region | Lon Range | Lat Range | Depth Guard | Notes |
|--------|-----------|-----------|-------------|-------|
| Eastern North America | -100 to -60 | 25 to 55 | < 30 km | Stable craton — fixes Mineral, VA |
| Basin and Range | -120 to -100 | 36 to 50 | < 30 km | Tightened lat from 35→36 to exclude Ridgecrest (35.8°N) |
| Australian craton | 113 to 155 | -45 to -10 | < 30 km | Interior Australia |
| Stable African craton | 15 to 45 | -30 to 15 | < 30 km | Excludes East African Rift |
| Indian subcontinent | 68 to 88 | 10 to 28 | < 30 km | Away from Himalayan collision |

### Basin and Range Tightening

The sprint specified lat 35-50 for Basin and Range. Ridgecrest (35.8°N, 117.6°W) falls inside that box and must remain `transform`. Southern lat bound tightened to 36 to exclude it. The Mojave/Eastern California Shear Zone below ~36°N is transform-dominated, so this is geologically appropriate.

## Verification

| Event | Depth | Lat/Lon | Expected | Actual | Status |
|-------|-------|---------|----------|--------|--------|
| 2011 Mineral, Virginia | 6 km | 37.9, -77.9 | intraplate | intraplate | PASS |
| 2020 Magna, Utah | 11.9 km | 40.7, -112.1 | intraplate | intraplate | PASS |
| 2019 Ridgecrest, CA | ~8 km | 35.8, -117.6 | transform | transform | PASS |
| 2011 Tohoku | 29 km | 38.3, 142.4 | subduction | subduction | PASS |
| 2010 Maule | 22.9 km | -35.9, -72.7 | subduction | subduction | PASS |

## Testing Summary

- **Test suite**: `node --test` — 70/70 pass, 0 fail, 0 regressions
- **Duration**: ~162 ms
- No existing tests asserted specific `inferRegime` output for Mineral or Magna (they fell to `default`/`transform` without dedicated assertions), so no test assertions needed updating.

## Known Limitations

- Bounding-box regionalization is approximate (noted with `// TBD:` comment). Production use should replace with proper stable-craton dataset (e.g., USGS tectonic summary regions or Flinn-Engdahl zones).
- Basin and Range southern boundary (lat 36) is a conservative cutoff. Some legitimate intraplate events between 35-36°N may still route to transform.
- No coverage for other stable cratons (e.g., Siberian, Brazilian, Canadian Arctic).

## Verification Steps for Reviewer

```bash
# 1. Run the full test suite
node --test

# 2. Verify intraplate assignments inline
node -e "
const { inferRegime } = await import('./src/theatres/aftershock.js');
console.log('Mineral, VA:', inferRegime(6, 37.9, -77.9));       // intraplate
console.log('Magna, UT:', inferRegime(11.9, 40.7, -112.1));     // intraplate
console.log('Ridgecrest:', inferRegime(8, 35.8, -117.6));       // transform
console.log('Tohoku:', inferRegime(29, 38.3, 142.4));           // subduction
console.log('Maule:', inferRegime(22.9, -35.9, -72.7));         // subduction
"
```
