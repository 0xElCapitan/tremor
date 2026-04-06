# Omori Regime Backtest — Diagnostic Report

**Run 4 — inferRegime fully corrected.**

**Phase**: 1 diagnostic backtest. Not final calibration proof.
**Date**: 2026-04-06
**Sequences run**: 14 / 14
**Direct (M<6.0)**: 5 (via exported omoriExpectedCount/inferRegime)
**Errors**: 0

**What changed since Run 3**: `inferRegime` now correctly assigns both intraplate regime-fit sequences (Mineral VA → `intraplate`, Magna UT → `intraplate`). Wells NV inference also now returns `intraplate`. All 7 regime-fit sequences have correct regime assignments. Per-regime K/c/p analysis is now clean — no contamination from misassignment.

---

## 1. Regime-Fit Results

All 7 regime-fit sequences assigned the **correct** regime (7/7 match). This is the first clean run.

**Direct-computed sequences** (M<6.0, via exported functions): 2011 Mineral, Virginia (M5.8), 2020 Magna, Utah (M5.7)

### Per-Sequence Results

| # | Sequence | Regime | Projected | Actual | Bucket Hit | Rel Error | Log Error | Brier |
|---|----------|--------|-----------|--------|------------|-----------|-----------|-------|
| 1 | 2011 Tōhoku | subduction | 128249.8 | 1422 | Yes | 8919.0% | 4.501 | 0 |
| 2 | 2010 Maule | subduction | 76393.5 | 672 | Yes | 11268.1% | 4.732 | 0 |
| 3 | 2014 Iquique | subduction | 27105.5 | 238 | Yes | 11288.9% | 4.731 | 0 |
| 4 | 2019 Ridgecrest | transform | 2959.3 | 67 | Yes | 4316.9% | 3.774 | 0 |
| 5 | 2010 El Mayor-Cucapah | transform | 3517.2 | 57 | Yes | 6070.5% | 4.105 | 0 |
| 6 | 2011 Mineral, Virginia | intraplate | 112.4 | 2 | No | 5520.0% | 3.632 | 0.4 |
| 7 | 2020 Magna, Utah | intraplate | 94.6 | 4 | No | 2265.0% | 2.951 | 0.4 |

Note: bucket hit rate is misleading for high-magnitude sequences — both projected (thousands) and actual (tens-hundreds) fall in "21+" bucket, making it a trivial hit.

### Per-Regime Aggregation

| Regime | Sequences | Bucket Hit Rate | Mean Rel Error | Mean Log Error | Classification |
|--------|-----------|-----------------|----------------|----------------|----------------|
| subduction | 3 | 100.0% | 10492.0% | 4.655 | **Fail** |
| transform | 2 | 100.0% | 5193.7% | 3.940 | **Fail** |
| intraplate | 2 | 0.0% | 3892.5% | 3.292 | **Fail** |

**Untested regimes**: volcanic (by design — robustness only), default (no regime-fit sequence exists for default)

All three tested regimes **Fail** per protocol thresholds (bucket hit < 50% OR relative error > 60%).

---

## 2. Bias Diagnosis Per Regime

Following protocol diagnosis order: c (early-time) → K (total) → p (drift) → inferRegime (regime variance).

### subduction

**Parameters**: K=25, c=0.05, p=1.05

**Direction**: Systematically **over-predicting** — all 3 sequences 90-113x too high.

**Time-signature analysis** (t=6h, t=24h, t=72h):

| Sequence | 6h proj/act | 24h proj/act | 72h proj/act | 6h ratio | 24h ratio | 72h ratio | Pattern |
|----------|-------------|--------------|--------------|----------|-----------|-----------|---------|
| 2011 Tōhoku | 59151/183 | 97471/672 | 128250/1422 | 323x | 145x | 90x | Early bias (suspect c) |
| 2010 Maule | 35234/128 | 58060/411 | 76394/672 | 275x | 141x | 114x | Uniform bias (suspect K) |
| 2014 Iquique | 12502/73 | 20600/130 | 27106/238 | 171x | 158x | 114x | Uniform bias (suspect K) |

**Diagnosis**: 2/3 sequences show uniform over-prediction (K). Tōhoku shows declining ratio over time — higher early-time bias suggests additional `c` contribution for M9+ events. **Primary suspect: K.**

### transform

**Parameters**: K=15, c=0.03, p=1.1

**Direction**: Systematically **over-predicting** — both sequences 44-62x too high.

**Time-signature analysis** (t=6h, t=24h, t=72h):

| Sequence | 6h proj/act | 24h proj/act | 72h proj/act | 6h ratio | 24h ratio | 72h ratio | Pattern |
|----------|-------------|--------------|--------------|----------|-----------|-----------|---------|
| 2019 Ridgecrest | 1602/56 | 2384/65 | 2959/67 | 29x | 37x | 44x | Uniform bias (suspect K) |
| 2010 El Mayor-Cucapah | 1905/31 | 2834/42 | 3517/57 | 61x | 67x | 62x | Uniform bias (suspect K) |

**Diagnosis**: Both sequences show uniform over-prediction across all time windows. **Primary suspect: K.**

### intraplate

**Parameters**: K=8, c=0.08, p=0.95

**Direction**: Systematically **over-predicting** — both sequences 24-56x too high.

**Time-signature analysis** (t=6h, t=24h, t=72h):

| Sequence | 6h proj/act | 24h proj/act | 72h proj/act | 6h ratio | 24h ratio | 72h ratio | Pattern |
|----------|-------------|--------------|--------------|----------|-----------|-----------|---------|
| 2011 Mineral, VA | 41/0 | 78/1 | 112/2 | Inf | 78x | 56x | Early bias (suspect c) |
| 2020 Magna, UT | 35/3 | 66/4 | 95/4 | 12x | 16x | 24x | Late drift (suspect p) |

**Diagnosis**: Mixed time-signatures. Mineral shows declining ratio (early-time bias, possible `c` contribution). Magna shows increasing ratio over time — this is consistent with `p < 1.0` (the current p=0.95 means the rate decays slower than t^-1, so longer windows accumulate disproportionately more projected aftershocks). Both massively over-predict regardless. **Primary suspect: K**, with secondary `p` concern for Magna (p=0.95 may be too low).

---

## 3. K Refit Targets (Recommendations Only — Do Not Apply)

Formula: `K_empirical = K_current / (projected_count / actual_count)`

### subduction (K_current = 25)

| Sequence | Projected | Actual | Ratio | K_empirical |
|----------|-----------|--------|-------|-------------|
| 2011 Tōhoku (M9.1) | 128249.8 | 1422 | 90.2x | 0.277 |
| 2010 Maule (M8.8) | 76393.5 | 672 | 113.7x | 0.220 |
| 2014 Iquique (M8.2) | 27105.5 | 238 | 113.9x | 0.220 |

**Median K_empirical: 0.220** (range: 0.220 — 0.277)

### transform (K_current = 15)

| Sequence | Projected | Actual | Ratio | K_empirical |
|----------|-----------|--------|-------|-------------|
| 2019 Ridgecrest (M7.1) | 2959.3 | 67 | 44.2x | 0.339 |
| 2010 El Mayor-Cucapah (M7.2) | 3517.2 | 57 | 61.7x | 0.243 |

**Median K_empirical: 0.291** (range: 0.243 — 0.339)

### intraplate (K_current = 8)

| Sequence | Projected | Actual | Ratio | K_empirical |
|----------|-----------|--------|-------|-------------|
| 2011 Mineral, VA (M5.8) | 112.4 | 2 | 56.2x | 0.142 |
| 2020 Magna, UT (M5.7) | 94.6 | 4 | 23.7x | 0.338 |

**Median K_empirical: 0.240** (range: 0.142 — 0.338)

### Summary

| Regime | K_current | K_empirical (median) | Reduction factor |
|--------|-----------|---------------------|------------------|
| subduction | 25 | 0.22 | ~114x |
| transform | 15 | 0.29 | ~52x |
| intraplate | 8 | 0.24 | ~33x |

**Note**: The massive reduction factors (33-114x) suggest the base K values in REGIME_PARAMS are not the primary problem — the magnitude-dependent scaling `K * 10^(0.75 * (magDiff - 1))` amplifies K by orders of magnitude for M7+ events. A K refit sprint should consider whether the scaling exponent (0.75) or the base K (or both) need adjustment. The Reasenberg & Jones (1989) exponent of 0.75 may be correct for California M4-6 sequences but may over-amplify for M7-9 events.

---

## 4. Regime-Inference Results

| # | Sequence | Expected | Assigned | Match |
|---|----------|----------|----------|-------|
| 8 | 2016 Kumamoto | transform or subduction boundary | transform | Yes |
| 9 | 2008 Wells, Nevada | default or intraplate | intraplate | Yes |
| 10 | 2016 Equatorial Atlantic M7.1 | default | transform | No |
| 11 | 2020 Puerto Rico M6.4 | default | transform | No |

**Improvement from Run 3**: Wells NV now correctly assigned `intraplate` (was `transform`). 2/4 match (was 1/4).

### Remaining misassignments

- **2016 Equatorial Atlantic**: mid-ocean ridge (0.05°S, 17.8°W) falls in the `Math.abs(lat) < 10` mid-ocean ridge check → `transform`. Protocol expected `default` but `transform` is actually more geologically appropriate for a mid-ocean ridge event. This may be a protocol expectation issue, not a code bug.
- **2020 Puerto Rico**: Caribbean plate boundary (18°N, 66.8°W) falls in the Caribbean bbox → `transform`. Protocol expected `default` but the Caribbean is genuinely a transform-dominated plate boundary. Again, `transform` may be the better answer.

---

## 5. Volcanic Robustness Results

Volcanic results inform robustness only. Do not refit K/c/p based on these.

| # | Sequence | Regime Assigned | Projected | Actual | Bucket Hit | Rel Error | Notes |
|---|----------|----------------|-----------|--------|------------|-----------|-------|
| 12 | 2018 Kilauea | transform | 2095 | 8 | No | 26088% | Mainshock definition may be ambiguous; regime should be volcanic |
| 13 | 2021 La Palma | default | 37.1 | 0 | No | Inf | European catalog — USGS coverage thin |
| 14 | 2014 Bardarbunga | default | 208.5 | 1 | No | 20750% | High-volume volcanic swarm |

All 3 volcanic sequences show massive over-prediction. This is expected — volcanic swarms violate the simple mainshock-aftershock Omori framing. None of the volcanic sequences were assigned `volcanic` regime because `inferRegime` has no volcanic detection logic (Hawaii goes to `transform` via Pacific ring, La Palma and Bardarbunga fall to `default`).

---

## 6. Protocol Adherence Notes

1. **Mainshock definition**: Used largest reviewed event per protocol.
2. **72-hour window**: Half-open interval [start, end) per protocol.
3. **Count rules**: M>=4.0, reviewed only, within TREMOR match radius, excluding mainshock and non-tectonic events.
4. **All four scoring metrics computed** per protocol.
5. **Partial-window analysis** at t=6h, t=24h, t=72h included for time-signature bias diagnosis.
6. **No protocol definitions adjusted after seeing results.**
7. **No parameters were refit.** K_empirical values are recommendations only.

---

## 7. Recommended Next Steps

### Priority 1: K Refit Sprint (all 3 tested regimes Fail)

All regimes need K reduction. Median K_empirical values:
- subduction: 0.22 (from 25)
- transform: 0.29 (from 15)
- intraplate: 0.24 (from 8)

**Key question for refit sprint**: Is the problem the base K values, the magnitude scaling exponent (0.75), or both? The 0.75 exponent comes from Reasenberg & Jones (1989) for California sequences — it may over-amplify for large (M7+) subduction events.

### Priority 2: Validate K refit with re-run

After K refit, re-run this backtest (Run 5) to confirm:
- Relative errors drop below 60% threshold
- Bucket hit rates improve
- No regime degrades

### Priority 3: Address volcanic regime detection

`inferRegime` has no volcanic detection logic. All 3 volcanic sequences are misassigned. Low priority since volcanic Omori fit is expected to be poor regardless, but adds noise to transform/default regime analysis when those sequences are reviewed alongside volcanic ones.

---

*Phase 1 diagnostic backtest. Run 4. Not final calibration proof.*
