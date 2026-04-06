# TREMOR Calibration Sprint — Prompt B
# Omori Regime Backtest (Study 1)

**Prerequisite**: Prompt A must be complete. `grimoires/loa/calibration/` must exist with findings files from Studies 2–6. This prompt references the committed protocol at `grimoires/loa/calibration/omori-backtest-protocol.md` — read that file in full before writing any code.

**Scope**: Build and run the Omori backtest harness against the 14 committed sequences. Score all sequences. Produce per-regime findings and a diagnostic report. Do not refit any parameter values. Do not modify any file in `src/`.

**Stop condition**: After the diagnostic report is written, summarize findings per regime, state the bias diagnosis for each (K / c / p / inferRegime per the protocol's diagnosis order), and stop. Parameter refit is a separate sprint requiring human review of this report first.

**Hard constraints**:
- Zero new runtime npm dependencies
- Protocol definitions are frozen — do not deviate from mainshock definition, window rules, count rules, or scoring metrics as stated in `omori-backtest-protocol.md`
- Do not adjust any protocol definition after seeing results — if a definition appears wrong, flag it in the report and stop; do not silently fix it
- All output to `grimoires/loa/calibration/omori-backtest/`

---

## Pre-flight

1. Read `grimoires/loa/calibration/omori-backtest-protocol.md` in full
2. Confirm all 14 sequence event IDs are present in the protocol
3. Verify that `src/theatres/aftershock.js` exports or exposes the functions needed to compute the Omori prior externally — specifically the integrated count over a time window. If not directly exported, write a thin test harness that requires the module and calls it without modifying the module itself. **If the integration logic cannot be invoked from the harness without re-implementing it, stop. Write `grimoires/loa/calibration/omori-backtest/interface-blocker.md` describing exactly what interface is missing and what would need to be exported. Do not duplicate the integration math in `scripts/omori-backtest.js` — a backtest running a copy of the logic is not a backtest of TREMOR.**
4. Verify `src/processor/regions.js` exports `inferRegime` or equivalent — needed to test regime assignment for inference sequences

---

## Harness architecture

Write `scripts/omori-backtest.js`. Structure:

```
1. For each sequence in the committed list:
   a. Fetch catalog from USGS FDSN (reviewed events only, per protocol count rules)
   b. Apply mainshock definition per protocol
   c. Apply 72-hour window per protocol
   d. Apply count rules per protocol (M≥4.0, matchRadius, non-tectonic exclusions)
   e. Record actual count
   f. Run inferRegime() on mainshock feature — record assigned regime
   g. Compute Omori projected count using TREMOR's own integration logic
   h. Score: projected count, actual count, bucket hit, relative error, log error
   i. Write per-sequence result to grimoires/loa/calibration/omori-backtest/<sequence-id>.json

2. Aggregate results by role (regime-fit / inference / volcanic)
3. For regime-fit sequences only: compute per-regime bucket hit rate and mean relative error
4. Apply protocol result classification (Pass / Marginal / Fail) per regime
5. Write diagnostic report
```

---

## FDSN query for each sequence

```
https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson
  &starttime=<mainshock_utc>
  &endtime=<mainshock_utc + 72h>
  &minmagnitude=4.0
  &minlatitude=<matchRadius bbox>
  &maxlatitude=<matchRadius bbox>
  &minlongitude=<matchRadius bbox>
  &maxlongitude=<matchRadius bbox>
  &eventtype=earthquake
  &reviewstatus=reviewed
```

Exclude the mainshock itself from the aftershock count (match by event ID or by exact origin time).
Exclude events with `type: "quarry blast"` or `type: "explosion"`.
Add 500ms delay between sequence queries.

For large sequences (Tōhoku, Maule): the FDSN `limit` parameter defaults to 20000 — set it explicitly and check whether the result count equals the limit. If it does, paginate or note truncation in the report.

---

## Sequence list with committed IDs

All definitions from `omori-backtest-protocol.md`. Reproduce here for agent reference — protocol document is authoritative if any conflict.

### Regime-fit sequences

| ID | Sequence | Regime | Mainshock UTC | USGS event ID |
|----|----------|--------|---------------|---------------|
| 1 | 2011 Tōhoku | subduction | 2011-03-11 05:46:24 | usp000hvnu |
| 2 | 2010 Maule | subduction | 2010-02-27 06:34:11 | usp000h60h |
| 3 | 2014 Iquique | subduction | 2014-04-01 23:46:47 | usc000nzvd |
| 4 | 2019 Ridgecrest | transform | 2019-07-06 03:19:53 | ci38457511 |
| 5 | 2010 El Mayor-Cucapah | transform | 2010-04-04 22:40:42 | usp000hb3e |
| 6 | 2011 Mineral, Virginia | intraplate | 2011-08-23 17:51:04 | se609212 |
| 7 | 2020 Magna, Utah | intraplate | 2020-03-18 13:09:46 | uu60363602 |

**Note on USGS event IDs**: treat these as best-available hints. Verify each against `https://earthquake.usgs.gov/earthquakes/eventpage/<id>` before running. If an ID resolves to the wrong event, log the discrepancy, fetch the correct event by time/location, and note the corrected ID in the report.

### Regime-inference / edge-case sequences

| ID | Sequence | Purpose | Expected regime |
|----|----------|---------|-----------------|
| 8 | 2016 Kumamoto | Complex sequence, foreshock ambiguity | transform or subduction boundary |
| 9 | 2008 Wells, Nevada | Basin and Range ambiguity | default or intraplate |
| 10 | 2016 Equatorial Atlantic M7.1 | Outside bbox, open ocean | default |
| 11 | 2020 Puerto Rico M6.4 | Bbox boundary, oblique normal faulting | default |

Event IDs for 10 and 11: `us20006uy6` and `us70006vll` respectively (verified by human, treat as authoritative).

For inference sequences: record `inferRegime()` output and compare to expected. Do not use these results for K/c/p calibration conclusions. Report them separately.

### Volcanic sequences (robustness / stress-test)

| ID | Sequence | Note |
|----|----------|------|
| 12 | 2018 Kīlauea | High-volume swarm, mainshock definition may be ambiguous — document which event is used |
| 13 | 2021 La Palma | European catalog, note if USGS coverage is thinner |
| 14 | 2014 Bárðarbunga | High-volume, likely mainshock definition challenge |

For volcanic sequences: if mainshock is ambiguous per the protocol definition, document the ambiguity, pick the largest reviewed event, and flag the sequence as "mainshock-definition-uncertain" in the report. Do not exclude — run it and label the result accordingly.

---

## Scoring per sequence

Compute all four metrics per the protocol. No exceptions.

```javascript
const relativeError = (projected - actual) / actual;  // signed
const logError = Math.log(projected + 1) - Math.log(actual + 1);
const bucketHit = actualBucket === projectedBucket;  // boolean
// probabilityScore: if TREMOR outputs bucket probabilities, compute Brier; else null
```

Where `actualBucket` is determined by TREMOR's own bucket boundaries:
- 0–2 aftershocks
- 3–5
- 6–10
- 11–20
- 21+

---

## Per-sequence output format

Write `grimoires/loa/calibration/omori-backtest/<sequence-id>.json`:

```json
{
  "sequence_id": 1,
  "label": "2011 Tōhoku",
  "role": "regime-fit",
  "regime_assigned": "subduction",
  "regime_expected": "subduction",
  "regime_match": true,
  "mainshock_event_id": "usp000hvnu",
  "mainshock_utc": "2011-03-11T05:46:24Z",
  "window_end_utc": "2011-03-14T05:46:24Z",
  "actual_count": 0,
  "projected_count": 0,
  "bucket_hit": false,
  "relative_error": 0.0,
  "log_error": 0.0,
  "probability_score": null,
  "notes": ""
}
```

---

## Bias diagnosis (run after all sequences complete)

Per the protocol's diagnosis order — check time-signature first, not just total count:

For each regime with ≥2 regime-fit sequences:
1. Plot (or tabulate) projected vs actual count at t=6h, t=24h, t=72h if TREMOR's integration supports partial windows. If not, use total 72h count only and note the limitation.
2. Apply diagnosis order:
   - Wrong at t=0–6h → suspect `c`
   - Broadly high/low across full window → suspect `K`
   - Starts correct, drifts by t=72h → suspect `p`
   - Varies by regime without time signature → suspect `inferRegime`
3. State which parameter is suspected per regime. Do not recommend a specific new value — that is the refit sprint.

---

## Diagnostic report

Write `grimoires/loa/calibration/omori-backtest/diagnostic-report.md`:

**Sections**:

1. **Regime-fit results** — per-regime table: bucket hit rate, mean relative error, mean log error, Pass/Marginal/Fail per protocol thresholds
2. **Bias diagnosis per regime** — which parameter is suspected and why, based on time-signature analysis
3. **Regime-inference results** — did `inferRegime()` assign the expected regime for sequences 8–11? Note any misassignments.
4. **Volcanic robustness results** — how did the volcanic sequences behave? Note mainshock-definition challenges and any sequences where Omori framing clearly breaks down.
5. **Protocol adherence notes** — any place where a protocol definition was ambiguous or appeared incorrect. Do not silently adjust — flag and describe.
6. **Recommended next steps** — which regimes need refit (Fail), which need monitoring (Marginal), which pass. For each Fail regime, state which parameter to refit first per the bias diagnosis.

**Label throughout**: Phase 1 diagnostic backtest. Not final calibration proof.

---

## Completion summary expected

1. Confirm all 14 sequences ran (or explain why any were skipped)
2. State overall regime-fit Pass/Marginal/Fail counts
3. Name the single highest-priority refit target if any regimes Fail
4. List any protocol adherence flags
5. Stop. Do not refit parameters. Do not modify `src/theatres/aftershock.js`.
