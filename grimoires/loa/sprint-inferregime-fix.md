# TREMOR Sprint — Fix `inferRegime` + Export Pure Functions

**Scope**: Two targeted changes to `src/theatres/aftershock.js` only. No other files.

**Stop condition**: Changes made, tests pass, summarize what changed. Do not refit any Omori parameters. Do not run the backtest.

**Hard constraints**:
- Zero new runtime npm dependencies
- Only `src/theatres/aftershock.js` changes
- Do not change any K, c, p, or bath_delta values
- Do not change the M<6.0 guard in `createAftershockCascade` — that stays as-is
- Preserve all existing `// source:` and `// TBD:` comment blocks

---

## Context

The Omori backtest (`grimoires/loa/calibration/omori-backtest/diagnostic-report.md`) found two problems:

1. `inferRegime` misassigns sequences due to incorrect heuristic bounds — South America is excluded from Pacific ring detection, and the subduction depth threshold is too shallow
2. `omoriExpectedCount`, `countToBucketProbabilities`, and `inferRegime` are not exported, blocking intraplate sequence testing and partial-window time-signature analysis

Both are code correctness issues, not calibration decisions.

---

## Fix 1 — `inferRegime` heuristic bounds

**Location**: `src/theatres/aftershock.js` — the `inferRegime(depth_km, lat, lon)` function, currently around line 127-148 per the diagnostic report. Verify exact lines before editing.

**Current problems** (from `diagnostic-report.md`):

1. Pacific ring longitude check (`lon < -100 || lon > 100`) excludes South America. The Andes subduction zone runs approximately -82° to -65° longitude — entirely outside the current bounds.

2. Depth threshold for subduction classification is too shallow. Tōhoku at 29km depth was classified as transform. The subduction zone interface typically extends from the surface to ~50km. The threshold should be lowered to capture shallow-focus subduction events.

3. No coverage for Indonesia/Philippines (~95-145°E, -10 to 20°N) or Caribbean (~-85 to -60°W, 10-25°N).

**Fix**:

Expand the Pacific ring and subduction detection to cover:
- **South America Andes**: lon -82 to -65, lat -55 to 12 (subduction)
- **Indonesia/Philippines**: lon 95 to 145, lat -10 to 20 (subduction)
- **Caribbean**: lon -85 to -60, lat 10 to 25 (transform or subduction boundary — assign transform, consistent with current Caribbean treatment)
- **Depth threshold**: lower from 30km to 20km for subduction classification in Pacific ring zones

Do not attempt a full tectonic regionalization rewrite. The `// TBD:` comment in the existing code already flags that production use requires Slab2 or Flinn-Engdahl. This fix improves the heuristic within its existing structure — it is not a redesign.

After the fix, verify manually that the following assignments are correct:
- Tōhoku (depth 29km, Japan Pacific coast) → subduction
- Maule (depth 22.9km, Chile) → subduction  
- Iquique (depth 25km, Chile) → subduction
- Ridgecrest (depth ~8km, California) → transform (should not change)
- Puerto Rico (depth ~10km, Caribbean) → transform (acceptable, Caribbean is ambiguous)
- Equatorial Atlantic (depth 10km, open ocean) → should still hit default or transform — document whichever it assigns

---

## Fix 2 — Export three pure functions

**Location**: `src/theatres/aftershock.js` — module exports

Export the following three functions. They are pure functions with no side effects and no dependency on theatre lifecycle state. Exporting them does not change their behavior.

```javascript
export { omoriExpectedCount, countToBucketProbabilities, inferRegime };
```

Or add to the existing named export block, whichever pattern the file already uses. Do not change the function implementations — export only.

**Verify**: After exporting, confirm each function can be imported and called from outside the module without error. A simple smoke test in the implementation report is sufficient — no need for a new test file unless tests already import from this module.

---

## Tests

Run `node --test` after both fixes. Expected: 70/70 pass with zero regressions.

If any existing test imports from `aftershock.js` and breaks due to the export changes, fix the import — do not change the test assertions.

If any existing test was asserting a specific `inferRegime` output for a sequence that is now correctly reclassified, update the test to reflect the corrected classification and note it in the summary.

---

## Definition of done

- [ ] `inferRegime` correctly assigns Tōhoku, Maule, and Iquique to subduction
- [ ] South America, Indonesia/Philippines, and Caribbean coverage added
- [ ] Depth threshold lowered to 20km for subduction classification in ring zones
- [ ] `omoriExpectedCount`, `countToBucketProbabilities`, `inferRegime` exported
- [ ] 70/70 tests pass
- [ ] Summary lists every bounds change made with old → new, and the corrected regime assignments for all three previously misassigned sequences
- [ ] No Omori K/c/p values changed
