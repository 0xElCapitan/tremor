# Omori Regime Backtest — Diagnostic Report

Run 6 — Protocol v2.0, 19 sequences, primary/secondary intraplate split.
Prior runs preserved at grimoires/loa/calibration/omori-backtest/

**Phase**: 1 diagnostic backtest. Not final calibration proof.
**Date**: 2026-04-06
**Sequences**: 18 ran / 0 errored / 18 total
**Direct-computed (M<6.0)**: 6 (via exported omoriExpectedCount/inferRegime)

---

## 1. Regime-Fit Results — Primary Sequences Only

### Per-Sequence Results

| # | Sequence | Regime (assigned) | Regime (expected) | Projected | Actual | Bucket Hit | Rel Error | Log Error | Brier |
|---|----------|-------------------|-------------------|-----------|--------|------------|-----------|-----------|-------|
| 1 | 2011 Tōhoku | subduction | subduction | 1128.6 | 1422 | ✓ | -20.6% | -0.231 | 0 |
| 2 | 2010 Maule | subduction | subduction | 672.3 | 672 | ✓ | 0.0% | 0 | 0 |
| 3 | 2014 Iquique | subduction | subduction | 238.5 | 238 | ✓ | 0.2% | 0.002 | 0 |
| 4 | 2019 Ridgecrest | transform | transform | 57.4 | 67 | ✓ | -14.3% | -0.152 | 0 |
| 5 | 2010 El Mayor-Cucapah | transform | transform | 68.2 | 57 | ✓ | 19.6% | 0.177 | 0 |
| 6 | 2011 Mineral, Virginia | intraplate | intraplate | 3.4 | 2 | ✗ | 70.0% | 0.383 | 0.1449 |
| 7 | 2020 Magna, Utah | intraplate | intraplate | 2.8 | 4 | ✓ | -30.0% | -0.274 | 0.0994 |
| 8 | 2008 Wells, Nevada | intraplate | intraplate | 4 | 8 | ✗ | -50.0% | -0.588 | 0.195 |
| 9 | 2016 Petermann Ranges, Australia | intraplate | intraplate | 4.8 | 6 | ✗ | -20.0% | -0.188 | 0.1455 |
| 10 | 2017 Moijabana, Botswana | intraplate | intraplate | 11.3 | 5 | ✗ | 126.0% | 0.718 | 0.284 |

### Per-Regime Verdicts

| Regime | n | Bucket Hit Rate | Mean Rel Error | Mean Log Error | Verdict |
|--------|---|-----------------|----------------|----------------|---------|
| subduction | 3 | 100.0% | 6.9% | 0.078 | **Pass** (n=3) |
| transform | 2 | 100.0% | 16.9% | 0.164 | **Pass** (n=2) |
| intraplate | 5 | 20.0% | 59.2% | 0.430 | **Fail** (n=5) |

**Untested regimes**: volcanic, default

---

## 2. Intraplate Secondary Results

**Sensitivity-only — do not use to establish or overturn primary intraplate verdict.**

| # | Sequence | Regime (assigned) | Projected | Actual | Bucket Hit | Rel Error | Log Error | Why Secondary |
|---|----------|-------------------|-----------|--------|------------|-----------|-----------|---------------|
| 11 | 2017 Lincoln, Montana | intraplate | 3.4 | 2 | ✗ | 70.0% | 0.383 | Intermountain Seismic Belt — active extensional zone |
| 12 | 2020 Monte Cristo Range, Nevada | intraplate | 11.3 | 23 | ✗ | -50.9% | -0.668 | Walker Lane — transtensional, not quiet craton |

---

## 3. Bias Diagnosis Per Regime

Protocol diagnosis order: c (early-time) → K (total) → p (drift) → inferRegime (regime variance).

### subduction

**Parameters**: K=0.22, c=0.05, p=1.05
**Sequences**: n=3

**Direction**: Mixed — 2 over-predictions, 1 under-predictions.

**Time-signature analysis** (6h/24h/72h):

| Sequence | 6h proj/act | 24h proj/act | 72h proj/act | Pattern |
|----------|-------------|--------------|--------------|---------|
| 2011 Tōhoku | 520.5/183 | 857.7/672 | 1128.6/1422 | Early bias (suspect c) |
| 2010 Maule | 310.1/128 | 510.9/411 | 672.3/672 | Early bias (suspect c) |
| 2014 Iquique | 110/73 | 181.3/130 | 238.5/238 | Uniform bias (suspect K) |

**Suspected parameter**: **c** (time offset) — 2/3 sequences show early-time bias.

- **2011 Tōhoku**: projected 1128.6 vs actual 1422 → UNDER (rel error: -20.6%)
- **2010 Maule**: projected 672.3 vs actual 672 → OVER (rel error: 0.0%)
- **2014 Iquique**: projected 238.5 vs actual 238 → OVER (rel error: 0.2%)

### transform

**Parameters**: K=0.291, c=0.03, p=1.1
**Sequences**: n=2

**Direction**: Mixed — 1 over-predictions, 1 under-predictions.

**Time-signature analysis** (6h/24h/72h):

| Sequence | 6h proj/act | 24h proj/act | 72h proj/act | Pattern |
|----------|-------------|--------------|--------------|---------|
| 2019 Ridgecrest | 31.1/56 | 46.3/65 | 57.4/67 | Uniform bias (suspect K) |
| 2010 El Mayor-Cucapah | 36.9/31 | 55/42 | 68.2/57 | Uniform bias (suspect K) |

**Suspected parameter**: **K** (productivity) — 2/2 sequences show uniform bias across all time windows.

- **2019 Ridgecrest**: projected 57.4 vs actual 67 → UNDER (rel error: -14.3%)
- **2010 El Mayor-Cucapah**: projected 68.2 vs actual 57 → OVER (rel error: 19.6%)

### intraplate

**Parameters**: K=0.24, c=0.08, p=0.95
**Sequences**: n=5

**Direction**: Mixed — 2 over-predictions, 3 under-predictions.

**Time-signature analysis** (6h/24h/72h):

| Sequence | 6h proj/act | 24h proj/act | 72h proj/act | Pattern |
|----------|-------------|--------------|--------------|---------|
| 2011 Mineral, Virginia | 1.2/0 | 2.3/1 | 3.4/2 | Early bias (suspect c) |
| 2020 Magna, Utah | 1/3 | 2/4 | 2.8/4 | Uniform bias (suspect K) |
| 2008 Wells, Nevada | 1.5/3 | 2.8/5 | 4/8 | Uniform bias (suspect K) |
| 2016 Petermann Ranges, Australia | 1.7/1 | 3.3/6 | 4.8/6 | Uniform bias (suspect K) |
| 2017 Moijabana, Botswana | 4.1/3 | 7.8/3 | 11.3/5 | Uniform bias (suspect K) |

**Suspected parameter**: **K** (productivity) — 4/5 sequences show uniform bias across all time windows.

- **2011 Mineral, Virginia**: projected 3.4 vs actual 2 → OVER (rel error: 70.0%)
- **2020 Magna, Utah**: projected 2.8 vs actual 4 → UNDER (rel error: -30.0%)
- **2008 Wells, Nevada**: projected 4 vs actual 8 → UNDER (rel error: -50.0%)
- **2016 Petermann Ranges, Australia**: projected 4.8 vs actual 6 → UNDER (rel error: -20.0%)
- **2017 Moijabana, Botswana**: projected 11.3 vs actual 5 → OVER (rel error: 126.0%)

---

## 4. Regime-Inference Results

| # | Sequence | Expected | Assigned | Match |
|---|----------|----------|----------|-------|
| 13 | 2016 Kumamoto | transform or subduction boundary | transform | ✓ |
| 14 | 2016 Equatorial Atlantic M7.1 | default | transform | ✗ |
| 15 | 2020 Puerto Rico M6.4 | default | transform | ✗ |

### Misassignments

- **2016 Equatorial Atlantic M7.1**: assigned `transform` but expected `default`. Depth: 10km, Location: north of Ascension Island
- **2020 Puerto Rico M6.4**: assigned `transform` but expected `default`. Depth: 6km, Location: 4 km SSE of Indios, Puerto Rico

---

## 5. Volcanic Robustness Results

Robustness/stress-test only. Do not score against protocol thresholds. Do not refit K/c/p from these.

| # | Sequence | Regime | Projected | Actual | Bucket Hit | Notes |
|---|----------|--------|-----------|--------|------------|-------|
| 16 | 2018 Kīlauea | transform | 40.6 | 8 | ✗ | Mainshock definition uncertain — using largest reviewed event |
| 17 | 2021 La Palma | default | 37.1 | 0 | ✗ | European catalog — USGS coverage may be thin |
| 18 | 2014 Bárðarbunga | default | 208.5 | 1 | ✗ | Caldera collapse — mainshock definition uncertain |

---

## 6. Truncation and Coverage Notes

No truncation or coverage issues detected.

---

## 7. Protocol Adherence Notes

1. **Protocol version**: v2.0 confirmed before execution.
2. **Mainshock definition**: Used event ID from protocol; searched for largest reviewed event when ID not provided. Volcanic sequences flagged as mainshock-definition-uncertain.
3. **Mainshock verification**: lat/lon within 0.5°, magnitude within 0.3, depth within 10km tolerance applied per protocol.
4. **72-hour window**: Half-open interval [start, end) per protocol.
5. **Count rules**: M≥4.0, reviewed only, within TREMOR matchRadius, excluding mainshock and non-tectonic events.
6. **Scoring**: All metrics computed (projected count, bucket hit, relative error, log error, Brier). Three-window partial analysis (6h/24h/72h) for bias diagnosis.
7. **No duplicate math**: All Omori calculations via TREMOR's exported `omoriExpectedCount()`. M<6.0 sequences via direct function calls; M≥6.0 via `createAftershockCascade()`.
8. **Truncation handling**: `limit=20000` on all queries; pagination attempted when limit hit.
9. **International coverage**: Petermann and Botswana checked for reviewed-status coverage with 80% threshold.
10. **Intraplate split**: Primary (n=up to 5) and secondary (n=2) reported separately per protocol.
11. **500ms delay**: Applied between all FDSN queries.

---

## 8. Recommended Next Steps

- **subduction** (n=3): **PASS**. Parameters directionally correct.
- **transform** (n=2): **PASS**. Parameters directionally correct.
- **intraplate** (n=5): **REFIT NEEDED** (Fail). Systematically under-predicting. Current K=0.24. Suspected parameter per bias diagnosis above.

---

*Phase 1 diagnostic backtest. Not final calibration proof.*
