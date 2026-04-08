# Sprint A — GEOFON Oracle

**Goal**: Add GEOFON (GFZ German Research Centre) as a permanent third cross-validation
source alongside EMSC. Wire it into the existing cross-validation block in `src/index.js`.
Update BUTTERFREEZONE.md to reflect the new oracle.

**Why GEOFON, not IRIS**: The IRIS/EarthScope FDSN event endpoint retires June 1, 2026.
GEOFON is independent, real-time, global, FDSN-compliant, and has no announced retirement.

**Duration**: 1 session  
**Dependencies**: None. All prior sprints complete and passing (74/74 tests).

---

## Preflight (run before implementing)

- [x] Verify live test count: 74 baseline confirmed (matches expected).
- [x] Confirm GEOFON endpoint responds:
  `curl "https://geofon.gfz.de/fdsnws/event/1/query?start=2026-04-07T00:00:00&end=2026-04-07T01:00:00&minmag=4.5&format=text&limit=1"`
  If the endpoint is unreachable or returns an error, write a blocker report and stop.

---

## Hard Constraints

> Non-negotiable. Review will reject violations.

- Zero new runtime dependencies. Node.js 20+ built-ins only.
- Do not modify `src/processor/bundles.js`.
- Do not modify any file in `src/theatres/`.
- Do not modify `src/rlmf/certificates.js`.
- GEOFON endpoint must be exactly: `https://geofon.gfz.de/fdsnws/event/1/query`
- GEOFON output format must be `text` (pipe-delimited). Do not request `geojson` — GEOFON
  does not support it.
- Divergence threshold for `paradox_flag` is ≥ 0.3 (same as EMSC).
- All existing tests must pass unchanged after this sprint.
- Preserve every `// source:` and `// TBD:` comment in any file touched.

---

## Shape Change Notice

> This sprint changes `bundle.cross_validation` from a flat single-source object (current
> EMSC-only shape) to an aggregate multi-source object. Any existing tests asserting the old
> flat shape must be updated. Document the shape change in the implementation report.

---

## T1 — Create `src/oracles/geofon.js`

**Files**: `src/oracles/geofon.js` (new file)

**What**: New oracle module. Exports a single async function `crossValidateGEOFON(feature)`.
Not a copy of `emsc.js` — GEOFON returns pipe-delimited text, not GeoJSON. Requires its own
parser.

**Input shape** (same as EMSC):

```js
{
  properties: { mag: number, time: number },  // time in epoch ms
  geometry: { coordinates: [lon, lat, depth] }
}
```

**Query construction**:

```
Endpoint: https://geofon.gfz.de/fdsnws/event/1/query
Params:
  start       →  ISO8601 from feature.properties.time - 60,000ms
  end         →  ISO8601 from feature.properties.time + 60,000ms
  latitude    →  from feature.geometry.coordinates[1]
  longitude   →  from feature.geometry.coordinates[0]
  maxradius   →  1.0 (degrees)
  minmag      →  Math.max(0, feature.properties.mag - 1.0)
  format      →  text
  limit       →  5
  orderby     →  time
```

Note: GEOFON uses `start`/`end`, not `starttime`/`endtime`. Do not use the IRIS/USGS
parameter names.

**Response parsing**:

GEOFON text format is pipe-delimited. The first line is a header:

```
#EventID|Time|Latitude|Longitude|Depth|Author|Catalog|Contributor|ContributorID|MagType|Magnitude|MagAuthor|EventLocationName
```

Each subsequent line is one event. Parse with `split('\n')`, skip lines starting with `#`
or empty lines. Split each data line on `|`. Fields by index:

```
[0]  EventID
[1]  Time
[2]  Latitude
[3]  Longitude
[4]  Depth
[9]  MagType
[10] Magnitude
[12] EventLocationName
```

Select the first data line (closest in time given `orderby=time`). Parse `Magnitude` as
`parseFloat`. If `parseFloat` returns `NaN`, return `null`.

**Schema validation**: Reject the response if:
- HTTP status is not 200
- Response body is empty or contains no data lines (only header or blank)
- `parseFloat(fields[10])` is `NaN`

Never throw. Return `null` on any validation failure or network error.

**Return shape** (when match found):

```js
{
  source: 'GEOFON_GFZ',
  queried_at: Date.now(),
  geofon_mag: number,
  geofon_mag_type: string,       // fields[9] or 'unknown'
  divergence: number,            // Math.round(Math.abs(usgs_mag - geofon_mag) * 10000) / 10000
  paradox_flag: boolean,         // divergence >= 0.3
  event_count: number,           // number of data lines parsed
  sources_checked: ['GEOFON_GFZ'],
}
```

**Required comment at bottom of fetch block**:

```js
// TODO: queue/batch in production to respect rate limits
```

**Acceptance criteria**:

- [x] `crossValidateGEOFON` exported from `src/oracles/geofon.js`
- [x] Queries GEOFON with `start`/`end` params (not `starttime`/`endtime`)
- [x] Parses pipe-delimited text response correctly
- [x] Returns valid result object on well-formed GEOFON response
- [x] Returns `null` on malformed/empty response (does not throw)
- [x] Returns `null` on network error (does not throw)
- [x] Returns `null` when NaN magnitude parsed
- [x] Returns `null` when no data lines in response
- [x] `paradox_flag: true` when `divergence >= 0.3`
- [x] Full JSDoc header on file and function

---

## T2 — Update `src/index.js` cross-validation block

**Files**: `src/index.js`

**What**: Add GEOFON import. Replace the existing EMSC-only cross-validation block with a
parallel EMSC + GEOFON call. Merge results into aggregate object. Add re-export.

**Add import** after EMSC import (~line 14):

```js
import { crossValidateGEOFON } from './oracles/geofon.js';
```

**Replace** the cross-validation block (~lines 160–178).

Current:

```js
if (this.enableCrossValidation && bundle.evidence_class === 'provisional') {
  // Note: in production this would be queued/batched to respect rate limits
  const emscResult = await crossValidateEMSC({
    properties: {
      mag: bundle.payload.magnitude.value,
      time: bundle.payload.event_time,
    },
    geometry: {
      coordinates: [
        bundle.payload.location.longitude,
        bundle.payload.location.latitude,
        bundle.payload.location.depth_km,
      ],
    },
  });
  if (emscResult) {
    bundle.cross_validation = emscResult;
  }
}
```

Replace with:

```js
if (this.enableCrossValidation && bundle.evidence_class === 'provisional') {
  // TODO: queue/batch in production to respect rate limits
  const featureLike = {
    properties: {
      mag: bundle.payload.magnitude.value,
      time: bundle.payload.event_time,
    },
    geometry: {
      coordinates: [
        bundle.payload.location.longitude,
        bundle.payload.location.latitude,
        bundle.payload.location.depth_km,
      ],
    },
  };

  const [emscSettled, geofonSettled] = await Promise.allSettled([
    crossValidateEMSC(featureLike),
    crossValidateGEOFON(featureLike),
  ]);

  const emsc = emscSettled.status === 'fulfilled' ? emscSettled.value : null;
  const geofon = geofonSettled.status === 'fulfilled' ? geofonSettled.value : null;

  if (emsc || geofon) {
    const sources = [
      ...(emsc   ? emsc.sources_checked   : []),
      ...(geofon ? geofon.sources_checked : []),
    ];
    const divergences = [
      emsc?.divergence   ?? null,
      geofon?.divergence ?? null,
    ].filter((d) => d !== null);

    bundle.cross_validation = {
      sources_checked: sources,
      max_divergence: divergences.length > 0
        ? Math.round(Math.max(...divergences) * 10000) / 10000
        : 0,
      paradox_flag: divergences.some((d) => d >= 0.3),
      emsc:   emsc   ?? null,
      geofon: geofon ?? null,
    };
  }
}
```

**Add re-export** after EMSC re-export (~line 346):

```js
export { crossValidateGEOFON } from './oracles/geofon.js';
```

**Acceptance criteria**:

- [x] `crossValidateGEOFON` imported at top of `src/index.js`
- [x] Cross-validation block replaced (with corrected EMSC field name: `max_divergence`)
- [x] `bundle.cross_validation.sources_checked` includes `'GEOFON_GFZ'` when GEOFON returns
  a result
- [x] `bundle.cross_validation.sources_checked` includes both when both sources return results
- [x] `bundle.cross_validation.max_divergence` reflects the max across all sources
- [x] `crossValidateGEOFON` added to re-exports
- [x] EMSC null does not block GEOFON result (and vice versa)

---

## T3 — Create `test/geofon.test.js`

**Files**: `test/geofon.test.js` (new file)

**What**: 7 tests. `node:test` + `node:assert/strict` only. Mock `fetch` by URL on each
test — not by monkeypatching imported functions, which is unreliable in ESM. Exercise the
real `crossValidateGEOFON` function against mocked network responses. No live network calls.
No new dependencies.

**Test names (exact)**:

1. `test_geofon_valid_response_returns_cross_validation_result`
2. `test_geofon_divergence_gte_0_3_sets_paradox_flag`
3. `test_geofon_divergence_lt_0_3_no_flag`
4. `test_geofon_malformed_response_returns_null`
5. `test_geofon_network_error_returns_null`
6. `test_geofon_no_data_lines_in_response_returns_null`
7. `test_cross_validation_sources_checked_contains_both_emsc_and_geofon`

**Test 7 guidance**: Mock `fetch` per URL — return a valid EMSC JSON response for
`seismicportal.eu` requests and a valid GEOFON pipe-delimited text response for
`geofon.gfz.de` requests. Exercise the full cross-validation block through the real
imported functions. Assert `bundle.cross_validation.sources_checked` contains both
`'EMSC'` and `'GEOFON_GFZ'`.

**Acceptance criteria**:

- [x] All 7 tests named exactly as listed above
- [x] All 7 pass with no live network access
- [x] `fetch` mocked per URL, not per imported function
- [x] Mocked GEOFON response uses realistic pipe-delimited text format

---

## T4 — Update `BUTTERFREEZONE.md`

**Files**: `BUTTERFREEZONE.md`

**What**: Two additions to reflect GEOFON as an active oracle.

**In the OSINT Feeds table**, add row:

```
| GEOFON GFZ | `geofon.gfz.de/fdsnws/event/1/query` | Text (pipe-delimited) | None |
```

**In Key Capabilities**, add `crossValidateGEOFON` entry after `crossValidateEMSC`:

```
- **crossValidateGEOFON** — Queries GEOFON GFZ FDSN for independent magnitude readings
  (pipe-delimited text format). Divergence ≥0.3 triggers Paradox Engine flag.
  (`src/oracles/geofon.js`)
```

Update provenance tag on the section to remain `CODE-FACTUAL`.

**Acceptance criteria**:

- [x] OSINT Feeds table has GEOFON GFZ row with correct format noted
- [x] Key Capabilities has `crossValidateGEOFON` entry with file reference
- [x] No other BUTTERFREEZONE sections modified

---

## Known Issue to Flag (do not fix — document only)

The `evidenceClass = 'cross_validated'` upgrade in `src/processor/bundles.js:70–77` reads
`config.crossValidation` at bundle-build time, but cross-validation calls happen after
`buildBundle` returns. The upgrade path is currently unreachable. Do not fix in this sprint.
Add a note under **Known Limitations** in the implementation report. Candidate for Sprint B.

---

## Definition of Done

- [x] Preflight checks passed (live test count verified, GEOFON endpoint confirmed live)
- [x] `node --test test/tremor.test.js` → baseline count passes (use live count as truth)
- [x] `node --test test/post-audit.test.js` → all pass
- [x] `node --test test/geofon.test.js` → 7/7 pass
- [x] `crossValidateGEOFON` importable from `src/index.js`
- [x] `bundle.cross_validation` shape change documented in implementation report
- [x] `BUTTERFREEZONE.md` updated with GEOFON oracle
- [x] `package.json` has zero new entries in `dependencies` or `devDependencies`
- [x] Implementation report saved to `grimoires/loa/a2a/sprint-geofon-oracle/reviewer.md`

---

## Commands

```
/implement sprint-[N]
/review-sprint sprint-[N]
/audit-sprint sprint-[N]
```
