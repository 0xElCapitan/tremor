# ISC Bulletin Verification Study
# Can ISC recover USGS automatic-stage magnitudes?

**Purpose**: Determine whether the ISC Bulletin preserves NEIC/USGS automatic-stage magnitude values and timing closely enough to serve as a proxy for the automatic→reviewed transition — specifically for use in Studies 2, 3, and 5 (doubt-price CI coverage, settlement discount calibration, quality weight refit).

**Scope**: Feasibility and provenance check only. This is not a population-representative validation study. Results establish whether ISC is worth using as a proxy source, not whether ISC-derived calibration would be unbiased. State this explicitly in the output.

**Output**: `grimoires/loa/calibration/isc-provenance-verification.md` — a go/no-go recommendation with evidence.

**Stop condition**: Write the recommendation file and stop. Do not begin any calibration study. Do not modify any source file.

**Hard constraints**:
- Zero new runtime npm dependencies
- All ISC queries use public endpoints (no auth required)
- 500ms delay between API requests
- Do not draw calibration conclusions from ISC data in this sprint — this sprint only determines whether ISC can be used at all

---

## Background

The USGS FDSN API does not preserve automatic-stage event records (documented in `grimoires/loa/calibration/data-provenance-blocker.md`). The ISC Bulletin aggregates magnitude reports from multiple contributing agencies including NEIC (USGS's network). The hypothesis is that ISC may retain an early NEIC magnitude report corresponding to the USGS automatic-stage value, before USGS internal review overwrites it.

The key unknown: does the NEIC magnitude entry in ISC correspond to the automatic-stage value, the reviewed value, or something in between?

---

## Phase 0 — API and metadata preflight (do this before building the event list)

Before investing time in event selection, verify that the ISC API exposes the metadata needed to run this study at all. Test on 2–3 well-known events (e.g., 2020 Puerto Rico M6.4 `us70006vll`, 2021 Haiti M7.2, 2019 Ridgecrest M7.1).

For each test event, confirm:
1. The chosen endpoint returns the event successfully
2. NEIC is present as a contributing author/agency in the magnitude list
3. Multiple magnitude entries are returned for the event (not just one final value)
4. A timestamp or explicit ordering field is present on those entries that would allow identifying which came first

**ISC endpoints to try** (try IRIS mirror first — more stable):

```
# IRIS mirror (FDSN-compatible)
https://isc-mirror.iris.washington.edu/fdsnws/event/1/query
  ?format=text
  &starttime=<utc>
  &endtime=<utc+1h>
  &latitude=<lat>
  &longitude=<lon>
  &maxradius=1.0
  &includeallmagnitudes=true
  &includeallorigins=true

# ISC direct (CSV bulletin)
http://www.isc.ac.uk/cgi-bin/web-db-v4
  ?request=BULLETIN
  &out_format=CSV
  &ctr_lat=<lat>&ctr_lon=<lon>&radius=1.0
  &start_year=...&req_mag_agcy=NEIC&req_mag_type=Any
```

**Preflight outcomes**:
- If neither endpoint works: write `grimoires/loa/calibration/isc-api-blocker.md` and stop.
- If endpoints work but NEIC entries are absent, single-valued, or lack ordering metadata: write `grimoires/loa/calibration/isc-metadata-blocker.md` explaining exactly what is and is not present, and stop. Do not proceed to event list construction — the study cannot answer its core question without this metadata.
- If endpoints work and metadata is sufficient: document which endpoint, which fields, and what ordering information is available. Proceed to Phase 1.

---

## Phase 1 — Event list construction (manual, blocking)

**Selection criteria** — each event must satisfy all of the following:

1. **Known magnitude revision ≥ 0.2 units**: the USGS reviewed magnitude differs from the initial automatic estimate by at least 0.2 magnitude units. Source the known automatic-stage magnitude from press coverage at the time, USGS ShakeAlert records, or seismological literature — not from inference.
2. **M5.5 or larger**: smaller events may not have enough agency contributions in ISC.
3. **ISC Reviewed Bulletin coverage**: the ISC Reviewed Bulletin is approximately 24 months behind real time. Select events from before 2024-01-01 only.
4. **Geographic spread**: at least 2 events per tectonic setting (subduction, transform, intraplate). Do not cluster in one region.
5. **Known approximate automatic-stage magnitude with cited source**: the comparison target must come from a contemporary external source, not from inference or reconstruction.

**Sample size**: 15 events.

**Important limitation to state explicitly**: This sample is hand-picked from high-visibility revision cases where automatic-stage magnitudes happen to be documented. It is not a random or representative sample of the events TREMOR would use for calibration. The feasibility verdict from this study applies to this class of events — whether ISC coverage is adequate across the full M4+ population is a separate question that requires broader sampling.

**Before running any script**: write the event list to `grimoires/loa/calibration/isc-verification-event-list.md` with columns: USGS event ID, location, date, known automatic-stage magnitude, source of that value, known reviewed magnitude. Then stop and get human confirmation before proceeding to Phase 2.

---

## Phase 2 — ISC query and classification

For each confirmed event:

### Event matching

Search ISC using a ±30 minute time window and 1.0 degree radius around the USGS origin. If multiple ISC candidates are returned, apply all four of the following checks to select the correct one — do not skip any:
1. Nearest origin time to the USGS origin time
2. Magnitude within ±0.5 units of the USGS reviewed magnitude
3. Location within 0.5 degrees of the USGS epicenter
4. Record the chosen ISC event ID in the output — if no candidate passes all checks, classify the event as `NO_MATCH` and move on

### NEIC magnitude extraction

Once the ISC event is identified, filter to NEIC-contributed magnitude entries only (`author = NEIC` or `contributor = NEIC`).

To identify the earliest NEIC entry: use report timestamp if explicitly present in the API response. **If timestamp is not available, classify as `AMBIGUOUS` — do not infer "earliest" from magnitude type precedence or any other proxy.** Magnitude type ordering is not a reliable time proxy and using it would smuggle in an inference that this study is designed to test empirically.

### Per-event classification

- `MATCH` — earliest NEIC ISC entry (by explicit timestamp) matches the known automatic-stage magnitude within ±0.1 units
- `REVIEWED_ONLY` — NEIC ISC entry matches only the reviewed magnitude, not the automatic-stage value
- `NO_NEIC` — no NEIC magnitude contribution found in ISC for this event
- `NO_MATCH` — ISC event could not be unambiguously matched to the USGS event
- `AMBIGUOUS` — NEIC entries present but no timestamp available to determine ordering, or multiple entries that cannot be disambiguated

---

## Phase 3 — Scoring

Report three rates. All three are required. The recommendation depends on all three.

**Rate 1 — Raw match rate**
```
MATCH count / 15 (all events)
```
Denominator is always 15. NO_NEIC, NO_MATCH, and AMBIGUOUS all count against this rate.

**Rate 2 — Conditional match rate**
```
MATCH count / (MATCH + REVIEWED_ONLY count)
```
Among events where ISC returned a usable NEIC entry with clear stage ordering, what fraction matched the automatic-stage value? Excludes NO_NEIC, NO_MATCH, and AMBIGUOUS from denominator.

**Rate 3 — Usable NEIC coverage rate**
```
(MATCH + REVIEWED_ONLY) count / 15
```
What fraction of events had a usable NEIC entry at all? This measures practical coverage, not just accuracy.

### Go/no-go thresholds

| Recommendation | Required conditions |
|----------------|-------------------|
| **GO** | Raw match rate ≥ 60% AND conditional match rate ≥ 75% AND usable NEIC coverage ≥ 80% (12 of 15) |
| **MARGINAL** | Does not meet GO, but raw match rate ≥ 40% AND usable NEIC coverage ≥ 60% (9 of 15) |
| **NO-GO** | Any condition below MARGINAL floor |

If usable NEIC coverage is below 80%, cap the recommendation at MARGINAL regardless of how strong the conditional match rate looks. A system that matches well only when data happens to exist is not fully viable.

---

## Output: `grimoires/loa/calibration/isc-provenance-verification.md`

Sections:

**1. Scope statement** — copy this verbatim at the top:
> This is a feasibility and provenance study, not a population-representative validation study. The event sample is hand-picked from high-visibility revision cases where automatic-stage magnitudes are externally documented. Results establish whether ISC is worth using as a proxy source for this class of events. Whether ISC coverage is adequate across the broader M4+ population used for calibration is not answered here.

**2. API preflight results** — which endpoint worked, which fields were present, what ordering metadata was available

**3. Event classification table** — all 15 events: USGS ID, known automatic mag (source), known reviewed mag, ISC event ID matched, earliest NEIC entry, classification

**4. Three scoring rates** — raw match rate, conditional match rate, usable NEIC coverage rate, with numerators and denominators explicit

**5. Go/no-go recommendation** — state which threshold was met, give the recommendation plainly

**6. Caveats regardless of outcome**:
- Sample is not representative of the full M4+ calibration population
- ISC timestamps may not precisely reflect the USGS automatic→reviewed transition window
- ISC-derived findings must be tagged `DATA-FACTUAL (ISC-derived)`, not `DATA-FACTUAL`
- ISC Reviewed Bulletin is ~24 months behind real time — coverage is 2020–2023 at best
- Real-time collector remains the long-term solution regardless of ISC viability

**7. If NO-GO or MARGINAL**: outline the minimum viable design for a real-time USGS automatic-stage collector — what it needs to snapshot, how often, storage requirements for 6 months of M4+ events at automatic stage

---

## What happens after this study

- **GO**: Draft Studies 2, 3, and 5 variants using ISC as data source. Scope and prompt separately.
- **MARGINAL**: Same as GO but with explicit uncertainty elevation in all findings files and parallel real-time collector recommended.
- **NO-GO**: Decide between building the real-time collector or permanently deferring Studies 2, 3, 5 and accepting `TBD` labels on those parameters. That decision is human-owned. This study produces the evidence for it, not the decision itself.

---

*Save to `grimoires/loa/sprint-isc-verification.md` and run with `/implement sprint-isc-verification`.*
*Phase 0 (API preflight) and Phase 1 (event list confirmation) are both blocking gates. Do not proceed past either without completing them and — for Phase 1 — receiving human confirmation.*
