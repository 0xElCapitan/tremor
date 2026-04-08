# TREMOR Sprint — Volcanic Regime Routing

**Scope**: Route volcanic events away from Aftershock Cascade and toward Swarm Watch. This is a routing policy change, not an Omori calibration. Files that may change: `src/theatres/aftershock.js`, `src/index.js`, test files (to update null assertions and add assessAftershockApplicability coverage). `BUTTERFREEZONE.md` gets one documentation line added.

**Routing policy (decide before writing any code)**: Conservative mode. When a volcanic event is detected: skip Aftershock Cascade, record a machine-readable routing decision, log a Swarm Watch recommendation, and leave the decision to open Swarm Watch to the operator. Do not auto-spawn Swarm Watch. This is the explicit policy choice — document it in code comments.

**Stop condition**: Routing helper implemented, Aftershock Cascade correctly skipped for volcanic events with structured skip results, Swarm Watch validation complete, BUTTERFREEZONE updated, tests pass. Summary written.

**Hard constraints**:
- Zero new runtime npm dependencies
- Do not change `inferRegime` return type — it must remain a plain string
- Do not change K, c, p, bath_delta, or the 0.75 scaling exponent
- Do not rewrite Swarm Watch detection logic
- `src/processor/regions.js` is out of scope
- Preserve all existing `// source:` and `// TBD:` comment blocks

---

## Background

The Omori-Utsu law assumes a clear mainshock triggering a decaying aftershock sequence via elastic stress release. Volcanic sequences are driven by magma movement, fluid migration, or caldera dynamics — not stress release. Fitting Omori K/c/p to volcanic events is category error.

TREMOR already has the right tool: Swarm Watch tracks b-value drift and escalation probability. The work here is routing, not modeling.

Two volcanic subtypes worth distinguishing:
- **Volcanic swarms**: no clear mainshock, sustained activity driven by intrusion or eruption. Omori does not apply. Route to Swarm Watch.
- **Tectonic-volcanic boundary events**: M6+ near volcanic systems with a real mainshock-aftershock structure. Omori may apply. Flag for manual review rather than auto-routing.

---

## Step 1 — Add `assessAftershockApplicability()` helper

**Location**: `src/theatres/aftershock.js` — add as a new exported function, do not modify `inferRegime`.

`inferRegime` is a pure classifier — it returns a regime string and nothing else. Routing policy is a separate concern. The new helper takes regime as input and returns a routing decision:

```javascript
/**
 * Assess whether Omori aftershock modelling applies to an event.
 * Routing policy: conservative — volcanic events skip Aftershock Cascade,
 * operator decides on Swarm Watch.
 *
 * @param {Object} params
 * @param {string} params.regime - output of inferRegime()
 * @param {number} params.mag - mainshock magnitude
 * @param {number} params.lat
 * @param {number} params.lon
 * @param {number} params.depth_km
 * @returns {{ omoriApplicable: boolean, routeTo: string, manualReview: boolean, volcanicSubtype: string|null, reason: string }}
 */
export function assessAftershockApplicability({ regime, mag, lat, lon, depth_km }) {
  if (regime === 'volcanic') {
    // Tectonic-volcanic boundary heuristic: M≥6.0 in a volcanic regime is used as a conservative
    // operational proxy for events that may have real mainshock-aftershock structure.
    // This is a routing heuristic, not a geophysical classification claim.
    // Flag for manual review rather than auto-routing.
    const isBoundaryCandidate = mag >= 6.0;
    return {
      omoriApplicable: false,
      routeTo: 'swarm_watch',
      manualReview: isBoundaryCandidate,
      volcanicSubtype: isBoundaryCandidate ? 'boundary' : 'swarm',
      reason: isBoundaryCandidate
        ? 'volcanic_boundary_candidate — Omori may apply, manual review required'
        : 'volcanic_swarm_non_omori — magma-driven swarm, Omori not applicable'
    };
  }

  return {
    omoriApplicable: true,
    routeTo: 'aftershock_cascade',
    manualReview: false,
    volcanicSubtype: null,
    reason: 'standard_tectonic'
  };
}
```

Export `assessAftershockApplicability` alongside the existing exports.

---

## Step 2 — Update `createAftershockCascade` to return structured skip results

**Location**: `src/theatres/aftershock.js` — `createAftershockCascade()`

Currently the function returns `null` for two different reasons: M<6.0 guard and any future skip. `null` is ambiguous — the caller cannot distinguish skip reasons. Change skips to return a structured result instead.

Define a skip result shape:

```javascript
// Internal helper — not exported
function skipResult(reason, detail = null) {
  return { skipped: true, reason, detail };
}
```

Update the M<6.0 guard to use this:
```javascript
// Before
if (mainMag < 6.0) return null;

// After
if (mainMag < 6.0) return skipResult('magnitude_below_threshold', { mainMag });
```

Add the volcanic routing check using the new helper:
```javascript
const routing = assessAftershockApplicability({ regime, mag: mainMag, lat, lon, depth_km });

if (!routing.omoriApplicable) {
  console.warn(
    `[TREMOR] Aftershock Cascade skipped — ${routing.reason}. ` +
    `Swarm Watch recommended. Manual review: ${routing.manualReview}`
  );
  return skipResult('volcanic_routing', routing);
}
```

**All callers of `createAftershockCascade`** must be updated to handle the new return shape. The new contract is: `createAftershockCascade` returns either a theatre object or a structured skip result `{ skipped: true, reason, detail }`. Bare null is no longer a valid return value for any skip path. Update all call sites to check `result?.skipped === true` rather than `result === null`. If any call site currently handles `=== null`, it must be updated — do not leave the old check in place alongside the new one.

---

## Step 3 — Update `src/index.js` auto-spawn logic

**Location**: `src/index.js` — wherever `createAftershockCascade` is called for M≥6.0 auto-spawns.

After calling `createAftershockCascade`, handle the structured skip result:

```javascript
const cascadeResult = createAftershockCascade({ mainshockBundle: mockBundle });

if (cascadeResult?.skipped) {
  // Record routing decision in machine-readable state
  const routeDecision = {
    event_id: bundle.payload.event_id,
    timestamp: new Date().toISOString(),
    reason: cascadeResult.reason,
    detail: cascadeResult.detail,
    swarm_watch_recommended: cascadeResult.detail?.routeTo === 'swarm_watch',
    manual_review_required: cascadeResult.detail?.manualReview ?? false
  };

  // Persist routing decision — append to a routing log, not just console
  this._routingDecisions = this._routingDecisions || [];
  this._routingDecisions.push(routeDecision);
  // Retention: keep most recent 100 decisions only — prevents unbounded growth in long-running processes
  if (this._routingDecisions.length > 100) {
    this._routingDecisions = this._routingDecisions.slice(-100);
  }

  // Surface in getState() so operators can see it without reading logs
  console.info(
    `[TREMOR] Cascade skipped (${cascadeResult.reason}) — ` +
    `Swarm Watch recommended for event ${bundle.payload.event_id}`
  );
}
```

Update `getState()` to expose `routing_decisions` so the skip is machine-readable and auditable without log reconstruction.

Do not auto-spawn Swarm Watch. This is the conservative policy — log the recommendation, leave the decision to the operator.

---

## Step 4 — Validate Swarm Watch against 3 volcanic sequences

**Goal**: Confirm Swarm Watch produces meaningful output for volcanic sequences. Qualitative validation, not scored calibration.

### Pinned sequences

| Sequence | USGS Event ID | Origin UTC | Window |
|----------|--------------|------------|--------|
| 2018 Kīlauea lower East Rift Zone initiating event | `hv70302356` | 2018-05-04T22:32:55Z | 72h from origin |
| 2021 La Palma eruption onset | `us7000f93v` | 2021-09-11T21:17:59Z | 72h from origin |
| 2014 Bárðarbunga initiating intrusion | `eu500068sg` | 2014-08-16T18:12:45Z | 72h from origin |

**Note**: verify each event ID before running — international events may have superseded IDs. If an ID resolves incorrectly, fetch by time/location and note the corrected ID in the validation output.

**Coverage fallback**: if USGS catalog coverage is too thin for a sequence (fewer than 5 M3.0+ events in the 72h window) or the initiating event cannot be reliably matched, label that sequence `NON-COMPARABLE` in the validation output and do not force a qualitative judgment. La Palma and Bárðarbunga are the highest-risk sequences for thin coverage — apply this rule without hesitation if needed.

### Fetch and run

For each sequence:
1. Fetch M3.0+ events from USGS FDSN for the 72h window from the initiating event
2. Feed through `openSwarmWatch()` and `processSwarmWatch()` for each event in time order
3. Record the following fields at end of window:

```json
{
  "sequence": "2018 Kīlauea",
  "event_id": "hv70302356",
  "swarm_watch_opened": true,
  "update_count": 0,
  "final_probability": 0.0,
  "escalation_flagged": false,
  "probability_peak": 0.0,
  "probability_moved_materially": false,
  "notes": ""
}
```

### Qualitative rubric

For each sequence, answer:
- Did Swarm Watch open?
- Did it update repeatedly as events arrived?
- Did probability move materially upward (>0.1 change)?
- Did it flag escalation before or during the most active swarm period?

**Do not score against Pass/Marginal/Fail thresholds** — Swarm Watch was not designed with the same scoring framework.

For each sequence (or NON-COMPARABLE if coverage insufficient), assign one of three labels:
- **operationally useful** — Swarm Watch opened, updated repeatedly, probability moved materially, escalation flagged appropriately
- **ambiguous** — Swarm Watch ran but output was inconclusive (low update count, flat probability, or coverage too thin to judge)
- **not useful** — Swarm Watch did not respond meaningfully to the sequence

End the validation note with a one-line conclusion per sequence and an overall recommendation: does Swarm Watch need its own calibration sprint, or is it operationally ready for volcanic routing?

Write results to `grimoires/loa/calibration/volcanic-swarm-watch-validation.md`.

---

## Step 5 — Update `BUTTERFREEZONE.md`

Add one line to the volcanic regime entry describing the routing behavior and policy:

```
Volcanic events (regime: 'volcanic'): Aftershock Cascade not spawned — Omori-Utsu does not apply to magma-driven swarms. Routing policy: conservative. Swarm Watch recommended; operator decides. Boundary candidates (M≥6.0 volcanic) flagged for manual review. Routing decisions exposed in getState().routing_decisions.
```

---

## Tests

Run `node --test` after Steps 1–3. Expected: full suite passes with zero regressions.

Check specifically:
- Any test calling `createAftershockCascade` that previously checked `=== null` must be updated to check `?.skipped === true` — update assertions and note each change in the summary
- Any test calling `inferRegime` should still receive a plain string — verify no type change
- `assessAftershockApplicability` should be directly testable as a pure function — add at minimum 3 inline assertions: volcanic swarm, volcanic boundary candidate (M6+), and standard tectonic

---

## Definition of done

- [ ] `inferRegime` return type unchanged — still a plain string
- [ ] `assessAftershockApplicability()` exported from `aftershock.js` with volcanic subtype distinction
- [ ] `createAftershockCascade` returns structured skip result (not bare null) for all skip reasons
- [ ] All existing `=== null` call sites updated to handle structured skip
- [ ] `src/index.js` records routing decisions in `this._routingDecisions` and exposes via `getState()`
- [ ] No Swarm Watch auto-spawn — conservative policy documented in comments
- [ ] Swarm Watch validated against 3 pinned volcanic sequences, results in calibration folder
- [ ] `BUTTERFREEZONE.md` routing note added
- [ ] Full test suite passes with zero regressions
- [ ] `assessAftershockApplicability` has at least 3 inline test assertions
- [ ] No K, c, p, bath_delta, or exponent values changed
- [ ] Summary states whether Swarm Watch produces meaningful output and whether it needs its own calibration sprint
