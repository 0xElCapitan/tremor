# TREMOR Calibration Sprint — Prompt A
# Citation Pass + Data Pipeline Studies (Studies 2–6)

**Scope**: Study 6 (citation pass) + Studies 2–5 (data pipeline scripts, run, output findings). No parameter values are changed in this sprint. Every study produces a recommendation file. Parameter merges happen in a separate sprint after human review.

**Stop condition**: After all five studies are complete and findings written to `grimoires/loa/calibration/`, summarize what ran, what the scripts produced, and any anomalies. Do not begin Prompt B (Omori backtest). Do not modify any source files in `src/`.

**Pre-flight**: Verify all file paths and line numbers against the live repo before acting. Treat references in this prompt as hints, not ground truth.

**Hard constraints**:
- Zero new runtime npm dependencies
- No changes to any value in `src/` — labels and recommendation files only
- All scripts use Node.js 20+ built-ins or the USGS FDSN public API (no auth required)
- All output goes to `grimoires/loa/calibration/` — do not write anywhere else

---

## Data-provenance gate — run before Studies 2, 3, and 5

Studies 2, 3, and 5 all depend on recovering both the **automatic-stage** and **reviewed-stage** representation of the same historical USGS events. If the USGS API only returns the latest version of historical events (i.e., reviewed records overwrite automatic records), the matched-window proxy approach will compare reviewed-to-reviewed and produce meaningless results — while appearing to work correctly.

Before writing any calibration script, verify this assumption explicitly:

1. Pick a known event that transitioned automatic→reviewed (any M4.5+ event from 2023 is fine)
2. Fetch its current state via the FDSN detail endpoint
3. Determine whether the response includes: (a) the original automatic magnitude, (b) the reviewed magnitude, and (c) timestamps for both stages — or only the final reviewed state
4. Also check whether the FDSN event search endpoint returns the automatic-stage record when queried with `reviewstatus=automatic` for a historical event that is now reviewed

If both automatic and reviewed-stage data are recoverable per-event (either from the detail endpoint's history or via the two-window proxy approach): proceed with Studies 2, 3, and 5.

If the API only returns the current (reviewed) state with no access to the original automatic magnitude: write `grimoires/loa/calibration/data-provenance-blocker.md` explaining exactly what was tested and what was returned, and stop. Do not run Studies 2, 3, or 5. Study 4 and Study 6 do not depend on automatic-stage data and may still proceed.

---

## Study 6 — Citation pass (do this first, no data required)

**Goal**: Every uncited magic number in the five target files gets a grouped comment block. No values change. One day of work that immediately moves the codebase from PROTOTYPE to PROMISING on transparency.

**Rule**: Prefer one honest comment block above a cluster of related constants over per-line noise. Format:
- `// source: <citation>` where a real source exists
- `// TBD: empirical calibration needed — see grimoires/loa/calibration/` where no source exists

Work through these files in order. Verify line numbers before editing.

**`src/processor/quality.js`**
- `statusWeights` block (reviewed, automatic, deleted values) — all TBD
- Five composite weights (status 0.40, gap 0.15, rms 0.15, station 0.15, density 0.15) — all TBD
- Missing-value defaults for gap and rms — all TBD

**`src/processor/settlement.js`**
- `TWO_HOURS`, `ONE_HOUR`, `SEVEN_DAYS` constants — all TBD
- `composite > 0.5` quality gate — TBD
- Three `brier_discount` values (0.10, 0.20, 0.25) — all TBD

**`src/processor/regions.js`**
- All `REGION_PROFILES` field clusters (`median_nst`, `median_gap`, `baseline_rms`) — all TBD
- `DEFAULT_REGION` fallback values — TBD
- `DENSITY_NORM` grade weights — TBD
- Bounding boxes — partial source: note rectangular approximation of tectonic provinces; canonical source would be GCMT or Flinn-Engdahl

**`src/processor/magnitude.js`**
- `MAG_TYPE_UNCERTAINTY` block — all ⚠️ (plausible but uncited); tag as `// TBD: plausible per literature, no specific citation`
- Reported-error floor factor 0.5 — TBD
- Station-count formula (`1.5 − 0.5·min(1, nst/20)`, saturation at 20) — TBD
- Missing-nst ×1.3 penalty — TBD
- Reviewed-status ×0.7 adjustment — TBD
- Doubt-price ceiling (`min(1, σ/0.5)`) — TBD
- 95% CI multiplier 1.96 — `// source: standard normal z₀.₉₇₅`
- `normalCDF` polynomial coefficients — `// source: Abramowitz & Stegun 26.2.17`

**`src/theatres/aftershock.js`**
- Omori-Utsu law form — `// source: Omori (1894), Utsu (1961)`
- Båth's law Δ ≈ M − 1.2 — `// source: Båth (1965)`
- `REGIME_PARAMS` block — `// TBD: approximate, calibrate in production (see omori-backtest-protocol.md)`
- Productivity scaling 0.75 exponent — `// source: Reasenberg & Jones (1989)`
- Rupture length formula coefficients — `// source: Wells & Coppersmith (1994), strike-slip/reverse subsurface rupture length regression`
- Match-radius 1.5× multiplier — TBD
- Degree conversion ÷111 km — `// TBD: equatorial approximation, distorts at high latitudes`
- Omori-decay blend 0.7 correction — TBD
- Blending floor `max(0.1, ...)` — TBD
- `inferRegime` heuristic bounds — `// TBD: hand-rolled approximation, production use requires proper tectonic regionalization (GCMT or Flinn-Engdahl)`

**Success criteria**: All five files have grouped comment blocks above uncited parameter clusters. No values changed. Run `node --test` after to confirm zero regressions.

---

## Study 4 — Regional profile recalibration

**Goal**: Query the USGS FDSN event web service for M4.5+ events 2021-01-01 to 2026-01-01, compute actual medians of `nst`, `gap`, `rms` per region bbox, compare to hardcoded values in `src/processor/regions.js`. Flag any deviation > 15%.

**Script**: Write to `scripts/calibrate-regions.js`. Use Node.js 20+ `fetch`. No dependencies.

**FDSN endpoint**:
```
https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson
  &minmagnitude=4.5
  &starttime=2021-01-01
  &endtime=2026-01-01
  &minlatitude=<bbox.minLat>
  &maxlatitude=<bbox.maxLat>
  &minlongitude=<bbox.minLon>
  &maxlongitude=<bbox.maxLon>
  &eventtype=earthquake
  &reviewstatus=reviewed
  &limit=20000
```

Run one query per region bbox from `REGION_PROFILES`. For each region compute:
- Median `nst` (station count)
- Median `gap` (azimuthal gap in degrees)
- Median `rms` (root mean square travel time residual)

Only include events where the field is present and non-null.

**Truncation handling**: The FDSN `limit` parameter defaults to 20000. After each query, check whether the result count equals the limit. If it does, the result is truncated — paginate using `offset` until all events are retrieved, or reduce the time window and run multiple queries. Do not compute medians from a truncated dataset without noting the truncation. Flag any region where truncation occurred in the findings file.

**Output**: Write `grimoires/loa/calibration/regional-profiles-findings.md` with:
- Per-region table: `[region] | [field] | [current value] | [measured median] | [deviation %] | [flag if >15%]`
- Evidence tag: `DATA-FACTUAL` for measured values
- Recommendation: for each flagged value, state the measured replacement

Do not edit `regions.js`. Recommendations only.

**Note on API rate limits**: Add a 500ms delay between region queries. USGS FDSN is free but not unlimited.

---

## Study 5 — Quality composite weight refit

**Goal**: Treat `composite` score as a binary classifier predicting whether a USGS event transitions to reviewed status within 7 days. Compute AUC. Find the optimal threshold. Compare to the hardcoded `0.5` cutoff in `settlement.js:73`. Recommend logistic-regression-derived weights if AUC < 0.75 or optimal threshold differs from 0.5 by more than 0.1.

**Script**: Write to `scripts/calibrate-quality-weights.js`.

**Data**: Fetch M4.0+ events from USGS FDSN for 2023-01-01 to 2025-01-01 (two years, enough volume for logistic regression). For each event, record:
- `nst`, `gap`, `rms`, `status`, `updated` at first fetch (automatic stage)
- Re-fetch the same event 7 days later via `fetchDetail()` to check final reviewed status
- Label: `1` if reviewed within 7 days, `0` if not

Because re-fetching every event individually is slow, use a simpler proxy: fetch events at automatic status, then fetch the same time window 30+ days later at reviewed status, and match by event ID. Events present in both = reviewed within window. Events only in the automatic fetch = not reviewed.

**Compute**:
- Apply TREMOR's current `computeQuality()` formula to each event
- Compute AUC of composite score as a reviewed-status predictor
- Sweep threshold from 0.1 to 0.9 in 0.05 steps, find threshold maximizing F1

**On logistic regression**: only attempt if AUC < 0.75 or the optimal threshold differs from 0.5 by more than 0.1, meaning the current weighting scheme is clearly not working. If the AUC and threshold are acceptable, state that and stop — do not run regression for its own sake. If regression is warranted, use a simple gradient-descent implementation in plain Node.js with a fixed learning rate and iteration cap (500 iterations maximum). If the implementation would require more than ~50 lines of math code, write a findings note instead: "logistic regression warranted but requires a dedicated tooling sprint" and report the AUC and threshold sweep results only.

**Output**: Write `grimoires/loa/calibration/quality-weights-findings.md` with:
- Current AUC and optimal threshold
- Logistic regression coefficients (normalized to sum to 1.0 for comparability with current weights)
- Recommendation: proposed weight replacements with evidence tag `DATA-FACTUAL`
- Recommendation: proposed threshold replacement for `settlement.js:73` if current 0.5 is suboptimal

Do not edit `quality.js` or `settlement.js`. Recommendations only.

---

## Study 3 — Settlement discount calibration

**Goal**: Build the empirical distribution of magnitude change (Δ) when USGS events transition automatic → reviewed. Derive `brier_discount` values from measured Brier penalty of resolving early vs waiting, replacing the current hand-picked 0.10 / 0.20 / 0.25.

**Script**: Write to `scripts/calibrate-settlement.js`.

**Data**: Fetch M4.0+ events for 2020-01-01 to 2025-01-01. For each event, capture:
- Automatic magnitude and timestamp
- Reviewed magnitude and timestamp (re-fetch via event detail URL)
- Time-to-review (seconds from origin to reviewed status)
- Δ magnitude = reviewed − automatic (signed)

Use the same proxy approach as Study 5: match event IDs across two time-window fetches.

**Compute**:
1. Latency distribution: histogram of time-to-review. Identify the empirical thresholds that correspond to TREMOR's `TWO_HOURS` and `ONE_HOUR` buckets. Are the hardcoded values near the distribution's natural break points?
2. Δ-magnitude distribution stratified by settlement tier (oracle / provisional_mature / market_freeze): for events that would have been resolved at each tier, what is the distribution of Δ?
3. Empirical Brier penalty derivation — use this formula exactly, do not invent a different bridge:

   For each settlement tier T, the recommended `brier_discount` is:

   ```
   brier_discount(T) = mean( (Δ_mag(i))² ) over all events i resolved at tier T
   ```

   Where `Δ_mag(i) = reviewed_magnitude(i) − automatic_magnitude(i)` for event i.

   This represents the expected additional Brier error introduced by resolving at automatic magnitude rather than waiting for the reviewed value. It is a direct empirical measurement, not a model output. If the mean squared Δ for a tier is less than the current hardcoded discount, the current value is conservative (acceptable). If it is greater, the current value understates the penalty.

   Tag all derived values `DATA-FACTUAL`. Report both the mean squared Δ and the current discount side by side.

**Output**: Write `grimoires/loa/calibration/settlement-findings.md` with:
- Latency distribution summary (median, 25th/75th percentile, and where current `TWO_HOURS` / `ONE_HOUR` / `SEVEN_DAYS` thresholds fall)
- Δ-magnitude distribution per tier (mean, std dev, 95th percentile)
- Empirically derived `brier_discount` per tier with evidence tag `DATA-FACTUAL`
- Comparison table: current values vs recommended values
- Flag if `composite > 0.5` threshold appears misaligned with the latency data (cross-reference with Study 5 output)

Do not edit `settlement.js`. Recommendations only.

---

## Study 2 — Doubt-price CI coverage (highest-value study)

**Goal**: For N≥2000 USGS events that transitioned automatic → reviewed between 2020 and 2025, compute TREMOR's doubt-price 95% CI at the automatic stage, then check what fraction of reviewed magnitudes fall inside that CI. Target: 95 ± 2%. Systematic deviation means the uncertainty model is miscalibrated.

**Script**: Write to `scripts/calibrate-doubt-price.js`.

**Data**: Same automatic→reviewed matched dataset as Studies 3 and 5. Reuse or share the fetch logic — do not re-query USGS three times for the same data. If a shared fetch script would be cleaner, write `scripts/fetch-usgs-transitions.js` as a shared data layer and import it.

**Compute**:
1. For each event at automatic stage: run `buildMagnitudeUncertainty()` to get `sigma` and `doubt_price`
2. Construct 95% CI: `[mag − 1.96·sigma, mag + 1.96·sigma]`
3. Check whether the reviewed magnitude falls inside the CI
4. Compute overall coverage rate (target: 95 ± 2%)
5. Stratify coverage by `magType` — does Mw coverage differ from Ml, Md, etc.?
6. Stratify by station count bucket (nst < 10, 10-20, 20-50, 50+) — does the station-count formula work?
7. Stratify by region — does coverage vary systematically by region?

**Output**: Write `grimoires/loa/calibration/doubt-price-findings.md` with:
- Overall coverage rate vs 95% target
- Coverage by magType table
- Coverage by station-count bucket table
- Coverage by region table
- Root cause diagnosis: if coverage is systematically low or high, which component of the uncertainty stack is the likely source (baseline σ, station formula, density multiplier, reviewed adjustment, ceiling)?
- Recommended parameter adjustments with evidence tag `DATA-FACTUAL`
- Explicit statement: if coverage is within 95 ± 2%, state "uncertainty model passes CI coverage check" — do not recommend changes for noise

Do not edit `magnitude.js`. Recommendations only.

---

## Completion summary expected

When all five studies are complete:
1. Confirm `node --test` passes 70/70 (Study 6 is the only one touching `src/`)
2. List all files written to `grimoires/loa/calibration/`
3. Summarize the single most important finding from each study
4. List any anomalies (USGS API failures, insufficient data for a stratum, unexpected coverage results)
5. Stop. Do not begin Prompt B.
