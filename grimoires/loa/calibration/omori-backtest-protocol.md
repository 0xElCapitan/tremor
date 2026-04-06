# TREMOR Omori Backtest Protocol

**Version**: 2.0
**Date**: 2026-04-06
**Supersedes**: v1.0 (2026-04-05)
**Status**: Pre-committed — do not deviate from these definitions during or after backtest execution.
**Purpose**: Freeze all experimental parameters before running the backtest. If a result looks wrong, the protocol is the first thing you check — not the sequence list.

---

## Protocol versioning rule

This document is versioned. Once a backtest run begins against a given version, that version is frozen.

If a definition needs to change after seeing results:
1. Preserve the current version unchanged — do not edit it
2. Create a new version (v2.1, v3.0, etc.) with the change documented and the reason stated
3. Re-run the entire backtest against the new version — not just the affected sequences — if the change touches shared definitions (mainshock rule, window, count rules, scoring). If the change is sequence-specific, re-run only that sequence.

Never silently evolve a living protocol document after results are in.

---

## Separation of concerns

This backtest tests two distinct things. Keep them separate or results become uninterpretable.

| Test type | Question | How to identify |
|-----------|----------|-----------------|
| **Regime-fit** | Are K/c/p correct for this regime? | Regime assignment is unambiguous from location and depth |
| **Regime-inference** | Does `inferRegime` assign the right regime? | Regime assignment is contested or boundary-case |

Never use a regime-inference case to draw conclusions about K/c/p calibration. Never use a regime-fit case to draw conclusions about `inferRegime` accuracy.

---

## Sequence list

### Regime-fit sequences — subduction

All sequences fully pinned. Use the event ID to fetch the mainshock record. Do not substitute a different record without creating a new protocol version.

| Sequence | USGS Event ID | Origin UTC | Lat/Lon | Depth | Expected regime |
|----------|--------------|------------|---------|-------|-----------------|
| 2011 Tōhoku, Japan | `official20110311054624120_30` | 2011-03-11T05:46:24Z | 38.297°N, 142.373°E | 29.0 km | subduction |
| 2010 Maule, Chile | `official20100227063411530_30` | 2010-02-27T06:34:11Z | 35.909°S, 72.733°W | 22.9 km | subduction |
| 2014 Iquique, Chile | `usc000nzvd` | 2014-04-01T23:46:47Z | 19.610°S, 70.769°W | 25.0 km | subduction |

### Regime-fit sequences — transform

| Sequence | USGS Event ID | Origin UTC | Lat/Lon | Depth | Expected regime |
|----------|--------------|------------|---------|-------|-----------------|
| 2019 Ridgecrest, California | `ci38457511` | 2019-07-06T03:19:53Z | 35.770°N, 117.599°W | 8.0 km | transform |
| 2010 El Mayor-Cucapah, Mexico | `ci14607652` | 2010-04-04T22:40:42Z | 32.286°N, 115.295°W | 10.0 km | transform |

### Regime-fit sequences — intraplate (primary)

Primary sequences: clean stable-craton events, strong aftershock signal, highest confidence for K/c/p conclusions.

| Sequence | USGS Event ID | Origin UTC | Lat/Lon | Depth | Expected regime | M≥4.0 aftershocks (72h) |
|----------|--------------|------------|---------|-------|-----------------|--------------------------|
| 2011 Mineral, Virginia | `se609212` | 2011-08-23T17:51:04Z | 37.936°N, 77.933°W | 6.0 km | intraplate | ~2 |
| 2020 Magna, Utah | `uu60363602` | 2020-03-18T13:09:46Z | 40.702°N, 112.080°W | 11.9 km | intraplate | ~3 |
| 2008 Wells, Nevada | `nn00234425` | 2008-02-21T14:16:02Z | 41.144°N, 114.872°W | 7.9 km | intraplate | ~7 |
| 2016 Petermann Ranges, Australia | `us10005iyk` | 2016-05-20T18:14:04Z | 25.566°S, 129.884°E | 10.0 km | intraplate | ~2 (M4.2, M4.4 confirmed) |
| 2017 Moijabana, Botswana | `us10008e3k` | 2017-04-03T17:40:18Z | 22.678°S, 25.156°E | 29.0 km | intraplate | ~11 Mb4-5 total |

**Coverage note for Petermann and Botswana**: USGS reviewed status may not surface inline via the standard FDSN `reviewstatus=reviewed` filter for some international events. Before including in K/c/p conclusions, verify reviewed status explicitly — see fallback rule below.

### Regime-fit sequences — intraplate (secondary / sensitivity-only)

These sequences are tectonically less clean than primary. Use only for sensitivity checks after the primary set has established a baseline verdict. Do not use to establish or overturn a Pass/Marginal/Fail verdict on their own.

| Sequence | USGS Event ID | Origin UTC | Lat/Lon | Depth | Expected regime | Why secondary |
|----------|--------------|------------|---------|-------|-----------------|---------------|
| 2017 Lincoln, Montana | `us10009757` | 2017-07-06T06:30:17Z | 46.881°N, 112.575°W | 12.2 km | intraplate | Intermountain Seismic Belt — intracontinental but active extensional zone |
| 2020 Monte Cristo Range, Nevada | `nn00725272` | 2020-05-15T11:03:27Z | 38.169°N, 117.850°W | 2.7 km | intraplate | Walker Lane — transtensional, not quiet stable craton. Sensitivity-only. |

Monte Cristo does not belong in the primary evidence base. Do not promote it to primary without creating a new protocol version with justification.

### Regime-inference / edge-case sequences (do not use for K/c/p conclusions)

| Sequence | USGS Event ID | Purpose | Expected `inferRegime` output |
|----------|--------------|---------|-------------------------------|
| 2016 Kumamoto, Japan | — | Complex sequence — foreshock/mainshock ambiguity | transform or subduction boundary |
| ~~2008 Wells, Nevada~~ | `nn00234425` | Promoted to primary intraplate — `inferRegime` correctly assigns after sprint-intraplate-fix | — |
| 2016 Equatorial Atlantic M7.1 | `us20006uy6` | 0.046°S, 17.826°W — outside bbox, open ocean | default |
| 2020 Puerto Rico M6.4 | `us70006vll` | 17.958°N, 66.811°W — bbox boundary, oblique normal faulting | default |

### Volcanic sequences (robustness / stress-test only — not K/c/p calibration)

| Sequence | Rationale |
|----------|-----------|
| 2018 Kīlauea, Hawaii | High-volume magma-driven swarm — Omori not applicable |
| 2021 La Palma, Canary Islands | European catalog, precursory eruption swarm |
| 2014 Bárðarbunga, Iceland | Caldera collapse rifting episode |

Volcanic results inform robustness assessment only. Do not refit K/c/p from these sequences.

---

## Fallback rule for sequences failing review coverage

If a sequence cannot be verified as reviewed status before the backtest runs:
1. Exclude it from regime-fit K/c/p conclusions
2. Move it to robustness-only for that run
3. Document the exclusion explicitly in the diagnostic report with the reason
4. Replace it with the next pre-listed sequence in priority order: Wells → Petermann → Botswana → Lincoln → Monte Cristo

Never improvise sequence substitution after results are in. If the pre-listed backup list is exhausted and the primary intraplate set has fewer than 3 sequences, note this as a limitation — do not add new sequences mid-run.

---

## Mainshock definition (precommitted)

- **Mainshock** = the largest magnitude event initiating the modeled sequence window, identified in the USGS catalog at reviewed status, matched by the event ID above.
- For sequences with a clear foreshock (e.g., Kumamoto M6.2 on 2016-04-14): the mainshock is the larger event (M7.3 on 2016-04-16). The foreshock is excluded from the aftershock count window.
- For sequences where the largest event is ambiguous (swarms): document the ambiguity, assign to inference/robustness testing, exclude from K/c/p conclusions.

---

## 72-hour window definition (precommitted)

- **Window start**: mainshock origin time UTC from the pinned event ID above
- **Window end**: mainshock origin time + 72 hours exactly
- Events at window boundaries: include start, exclude end (half-open interval)
- Foreshocks before window start: excluded

---

## Count rules (precommitted)

- **Magnitude threshold**: M≥4.0
- **Geographic inclusion**: TREMOR's own `matchRadius` calculation (1.5× Wells & Coppersmith rupture length ÷ 111 km)
- **Catalog version**: USGS reviewed events only. Automatic-only events excluded.
- **Duplicate handling**: if an event has multiple `updated` timestamps, use the most recent reviewed version
- **Non-tectonic exclusions**: `type: "quarry blast"` or `type: "explosion"` excluded

### Query truncation and pagination (protocol-level requirement)

For every FDSN aftershock query:
1. Set `limit=20000` explicitly
2. After each query, check whether result count equals the limit
3. If result count equals limit: flag the sequence as **TRUNCATED**, paginate using `offset` until all events are retrieved, and note the total paginated count in the sequence JSON
4. If pagination fails or cannot be completed: mark the sequence as **NON-COMPARABLE** for that run and exclude it from regime verdicts — do not use a truncated count to draw conclusions
5. Tōhoku and Maule are the sequences most likely to trigger truncation

---

## Scoring metrics (all required per sequence)

### Required outputs at three time windows

For every sequence, compute projected vs actual at:
- **t = 6 hours** — early-time window (bias here implicates `c`)
- **t = 24 hours** — mid-window
- **t = 72 hours** — full window

This is required for bias diagnosis. Do not infer time-shape from the total-window count alone.

### Per-sequence metrics

| Metric | Definition |
|--------|-----------|
| **Projected count (6h/24h/72h)** | TREMOR's Omori prior integrated to each window |
| **Actual count (6h/24h/72h)** | Catalog count per rules above at each window |
| **Bucket hit** | Boolean — did actual 72h count land in predicted bucket? |
| **Relative error** | `(projected_72h − actual_72h) / actual_72h` — signed |
| **Log error** | `log(projected_72h + 1) − log(actual_72h + 1)` |
| **Probability score** | Brier score against actual bucket if bucket probabilities available |

---

## Bias diagnosis order

Inspect time-signature across the three windows before drawing any refit conclusions:

1. **Model wrong at t=6h disproportionately** → suspect `c` (offset parameter controls early-time decay)
2. **Model broadly too high or low across all three windows uniformly** → suspect `K` (productivity)
3. **Model near-correct at t=6h but drifts by t=72h** → suspect `p` (decay exponent)
4. **Bias varies by regime without a time signature** → suspect `inferRegime` assignment

Do not refit more than one parameter at a time without a clear signal.

---

## Result classification

| Outcome | Threshold | Interpretation |
|---------|-----------|----------------|
| **Pass** | Bucket hit rate ≥ 70%, mean relative error < 30% | Parameters directionally correct |
| **Marginal** | Bucket hit 50–70% or relative error 30–60% | Parameters plausible, flag for calibration |
| **Fail** | Bucket hit < 50% or relative error > 60% | Parameters need refit |

**Required**: every verdict must display sample size explicitly:
- Pass (n=3)
- Marginal (n=2)
- Fail (n=5)

A regime with n=2 sequences carries less weight than n=5. Do not allow small-N passes to read as strong evidence.

Apply thresholds to primary regime-fit sequences only. Secondary/sensitivity sequences reported separately. Inference and volcanic sequences not scored.

---

## What this backtest can and cannot conclude

**Can conclude:**
- Directional bias per regime
- Which regimes are clearly broken vs plausible
- Which parameter (K, c, or p) is the likely source of bias based on time-signature

**Cannot conclude:**
- Tight parameter confidence intervals
- Final calibration values ready for production merge without human review
- Intraplate verdict with n<3 primary sequences is provisional by definition
- Volcanic Omori parameters (wrong model for that question)

**Label all outputs as**: Phase 1 diagnostic backtest. Not final calibration proof.

---

## Protocol change rule

If a definition needs to change after seeing results:
1. Do not edit this file
2. Create v2.1 (or next version) with the change, reason, and triggering result documented
3. Re-run affected sequences (full set if shared definitions changed)
4. Preserve all prior version artifacts — never overwrite

