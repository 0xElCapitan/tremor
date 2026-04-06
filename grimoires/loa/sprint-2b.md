# TREMOR Calibration Sprint — Prompt B (v2)
# Omori Regime Backtest (Study 1)

**Prerequisite**: `grimoires/loa/calibration/omori-backtest-protocol.md` must exist at **version 2.0**. Read the protocol in full before writing any code. The protocol is authoritative — this prompt is a harness specification, not a source of truth. Where they conflict, the protocol wins.

**Scope**: Build and run the Omori backtest harness against the 19 committed sequences. Score all sequences per protocol v2.0 requirements including partial-window analysis. Produce per-regime findings and a diagnostic report in a versioned run directory. Do not refit any parameter values. Do not modify any file in `src/`.

**Stop condition**: Diagnostic report written in a versioned run directory, completion summary produced. Stop. Parameter refit is a separate sprint.

**Before editing anything**: verify all file paths, event IDs, and function names against the live repo. Treat every reference in this prompt as a hint, not ground truth. If something has drifted, use the live state and note it.

**Hard constraints**:
- Zero new runtime npm dependencies
- Do not modify any file in `src/`, `test/`, or existing run directories
- Protocol definitions are frozen — do not deviate from mainshock definition, window rules, count rules, or scoring metrics
- If a protocol definition appears wrong, flag it and stop — do not silently fix it
- No duplicate math — the harness must call TREMOR's own integration logic, not reimplement it
- All output to a new versioned run directory — do not overwrite prior runs

---

## Pre-flight (blocking — complete all before writing harness code)

### 1. Verify protocol version

Confirm `grimoires/loa/calibration/omori-backtest-protocol.md` is version 2.0. If it is an earlier version, stop and ask for the correct file. Do not proceed against a stale protocol.

### 2. Verify run directory

Check what run directories already exist:

```bash
ls grimoires/loa/calibration/omori-backtest/
```

Prior runs (run-5/, sequence-01.json through sequence-14.json, diagnostic-report.md) must not be overwritten. Determine the next run number and write all outputs to:

```
grimoires/loa/calibration/omori-backtest/run-6/
```

Create this directory before writing anything.

### 3. Verify interface — no duplicate math

Confirm that `src/theatres/aftershock.js` exports the following functions and that they can be called externally without re-implementing the integration math:

- `omoriExpectedCount(params, mainMag, thresholdMag, windowHours)` — must support partial windows (6h, 24h, 72h)
- `countToBucketProbabilities(expectedCount)`
- `inferRegime(depth_km, lat, lon)`

If any function is missing or cannot be invoked without re-implementing logic: write `grimoires/loa/calibration/omori-backtest/run-6/interface-blocker.md` describing the gap and stop. A backtest running a copy of the math is not a backtest of TREMOR.

### 4. Verify output directory support

Check whether `scripts/omori-backtest.js` supports an output directory argument (e.g., `OMORI_OUTPUT_DIR` env var). If not, add env var support before running:

```javascript
const OUTPUT_DIR = process.env.OMORI_OUTPUT_DIR 
  || 'grimoires/loa/calibration/omori-backtest';
```

If adding env var support would require changes outside `scripts/omori-backtest.js`, stop and write an interface-blocker note. Do not risk writing to the wrong directory.

### 5. Verify sequence event IDs

For the first 3 sequences in each regime tier, spot-check the event ID against the USGS event page before running. If any ID resolves to the wrong event, fetch the correct event by time and location, note the corrected ID in the run-6 output, and continue. Do not silently substitute without logging.

---

## Harness architecture

Update `scripts/omori-backtest.js` to support:
- 19 sequences (was 14)
- Primary / secondary intraplate split
- Three partial-window outputs per sequence (6h, 24h, 72h) — required, not optional
- Truncation detection and pagination per protocol
- Reviewed-status fallback rule for international sequences
- n= counts on all regime verdicts
- Configurable output directory via `OMORI_OUTPUT_DIR`

Structure:

```
For each sequence:
  a. Fetch mainshock from USGS by event ID — verify identity (lat/lon/depth/mag within tolerance)
  b. Fetch aftershock catalog (FDSN, reviewed only, matchRadius, M≥4.0, non-tectonic excluded)
  c. Apply truncation rule — if result count equals limit, paginate; if pagination fails, mark NON-COMPARABLE
  d. Apply reviewed-status check for international sequences (Petermann, Botswana) — if insufficient, apply fallback rule
  e. Run inferRegime() — record assigned regime, compare to expected
  f. Compute Omori projected count at t=6h, t=24h, t=72h using TREMOR's own omoriExpectedCount()
  g. Record actual count at each window from the fetched catalog
  h. Score: bucket hit (72h), relative error (72h), log error (72h), Brier if available
  i. Write per-sequence JSON to run-6/

After all sequences:
  j. Aggregate regime-fit results — primary intraplate and secondary intraplate separately
  k. Apply Pass/Marginal/Fail thresholds with n= counts
  l. Run bias diagnosis per regime using time-signature across 6h/24h/72h
  m. Write diagnostic report to run-6/diagnostic-report.md
```

---

## FDSN query requirements

### Mainshock fetch

```
https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson
  &eventid=<usgs_event_id>
```

Verify identity: lat/lon within 0.5°, magnitude within 0.3, depth within 10 km. If verification fails, log discrepancy and halt that sequence — do not proceed with an unverified mainshock.

### Aftershock fetch

```
https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson
  &starttime=<mainshock_utc>
  &endtime=<mainshock_utc + 72h>
  &minmagnitude=4.0
  &limit=20000
  &offset=<offset>
  &minlatitude=<matchRadius bbox>
  &maxlatitude=<matchRadius bbox>
  &minlongitude=<matchRadius bbox>
  &maxlongitude=<matchRadius bbox>
  &eventtype=earthquake
  &reviewstatus=reviewed
```

### Truncation rule (protocol requirement, not optional)

After every FDSN aftershock query:
1. If result count equals `limit` (20000): flag sequence as **TRUNCATED**, paginate using `offset` increments
2. If pagination fails or cannot complete: mark sequence as **NON-COMPARABLE**, exclude from regime verdicts, document in diagnostic report
3. Tōhoku and Maule are the highest-risk sequences for truncation — handle them with care

### International review status check

For Petermann (us10005iyk) and Botswana (us10008e3k): after fetching, verify that returned events carry `properties.status === 'reviewed'`. If fewer than 80% of events in the window are reviewed status:
1. Flag the sequence as **COVERAGE-UNCERTAIN**
2. Apply fallback rule: exclude from primary K/c/p conclusions, report as robustness-only
3. Replace with next pre-listed backup sequence in this priority order: Wells → Lincoln → Monte Cristo
4. Document the substitution in the diagnostic report

Add 500ms delay between all sequence queries.

---

## Sequence list

All definitions from protocol v2.0. Protocol is authoritative. Event IDs here are reproduced for convenience — verify against protocol before using.

### Subduction (regime-fit)

| ID | Sequence | Mainshock UTC | Event ID |
|----|----------|---------------|----------|
| 1 | 2011 Tōhoku | 2011-03-11T05:46:24Z | `official20110311054624120_30` |
| 2 | 2010 Maule | 2010-02-27T06:34:11Z | `official20100227063411530_30` |
| 3 | 2014 Iquique | 2014-04-01T23:46:47Z | `usc000nzvd` |

### Transform (regime-fit)

| ID | Sequence | Mainshock UTC | Event ID |
|----|----------|---------------|----------|
| 4 | 2019 Ridgecrest | 2019-07-06T03:19:53Z | `ci38457511` |
| 5 | 2010 El Mayor-Cucapah | 2010-04-04T22:40:42Z | `ci14607652` |

### Intraplate primary (regime-fit — use for K/c/p conclusions)

| ID | Sequence | Mainshock UTC | Event ID | Caveat |
|----|----------|---------------|----------|--------|
| 6 | 2011 Mineral, Virginia | 2011-08-23T17:51:04Z | `se609212` | — |
| 7 | 2020 Magna, Utah | 2020-03-18T13:09:46Z | `uu60363602` | — |
| 8 | 2008 Wells, Nevada | 2008-02-21T14:16:02Z | `nn00234425` | — |
| 9 | 2016 Petermann Ranges, Australia | 2016-05-20T18:14:04Z | `us10005iyk` | International — verify reviewed status |
| 10 | 2017 Moijabana, Botswana | 2017-04-03T17:40:18Z | `us10008e3k` | International — verify reviewed status |

### Intraplate secondary (sensitivity-only — do not use to establish or overturn primary verdict)

| ID | Sequence | Mainshock UTC | Event ID | Why secondary |
|----|----------|---------------|----------|---------------|
| 11 | 2017 Lincoln, Montana | 2017-07-06T06:30:17Z | `us10009757` | Intermountain Seismic Belt — active extensional zone |
| 12 | 2020 Monte Cristo Range, Nevada | 2020-05-15T11:03:27Z | `nn00725272` | Walker Lane — transtensional, not quiet craton |

Score secondary sequences but report them in a separate section. Do not include in regime verdict calculations.

### Regime-inference / edge-case (do not use for K/c/p conclusions)

| ID | Sequence | Event ID | Expected regime |
|----|----------|----------|-----------------|
| 13 | 2016 Kumamoto | — | transform or subduction boundary |
| 14 | 2016 Equatorial Atlantic M7.1 | `us20006uy6` | default (authoritative) |
| 15 | 2020 Puerto Rico M6.4 | `us70006vll` | default (authoritative) |

### Volcanic (robustness / stress-test only)

| ID | Sequence | Note |
|----|----------|------|
| 16 | 2018 Kīlauea | Mainshock definition uncertain — document which event used |
| 17 | 2021 La Palma | European catalog — note USGS coverage quality |
| 18 | 2014 Bárðarbunga | Caldera collapse — mainshock definition uncertain |

For volcanic: pick largest reviewed event as mainshock per protocol. Flag as "mainshock-definition-uncertain" in output. Do not exclude.

---

## Per-sequence output format

Write `grimoires/loa/calibration/omori-backtest/run-6/sequence-<id>.json`:

```json
{
  "sequence_id": 1,
  "label": "2011 Tōhoku",
  "role": "regime-fit",
  "intraplate_tier": null,
  "regime_assigned": "subduction",
  "regime_expected": "subduction",
  "regime_match": true,
  "mainshock_event_id": "official20110311054624120_30",
  "mainshock_event_id_verified": true,
  "mainshock_utc": "2011-03-11T05:46:24Z",
  "window_end_utc": "2011-03-14T05:46:24Z",
  "aftershock_truncated": false,
  "aftershock_paginated": false,
  "aftershock_status": "complete",
  "reviewed_coverage_pct": 100,
  "partial_windows": [
    { "window_hours": 6,  "projected": 0, "actual": 0, "relative_error": 0 },
    { "window_hours": 24, "projected": 0, "actual": 0, "relative_error": 0 },
    { "window_hours": 72, "projected": 0, "actual": 0, "relative_error": 0 }
  ],
  "projected_count": 0,
  "actual_count": 0,
  "bucket_hit": false,
  "relative_error": 0.0,
  "log_error": 0.0,
  "probability_score": null,
  "notes": ""
}
```

`intraplate_tier` should be `"primary"`, `"secondary"`, or `null` for non-intraplate sequences.

`aftershock_status` should be one of: `"complete"`, `"truncated-paginated"`, `"non-comparable"`, `"coverage-uncertain"`.

---

## Scoring

### Required at three windows (not optional)

```javascript
// For each window (6h, 24h, 72h):
const projected = omoriExpectedCount(regimeParams, mainMag, 4.0, windowHours);
const actual = catalogEvents.filter(e => 
  new Date(e.properties.time) <= mainshockTime + windowHours * 3600000
).length;
const relativeError = (projected - actual) / actual; // guard: actual === 0 → null
```

If `actual === 0` at any window: record relative error as `null` for that window, not `Infinity`. Do not let a zero-aftershock window crash the harness or corrupt other sequences.

### 72h metrics for verdict

```javascript
const relativeError72 = (projected72 - actual72) / actual72;
const logError = Math.log(projected72 + 1) - Math.log(actual72 + 1);
const bucketHit = actualBucket === projectedBucket;
```

Bucket boundaries per TREMOR: 0–2, 3–5, 6–10, 11–20, 21+.

---

## Bias diagnosis

For each regime with ≥2 primary regime-fit sequences, inspect the three-window time-signature before drawing conclusions:

| Pattern | Suspect |
|---------|---------|
| Error disproportionately large at t=6h relative to t=24h and t=72h | `c` |
| Error roughly uniform across all three windows | `K` |
| Error small at t=6h, grows by t=72h | `p` |
| Error varies by regime with no consistent time pattern | `inferRegime` assignment |

State the suspected parameter per regime. Do not recommend a specific new value — that is the refit sprint.

---

## Diagnostic report

Write `grimoires/loa/calibration/omori-backtest/run-6/diagnostic-report.md`.

Label at the top:
```
Run 6 — Protocol v2.0, 19 sequences, primary/secondary intraplate split.
Prior runs preserved at grimoires/loa/calibration/omori-backtest/
```

**Required sections**:

**1. Regime-fit results — primary sequences only**

Per-regime table. Every verdict must include n=:

| Regime | n | Bucket hit rate | Mean rel error | Mean log error | Verdict |
|--------|---|-----------------|----------------|----------------|---------|
| subduction | 3 | ... | ... | ... | Pass (n=3) |
| transform | 2 | ... | ... | ... | ... |
| intraplate (primary) | up to 5 | ... | ... | ... | ... |

**2. Intraplate secondary results** (separate section, clearly labeled sensitivity-only)

Same table format but labeled: "Sensitivity-only — do not use to establish or overturn primary intraplate verdict."

**3. Bias diagnosis per regime**

Time-signature analysis using the three-window data. State suspected parameter per regime.

**4. Regime-inference results**

`inferRegime()` output vs expected for sequences 13–15.

**5. Volcanic robustness results**

Sequences 16–18. Mainshock definition notes. Do not score against protocol thresholds.

**6. Truncation and coverage notes**

List any sequences marked TRUNCATED, NON-COMPARABLE, or COVERAGE-UNCERTAIN. State what happened to each (paginated successfully, excluded, substituted).

**7. Protocol adherence notes**

Any place a protocol definition was ambiguous or appeared wrong. Flag and describe — do not silently fix.

**8. Recommended next steps**

Which regimes need refit (Fail), which need monitoring (Marginal), which pass. For Fail regimes, state suspected parameter per bias diagnosis. Keep conclusions scoped to what the sample size supports.

---

## Completion summary expected

1. Confirm how many sequences ran vs skipped, with reasons for any skips
2. State regime-fit verdicts with n= for each
3. Note any truncation or coverage issues
4. Name highest-priority refit target if any regimes Fail
5. List protocol adherence flags
6. Stop. Do not refit parameters. Do not modify `src/`.

Run as:

```bash
OMORI_OUTPUT_DIR=grimoires/loa/calibration/omori-backtest/run-6 node scripts/omori-backtest.js
```

Verify prior run artifacts are untouched after execution before reporting done.

