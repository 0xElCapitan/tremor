# TREMOR Sprint — Fix `inferRegime` Intraplate Detection

**Scope**: One targeted change to `src/theatres/aftershock.js` only — add intraplate detection logic to `inferRegime`. No other files.

**Stop condition**: Change made, tests pass, manually verify both intraplate sequences assign correctly, summarize. Do not refit any Omori parameters. Do not run the backtest.

**Hard constraints**:
- Zero new runtime npm dependencies
- Only `src/theatres/aftershock.js` changes
- Do not change any K, c, p, or bath_delta values
- Do not change the existing subduction, transform, volcanic, or default logic — add intraplate detection only
- Preserve all existing `// source:` and `// TBD:` comment blocks

---

## Context

The second Omori backtest (`grimoires/loa/calibration/omori-backtest/diagnostic-report.md`) found that both intraplate regime-fit sequences are misassigned:

| Sequence | Expected | Assigned | Depth | Location | Root cause |
|----------|----------|----------|-------|----------|------------|
| 2011 Mineral, Virginia | intraplate | default | 6 km | 11 km SSW of Mineral, Virginia | No intraplate detection — eastern US falls through |
| 2020 Magna, Utah | intraplate | transform | 11.9 km | 5 km NNE of Magna, Utah | No intraplate detection — Basin and Range falls through |

The intraplate regime (K=8, c=0.08, p=0.95) has zero clean test coverage as a result. This needs to be fixed before K can be refit with confidence across all regimes.

---

## Fix — Add intraplate detection to `inferRegime`

**Location**: `src/theatres/aftershock.js` — `inferRegime(depth_km, lat, lon)` function. Verify exact lines before editing.

**What intraplate means in this context**: stable continental crust away from active plate boundaries. Key characteristics: shallow focal depth (typically <30km), location within continental interior rather than near a plate boundary or subduction zone.

**Regions to add** (check these before the existing transform/subduction/volcanic checks — intraplate detection should be evaluated before the transform fallback):

1. **Eastern North America** (stable craton): lon -100 to -60, lat 25 to 55. Excludes the Pacific Coast, Gulf of Mexico subduction zones, and Caribbean. Covers eastern US, Canadian Shield, Appalachians. Assign: `intraplate`.

2. **Basin and Range / Intermountain West** (extensional, not transform): lon -120 to -100, lat 35 to 50. This is the interior western US — extensional tectonics, not the San Andreas transform system. Assign: `intraplate`. Note: this overlaps with the existing transform zone detection — check ordering so Basin and Range is caught before transform for this lon/lat range.

3. **Australian craton**: lon 113 to 155, lat -45 to -10. Interior Australia is one of the most stable continental interiors. Assign: `intraplate`.

4. **Stable African craton**: lon 15 to 45, lat -30 to 15. Interior Africa away from the East African Rift. Assign: `intraplate`. Note: the East African Rift itself is better classified as transform/default — be careful not to absorb rift events into intraplate.

5. **Indian subcontinent interior**: lon 68 to 88, lat 10 to 28. Away from the Himalayan collision zone (which is handled separately or falls to default). Assign: `intraplate`.

**Depth guidance**: intraplate events are almost exclusively shallow (< 30 km). Add a depth check: only assign intraplate if `depth_km < 30`. Events deeper than 30 km in these regions are likely mislocated or represent different tectonic processes — let them fall through to default.

**Add a comment** above the new logic block:
```javascript
// TBD: hand-rolled intraplate approximation — production use requires proper
// stable-craton regionalization (e.g., USGS tectonic summary regions or Flinn-Engdahl zones)
```

---

## Manual verification

After the fix, verify these assignments before running the test suite:

| Event | Depth | Lat/Lon | Expected |
|-------|-------|---------|----------|
| 2011 Mineral, Virginia | 6 km | 37.9°N, 77.9°W | intraplate |
| 2020 Magna, Utah | 11.9 km | 40.7°N, 112.1°W | intraplate |
| 2019 Ridgecrest, California | ~8 km | 35.8°N, 117.6°W | transform (must not change) |
| 2011 Tōhoku | 29 km | 38.3°N, 142.4°E | subduction (must not change) |
| 2010 Maule | 22.9 km | 35.9°S, 72.7°W | subduction (must not change) |

If Ridgecrest or Tōhoku change assignment, the Basin and Range or depth bounds are too broad — tighten before proceeding.

---

## Tests

Run `node --test` after the fix. Expected: 70/70 pass with zero regressions.

If any existing test was asserting a specific `inferRegime` output for Mineral or Magna that now changes, update the assertion to `intraplate` and note it in the summary.

---

## Definition of done

- [ ] Mineral, Virginia → intraplate
- [ ] Magna, Utah → intraplate
- [ ] Ridgecrest → transform (unchanged)
- [ ] Tōhoku → subduction (unchanged)
- [ ] Maule → subduction (unchanged)
- [ ] 70/70 tests pass
- [ ] `// TBD:` comment added above new intraplate logic
- [ ] No K/c/p values changed
- [ ] Summary lists every new region added with its lat/lon bounds
