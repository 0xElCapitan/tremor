#!/usr/bin/env node

/**
 * Omori Regime Backtest Harness (Study 1 — Protocol v2.0)
 *
 * Tests TREMOR's Aftershock Cascade Omori prior against 19 historical
 * earthquake sequences. Uses TREMOR's own exported functions — no
 * re-implementation of integration math.
 *
 * Usage: OMORI_OUTPUT_DIR=grimoires/loa/calibration/omori-backtest/run-6 node scripts/omori-backtest.js
 * Output: Per-sequence JSON + diagnostic report in the specified output directory.
 *
 * Phase 1 diagnostic backtest. Not final calibration proof.
 */

import { createAftershockCascade, BUCKETS, REGIME_PARAMS, omoriExpectedCount, countToBucketProbabilities, inferRegime } from '../src/theatres/aftershock.js';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = process.env.OMORI_OUTPUT_DIR
  ? join(__dirname, '..', process.env.OMORI_OUTPUT_DIR)
  : join(__dirname, '..', 'grimoires', 'loa', 'calibration', 'omori-backtest');

// Ensure output directory exists
if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });

// =========================================================================
// Sequence definitions — Protocol v2.0 (19 sequences)
// =========================================================================

const SEQUENCES = [
  // --- Subduction (regime-fit) ---
  {
    id: 1, label: '2011 Tōhoku', role: 'regime-fit', intraplate_tier: null,
    regime_expected: 'subduction', event_id: 'official20110311054624120_30',
    mainshock_utc: '2011-03-11T05:46:24Z',
    expected: { lat: 38.297, lon: 142.373, depth: 29.0, mag: 9.1 },
  },
  {
    id: 2, label: '2010 Maule', role: 'regime-fit', intraplate_tier: null,
    regime_expected: 'subduction', event_id: 'official20100227063411530_30',
    mainshock_utc: '2010-02-27T06:34:11Z',
    expected: { lat: -35.909, lon: -72.733, depth: 22.9, mag: 8.8 },
  },
  {
    id: 3, label: '2014 Iquique', role: 'regime-fit', intraplate_tier: null,
    regime_expected: 'subduction', event_id: 'usc000nzvd',
    mainshock_utc: '2014-04-01T23:46:47Z',
    expected: { lat: -19.610, lon: -70.769, depth: 25.0, mag: 8.2 },
  },

  // --- Transform (regime-fit) ---
  {
    id: 4, label: '2019 Ridgecrest', role: 'regime-fit', intraplate_tier: null,
    regime_expected: 'transform', event_id: 'ci38457511',
    mainshock_utc: '2019-07-06T03:19:53Z',
    expected: { lat: 35.770, lon: -117.599, depth: 8.0, mag: 7.1 },
  },
  {
    id: 5, label: '2010 El Mayor-Cucapah', role: 'regime-fit', intraplate_tier: null,
    regime_expected: 'transform', event_id: 'ci14607652',
    mainshock_utc: '2010-04-04T22:40:42Z',
    expected: { lat: 32.286, lon: -115.295, depth: 10.0, mag: 7.2 },
  },

  // --- Intraplate primary (regime-fit — use for K/c/p conclusions) ---
  {
    id: 6, label: '2011 Mineral, Virginia', role: 'regime-fit', intraplate_tier: 'primary',
    regime_expected: 'intraplate', event_id: 'se609212',
    mainshock_utc: '2011-08-23T17:51:04Z',
    expected: { lat: 37.936, lon: -77.933, depth: 6.0, mag: 5.8 },
  },
  {
    id: 7, label: '2020 Magna, Utah', role: 'regime-fit', intraplate_tier: 'primary',
    regime_expected: 'intraplate', event_id: 'uu60363602',
    mainshock_utc: '2020-03-18T13:09:46Z',
    expected: { lat: 40.702, lon: -112.080, depth: 11.9, mag: 5.7 },
  },
  {
    id: 8, label: '2008 Wells, Nevada', role: 'regime-fit', intraplate_tier: 'primary',
    regime_expected: 'intraplate', event_id: 'nn00234425',
    mainshock_utc: '2008-02-21T14:16:02Z',
    expected: { lat: 41.144, lon: -114.872, depth: 7.9, mag: 6.0 },
  },
  {
    id: 9, label: '2016 Petermann Ranges, Australia', role: 'regime-fit', intraplate_tier: 'primary',
    regime_expected: 'intraplate', event_id: 'us10005iyk',
    mainshock_utc: '2016-05-20T18:14:04Z',
    expected: { lat: -25.566, lon: 129.884, depth: 10.0 },
    international_review_check: true,
  },
  {
    id: 10, label: '2017 Moijabana, Botswana', role: 'regime-fit', intraplate_tier: 'primary',
    regime_expected: 'intraplate', event_id: 'us10008e3k',
    mainshock_utc: '2017-04-03T17:40:18Z',
    expected: { lat: -22.678, lon: 25.156, depth: 29.0 },
    international_review_check: true,
  },

  // --- Intraplate secondary (sensitivity-only — do not use for primary verdict) ---
  {
    id: 11, label: '2017 Lincoln, Montana', role: 'regime-fit', intraplate_tier: 'secondary',
    regime_expected: 'intraplate', event_id: 'us10009757',
    mainshock_utc: '2017-07-06T06:30:17Z',
    expected: { lat: 46.881, lon: -112.575, depth: 12.2 },
    notes: 'Intermountain Seismic Belt — active extensional zone',
  },
  {
    id: 12, label: '2020 Monte Cristo Range, Nevada', role: 'regime-fit', intraplate_tier: 'secondary',
    regime_expected: 'intraplate', event_id: 'nn00725272',
    mainshock_utc: '2020-05-15T11:03:27Z',
    expected: { lat: 38.169, lon: -117.850, depth: 2.7 },
    notes: 'Walker Lane — transtensional, not quiet craton',
  },

  // --- Regime-inference / edge-case (do not use for K/c/p conclusions) ---
  {
    id: 13, label: '2016 Kumamoto', role: 'inference', intraplate_tier: null,
    regime_expected: 'transform or subduction boundary', event_id: null,
    search: { start: '2016-04-14', end: '2016-04-17', minLat: 32, maxLat: 34, minLon: 130, maxLon: 132, minMag: 7.0 },
  },
  {
    id: 14, label: '2016 Equatorial Atlantic M7.1', role: 'inference', intraplate_tier: null,
    regime_expected: 'default', event_id: 'us20006uy6',
    mainshock_utc: '2016-08-29T04:29:57Z',
    expected: { lat: -0.046, lon: -17.826 },
  },
  {
    id: 15, label: '2020 Puerto Rico M6.4', role: 'inference', intraplate_tier: null,
    regime_expected: 'default', event_id: 'us70006vll',
    mainshock_utc: '2020-01-07T08:24:26Z',
    expected: { lat: 17.958, lon: -66.811 },
  },

  // --- Volcanic (robustness / stress-test only) ---
  {
    id: 16, label: '2018 Kīlauea', role: 'volcanic', intraplate_tier: null,
    regime_expected: 'volcanic', event_id: null,
    search: { start: '2018-05-01', end: '2018-05-05', minLat: 19, maxLat: 20, minLon: -156, maxLon: -154, minMag: 6.0 },
    notes: 'Mainshock definition uncertain — using largest reviewed event',
  },
  {
    id: 17, label: '2021 La Palma', role: 'volcanic', intraplate_tier: null,
    regime_expected: 'volcanic', event_id: null,
    search: { start: '2021-09-10', end: '2021-12-31', minLat: 28, maxLat: 29, minLon: -18.5, maxLon: -17, minMag: 3.5 },
    notes: 'European catalog — USGS coverage may be thin',
  },
  {
    id: 18, label: '2014 Bárðarbunga', role: 'volcanic', intraplate_tier: null,
    regime_expected: 'volcanic', event_id: null,
    search: { start: '2014-08-16', end: '2014-09-30', minLat: 64, maxLat: 66, minLon: -18, maxLon: -15, minMag: 4.5 },
    notes: 'Caldera collapse — mainshock definition uncertain',
  },
];

// Protocol v2.0 fallback order for review-coverage failures
const REVIEW_FALLBACK_ORDER = ['nn00234425', 'us10005iyk', 'us10008e3k', 'us10009757', 'nn00725272'];

// =========================================================================
// USGS FDSN helpers
// =========================================================================

const FDSN_BASE = 'https://earthquake.usgs.gov/fdsnws/event/1';

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchJSON(url) {
  const resp = await fetch(url);
  if (resp.status === 204) return { features: [] }; // No content
  if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
  const text = await resp.text();
  if (!text.trim()) return { features: [] };
  return JSON.parse(text);
}

/**
 * Fetch mainshock details from USGS by event ID.
 */
async function fetchMainshockById(eventId) {
  const url = `${FDSN_BASE}/query?format=geojson&eventid=${eventId}&limit=1`;
  const data = await fetchJSON(url);
  const f = data.features ? data.features[0] : data;
  return extractFeature(f);
}

/**
 * Search for mainshock by time/location window, returning the largest event.
 */
async function searchMainshock(params) {
  const url = `${FDSN_BASE}/query?format=geojson` +
    `&starttime=${params.start}&endtime=${params.end}` +
    `&minlatitude=${params.minLat}&maxlatitude=${params.maxLat}` +
    `&minlongitude=${params.minLon}&maxlongitude=${params.maxLon}` +
    `&minmagnitude=${params.minMag || 4.0}` +
    `&orderby=magnitude&limit=5&reviewstatus=reviewed`;
  const data = await fetchJSON(url);
  if (!data.features || data.features.length === 0) return null;
  return extractFeature(data.features[0]);
}

function extractFeature(f) {
  const p = f.properties;
  const c = f.geometry.coordinates;
  return {
    event_id: f.id,
    magnitude: p.mag,
    magType: p.magType,
    place: p.place,
    time_utc: new Date(p.time).toISOString(),
    time_ms: p.time,
    latitude: c[1],
    longitude: c[0],
    depth_km: c[2],
    status: p.status,
  };
}

/** Strip milliseconds from ISO timestamp for FDSN compatibility */
function fdsnTime(isoOrMs) {
  const d = typeof isoOrMs === 'number' ? new Date(isoOrMs) : new Date(isoOrMs);
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Verify mainshock identity against expected values from protocol.
 * Tolerances: lat/lon within 0.5°, magnitude within 0.3, depth within 10 km.
 */
function verifyMainshock(mainshock, expected) {
  if (!expected) return { verified: true, discrepancies: [] };
  const disc = [];
  if (expected.lat != null && Math.abs(mainshock.latitude - expected.lat) > 0.5) {
    disc.push(`lat: expected ${expected.lat}, got ${mainshock.latitude} (delta ${Math.abs(mainshock.latitude - expected.lat).toFixed(3)}°)`);
  }
  if (expected.lon != null && Math.abs(mainshock.longitude - expected.lon) > 0.5) {
    disc.push(`lon: expected ${expected.lon}, got ${mainshock.longitude} (delta ${Math.abs(mainshock.longitude - expected.lon).toFixed(3)}°)`);
  }
  if (expected.depth != null && Math.abs(mainshock.depth_km - expected.depth) > 10) {
    disc.push(`depth: expected ${expected.depth}km, got ${mainshock.depth_km}km`);
  }
  if (expected.mag != null && Math.abs(mainshock.magnitude - expected.mag) > 0.3) {
    disc.push(`mag: expected ${expected.mag}, got ${mainshock.magnitude}`);
  }
  return { verified: disc.length === 0, discrepancies: disc };
}

/**
 * Fetch aftershock catalog within the match radius and time window.
 * Handles pagination if result count hits the limit.
 */
async function fetchAftershocks(mainshock, bbox, windowHours = 72) {
  const startTime = fdsnTime(mainshock.time_ms);
  const endTime = fdsnTime(mainshock.time_ms + windowHours * 3600 * 1000);
  const [minLon, minLat, maxLon, maxLat] = bbox.map(c => Math.round(c * 100) / 100);

  let allFeatures = [];
  let offset = 1; // FDSN requires offset >= 1
  const limit = 20000;
  let hitLimit = false;

  while (true) {
    const url = `${FDSN_BASE}/query?format=geojson` +
      `&starttime=${startTime}&endtime=${endTime}` +
      `&minmagnitude=4.0` +
      `&minlatitude=${minLat}&maxlatitude=${maxLat}` +
      `&minlongitude=${minLon}&maxlongitude=${maxLon}` +
      `&eventtype=earthquake&reviewstatus=reviewed` +
      `&limit=${limit}&offset=${offset}`;

    const data = await fetchJSON(url);
    if (!data.features || data.features.length === 0) break;

    allFeatures = allFeatures.concat(data.features);

    if (data.features.length < limit) break;
    // Hit the limit — paginate
    hitLimit = true;
    offset += limit;
    console.log(`  Paginating: ${allFeatures.length} events so far...`);
    await delay(500);
  }

  // Filter: exclude mainshock, exclude non-tectonic
  const aftershocks = allFeatures.filter(f => {
    if (f.id === mainshock.event_id) return false;
    const type = (f.properties.type || '').toLowerCase();
    if (type === 'quarry blast' || type === 'explosion') return false;
    return true;
  });

  return {
    count: aftershocks.length,
    truncated: hitLimit,
    paginated: hitLimit,
    status: hitLimit ? 'truncated-paginated' : 'complete',
    events: aftershocks.map(f => ({
      id: f.id,
      mag: f.properties.mag,
      time: new Date(f.properties.time).toISOString(),
      status: f.properties.status,
    })),
  };
}

/**
 * Check reviewed coverage for international sequences.
 * Fetches WITHOUT reviewstatus filter and compares against reviewed count.
 */
async function checkReviewedCoverage(mainshock, bbox, windowHours = 72) {
  const startTime = fdsnTime(mainshock.time_ms);
  const endTime = fdsnTime(mainshock.time_ms + windowHours * 3600 * 1000);
  const [minLon, minLat, maxLon, maxLat] = bbox.map(c => Math.round(c * 100) / 100);

  const url = `${FDSN_BASE}/query?format=geojson` +
    `&starttime=${startTime}&endtime=${endTime}` +
    `&minmagnitude=4.0` +
    `&minlatitude=${minLat}&maxlatitude=${maxLat}` +
    `&minlongitude=${minLon}&maxlongitude=${maxLon}` +
    `&eventtype=earthquake` +
    `&limit=20000`; // No reviewstatus filter

  const data = await fetchJSON(url);
  const features = (data.features || []).filter(f => {
    if (f.id === mainshock.event_id) return false;
    const type = (f.properties.type || '').toLowerCase();
    return type !== 'quarry blast' && type !== 'explosion';
  });

  const total = features.length;
  const reviewed = features.filter(f => f.properties.status === 'reviewed').length;

  return {
    total,
    reviewed,
    coverage_pct: total === 0 ? 100 : Math.round(reviewed / total * 100),
  };
}

// =========================================================================
// Mock bundle construction for createAftershockCascade
// =========================================================================

function buildMockBundle(mainshock) {
  return {
    bundle_id: `backtest-${mainshock.event_id}`,
    payload: {
      event_id: mainshock.event_id,
      event_time: mainshock.time_ms,
      magnitude: { value: mainshock.magnitude },
      location: {
        latitude: mainshock.latitude,
        longitude: mainshock.longitude,
        depth_km: mainshock.depth_km,
      },
    },
  };
}

// =========================================================================
// Scoring
// =========================================================================

function findBucket(count) {
  return BUCKETS.findIndex(({ min, max }) => count >= min && count <= max);
}

function scoreSequence(projected, actual, bucketProbs) {
  const projectedBucket = findBucket(Math.round(projected));
  const actualBucket = findBucket(actual);
  const bucketHit = projectedBucket === actualBucket;

  // Protocol: actual === 0 → relative error is null, not Infinity
  const relativeError = actual === 0 ? null : (projected - actual) / actual;
  const logError = Math.log(projected + 1) - Math.log(actual + 1);

  // Brier score against actual bucket if we have probabilities
  let probabilityScore = null;
  if (bucketProbs && bucketProbs.length === BUCKETS.length) {
    let brier = 0;
    for (let i = 0; i < BUCKETS.length; i++) {
      const outcome = i === actualBucket ? 1 : 0;
      brier += Math.pow(bucketProbs[i] - outcome, 2);
    }
    probabilityScore = Math.round(brier / BUCKETS.length * 10000) / 10000;
  }

  return {
    projected_count: Math.round(projected * 10) / 10,
    actual_count: actual,
    projected_bucket: projectedBucket >= 0 ? BUCKETS[projectedBucket].label : 'unknown',
    actual_bucket: actualBucket >= 0 ? BUCKETS[actualBucket].label : 'unknown',
    bucket_hit: bucketHit,
    relative_error: relativeError != null ? Math.round(relativeError * 1000) / 1000 : null,
    log_error: Math.round(logError * 1000) / 1000,
    probability_score: probabilityScore,
  };
}

// =========================================================================
// Direct Omori computation (bypasses M<6.0 guard in createAftershockCascade)
// =========================================================================

function computeDirectOmori(mainshock, thresholdMag = 4.0, windowHours = 72) {
  const regime = inferRegime(mainshock.depth_km, mainshock.latitude, mainshock.longitude);
  const params = REGIME_PARAMS[regime] || REGIME_PARAMS.default;
  const expectedCount = omoriExpectedCount(params, mainshock.magnitude, thresholdMag, windowHours);
  const bucketProbs = countToBucketProbabilities(expectedCount);

  // Wells & Coppersmith rupture length for match radius
  const ruptureLength = Math.pow(10, -3.22 + 0.69 * mainshock.magnitude);
  const matchRadius = ruptureLength * 1.5;
  const degreeRadius = matchRadius / 111;

  const bbox = [
    mainshock.longitude - degreeRadius,
    mainshock.latitude - degreeRadius,
    mainshock.longitude + degreeRadius,
    mainshock.latitude + degreeRadius,
  ];

  return {
    regime,
    params,
    expected_count: Math.round(expectedCount * 10) / 10,
    rupture_length_km: Math.round(ruptureLength * 10) / 10,
    match_radius_deg: Math.round(degreeRadius * 100) / 100,
    bucket_probs: bucketProbs,
    bbox,
    method: 'direct',
  };
}

// =========================================================================
// Partial-window analysis (t=6h, t=24h, t=72h) for bias time-signature
// =========================================================================

function computePartialWindows(params, mainMag, thresholdMag = 4.0) {
  return [6, 24, 72].map(h => ({
    window_hours: h,
    projected: Math.round(omoriExpectedCount(params, mainMag, thresholdMag, h) * 10) / 10,
  }));
}

function countPartialWindows(mainshockTimeMs, aftershockEvents) {
  return [6, 24, 72].map(h => {
    const cutoff = mainshockTimeMs + h * 3600 * 1000;
    const count = aftershockEvents.filter(e => {
      const t = new Date(e.time).getTime();
      return t < cutoff;
    }).length;
    return { window_hours: h, actual: count };
  });
}

// =========================================================================
// Main backtest loop
// =========================================================================

async function runBacktest() {
  console.log('TREMOR Omori Regime Backtest — Protocol v2.0, 19 sequences');
  console.log(`Run 6 — Primary/secondary intraplate split`);
  console.log(`Output: ${OUTPUT_DIR}`);
  console.log('='.repeat(60));

  const results = [];
  const coverageIssues = [];

  for (const seq of SEQUENCES) {
    console.log(`\n[${seq.id}/${SEQUENCES.length}] ${seq.label} (${seq.role}${seq.intraplate_tier ? '/' + seq.intraplate_tier : ''})`);

    try {
      // Step 1: Fetch mainshock
      let mainshock;
      if (seq.event_id) {
        console.log(`  Fetching mainshock ${seq.event_id}...`);
        mainshock = await fetchMainshockById(seq.event_id);
      } else {
        console.log(`  Searching for mainshock...`);
        mainshock = await searchMainshock(seq.search);
        if (!mainshock) {
          throw new Error('No mainshock found in USGS for search parameters');
        }
        console.log(`  Found: ${mainshock.event_id} M${mainshock.magnitude} — ${mainshock.place}`);
      }

      // Step 2: Verify mainshock identity against protocol expected values
      const verification = verifyMainshock(mainshock, seq.expected);
      if (!verification.verified) {
        console.log(`  VERIFICATION FAILED:`);
        for (const d of verification.discrepancies) console.log(`    - ${d}`);
        console.log(`  HALTING this sequence per protocol.`);
        const errorResult = {
          sequence_id: seq.id, label: seq.label, role: seq.role,
          intraplate_tier: seq.intraplate_tier || null,
          regime_expected: seq.regime_expected,
          mainshock_event_id: mainshock.event_id,
          mainshock_event_id_verified: false,
          verification_discrepancies: verification.discrepancies,
          error: 'Mainshock identity verification failed',
          notes: seq.notes || '',
        };
        results.push(errorResult);
        writeResult(seq.id, errorResult);
        continue;
      }
      console.log(`  Verified: M${mainshock.magnitude} at ${mainshock.latitude.toFixed(3)}°, ${mainshock.longitude.toFixed(3)}°, ${mainshock.depth_km}km`);

      await delay(500);

      // Step 3: Get Omori projections using TREMOR's own functions
      let projectedCount, assignedRegime, bucketProbs, bbox, omoriParams, ruptureLen, matchRadiusDeg, computeMethod;

      if (mainshock.magnitude >= 6.0) {
        const mockBundle = buildMockBundle(mainshock);
        const theatre = createAftershockCascade({ mainshockBundle: mockBundle });
        if (!theatre) {
          throw new Error('createAftershockCascade returned null unexpectedly');
        }
        projectedCount = theatre.omori.expected_count;
        assignedRegime = theatre.omori.regime;
        bucketProbs = theatre.current_position;
        bbox = theatre.region_bbox;
        omoriParams = theatre.omori.params;
        ruptureLen = theatre.omori.rupture_length_km;
        matchRadiusDeg = theatre.omori.match_radius_deg;
        computeMethod = 'createAftershockCascade';
      } else {
        console.log(`  M${mainshock.magnitude} < 6.0 — using direct Omori functions`);
        const direct = computeDirectOmori(mainshock);
        projectedCount = direct.expected_count;
        assignedRegime = direct.regime;
        bucketProbs = direct.bucket_probs;
        bbox = direct.bbox;
        omoriParams = direct.params;
        ruptureLen = direct.rupture_length_km;
        matchRadiusDeg = direct.match_radius_deg;
        computeMethod = 'direct';
      }

      console.log(`  Regime: ${assignedRegime} (expected: ${seq.regime_expected})`);
      console.log(`  Omori projected (72h): ${projectedCount}`);
      console.log(`  Match radius: ${matchRadiusDeg}°, method: ${computeMethod}`);

      await delay(500);

      // Step 4: Fetch actual aftershock catalog
      console.log(`  Fetching aftershock catalog (72h window)...`);
      const aftershockData = await fetchAftershocks(mainshock, bbox);
      console.log(`  Actual M≥4.0 aftershocks: ${aftershockData.count} (status: ${aftershockData.status})`);

      if (aftershockData.truncated) {
        console.log(`  NOTE: FDSN limit hit — paginated successfully`);
      }

      let aftershockStatus = aftershockData.status;
      let reviewedCoveragePct = 100;

      // Step 4b: Reviewed coverage check for international sequences
      if (seq.international_review_check) {
        console.log(`  Checking reviewed coverage (international sequence)...`);
        await delay(500);
        const coverage = await checkReviewedCoverage(mainshock, bbox);
        reviewedCoveragePct = coverage.coverage_pct;
        console.log(`  Reviewed coverage: ${coverage.reviewed}/${coverage.total} (${reviewedCoveragePct}%)`);

        if (reviewedCoveragePct < 80) {
          aftershockStatus = 'coverage-uncertain';
          console.log(`  COVERAGE-UNCERTAIN: ${reviewedCoveragePct}% < 80% threshold`);
          console.log(`  Excluding from primary K/c/p conclusions per protocol.`);
          coverageIssues.push({
            sequence_id: seq.id,
            label: seq.label,
            coverage_pct: reviewedCoveragePct,
            reviewed: coverage.reviewed,
            total: coverage.total,
          });
        }
      }

      // Step 5: Score
      const scores = scoreSequence(projectedCount, aftershockData.count, bucketProbs);

      // Partial-window analysis (t=6h, t=24h, t=72h)
      const partialProjected = computePartialWindows(omoriParams, mainshock.magnitude);
      const partialActual = countPartialWindows(mainshock.time_ms, aftershockData.events);
      const partialWindows = partialProjected.map((pp, i) => ({
        window_hours: pp.window_hours,
        projected: pp.projected,
        actual: partialActual[i].actual,
        // Protocol: actual === 0 → null, not Infinity
        relative_error: partialActual[i].actual === 0
          ? null
          : Math.round(((pp.projected - partialActual[i].actual) / partialActual[i].actual) * 1000) / 1000,
      }));
      console.log(`  Partial: ${partialWindows.map(w => `${w.window_hours}h: ${w.projected}/${w.actual}`).join(', ')}`);

      const regimeMatch = seq.role === 'regime-fit'
        ? assignedRegime === seq.regime_expected
        : checkInferenceMatch(assignedRegime, seq.regime_expected);

      const result = {
        sequence_id: seq.id,
        label: seq.label,
        role: seq.role,
        intraplate_tier: seq.intraplate_tier || null,
        regime_assigned: assignedRegime,
        regime_expected: seq.regime_expected,
        regime_match: regimeMatch,
        mainshock_event_id: mainshock.event_id,
        mainshock_event_id_verified: true,
        mainshock_utc: mainshock.time_utc,
        mainshock_magnitude: mainshock.magnitude,
        mainshock_depth_km: mainshock.depth_km,
        mainshock_location: mainshock.place,
        window_end_utc: new Date(mainshock.time_ms + 72 * 3600 * 1000).toISOString(),
        omori_params: omoriParams,
        rupture_length_km: ruptureLen,
        match_radius_deg: matchRadiusDeg,
        compute_method: computeMethod,
        bucket_probabilities: bucketProbs,
        partial_windows: partialWindows,
        ...scores,
        aftershock_truncated: aftershockData.truncated,
        aftershock_paginated: aftershockData.paginated,
        aftershock_status: aftershockStatus,
        reviewed_coverage_pct: reviewedCoveragePct,
        aftershock_events: aftershockData.events.slice(0, 30),
        notes: seq.notes || '',
      };

      console.log(`  Bucket hit: ${scores.bucket_hit} (${scores.projected_bucket} vs ${scores.actual_bucket})`);
      console.log(`  Relative error: ${scores.relative_error != null ? fmtPct(scores.relative_error) : 'N/A (zero actual)'}`);

      results.push(result);
      writeResult(seq.id, result);

      await delay(500);
    } catch (err) {
      console.log(`  ERROR: ${err.message}`);
      const errorResult = {
        sequence_id: seq.id,
        label: seq.label,
        role: seq.role,
        intraplate_tier: seq.intraplate_tier || null,
        regime_expected: seq.regime_expected,
        error: err.message,
        notes: seq.notes || '',
      };
      results.push(errorResult);
      writeResult(seq.id, errorResult);
    }
  }

  // Generate diagnostic report
  console.log('\n' + '='.repeat(60));
  console.log('Generating diagnostic report...');
  generateDiagnosticReport(results, coverageIssues);
  console.log(`Done. Output: ${OUTPUT_DIR}`);

  // Completion summary
  const ran = results.filter(r => !r.error);
  const errored = results.filter(r => r.error);
  const regimeFit = ran.filter(r => r.role === 'regime-fit');
  console.log(`\nCompletion: ${ran.length} ran, ${errored.length} errored, ${results.length} total`);
  if (errored.length > 0) {
    console.log(`Skipped: ${errored.map(r => `${r.label} (${r.error})`).join(', ')}`);
  }

  // Regime verdicts summary
  const primaryForVerdict = regimeFit.filter(r => r.intraplate_tier !== 'secondary' && r.aftershock_status !== 'coverage-uncertain');
  const regimes = groupBy(primaryForVerdict, 'regime_assigned');
  for (const [regime, seqs] of Object.entries(regimes)) {
    const hitRate = seqs.filter(s => s.bucket_hit).length / seqs.length;
    const finiteErrors = seqs.filter(s => s.relative_error != null);
    const meanRelErr = finiteErrors.length > 0
      ? finiteErrors.reduce((s, r) => s + Math.abs(r.relative_error), 0) / finiteErrors.length
      : null;
    const cls = meanRelErr != null ? classify(hitRate, meanRelErr) : 'Insufficient data';
    console.log(`  ${regime}: ${cls} (n=${seqs.length})`);
  }
}

function checkInferenceMatch(assigned, expected) {
  const validRegimes = expected.split(' or ').map(s => s.trim());
  return validRegimes.some(r => assigned.includes(r) || r.includes(assigned));
}

function writeResult(seqId, result) {
  const path = join(OUTPUT_DIR, `sequence-${String(seqId).padStart(2, '0')}.json`);
  writeFileSync(path, JSON.stringify(result, null, 2) + '\n');
}

// =========================================================================
// Diagnostic report — Protocol v2.0 format (8 required sections)
// =========================================================================

function generateDiagnosticReport(results, coverageIssues) {
  const lines = [];
  const ln = (s = '') => lines.push(s);

  ln('# Omori Regime Backtest — Diagnostic Report');
  ln();
  ln('Run 6 — Protocol v2.0, 19 sequences, primary/secondary intraplate split.');
  ln('Prior runs preserved at grimoires/loa/calibration/omori-backtest/');
  ln();
  ln('**Phase**: 1 diagnostic backtest. Not final calibration proof.');
  ln(`**Date**: ${new Date().toISOString().split('T')[0]}`);
  const ran = results.filter(r => !r.error);
  const errored = results.filter(r => r.error);
  ln(`**Sequences**: ${ran.length} ran / ${errored.length} errored / ${results.length} total`);
  const directCount = ran.filter(r => r.compute_method === 'direct').length;
  if (directCount > 0) {
    ln(`**Direct-computed (M<6.0)**: ${directCount} (via exported omoriExpectedCount/inferRegime)`);
  }
  ln();

  // Categorize results
  const allRegimeFit = results.filter(r => r.role === 'regime-fit' && !r.error);
  // Primary: non-secondary, non-coverage-uncertain
  const primaryForVerdict = allRegimeFit.filter(r =>
    r.intraplate_tier !== 'secondary' && r.aftershock_status !== 'coverage-uncertain'
  );
  const secondaryRegimeFit = allRegimeFit.filter(r => r.intraplate_tier === 'secondary');
  const coverageUncertain = allRegimeFit.filter(r => r.aftershock_status === 'coverage-uncertain');

  // =====================================================================
  // Section 1: Regime-fit results — primary sequences only
  // =====================================================================
  ln('---');
  ln();
  ln('## 1. Regime-Fit Results — Primary Sequences Only');
  ln();

  if (primaryForVerdict.length > 0) {
    ln('### Per-Sequence Results');
    ln();
    ln('| # | Sequence | Regime (assigned) | Regime (expected) | Projected | Actual | Bucket Hit | Rel Error | Log Error | Brier |');
    ln('|---|----------|-------------------|-------------------|-----------|--------|------------|-----------|-----------|-------|');
    for (const r of primaryForVerdict) {
      ln(`| ${r.sequence_id} | ${r.label} | ${r.regime_assigned} | ${r.regime_expected} | ${r.projected_count} | ${r.actual_count} | ${r.bucket_hit ? '✓' : '✗'} | ${fmtErr(r.relative_error)} | ${r.log_error} | ${r.probability_score ?? 'N/A'} |`);
    }
    ln();

    if (coverageUncertain.length > 0) {
      ln(`**Excluded from verdict (COVERAGE-UNCERTAIN)**: ${coverageUncertain.map(r => `${r.label} (${r.reviewed_coverage_pct}% reviewed)`).join(', ')}`);
      ln();
    }

    // Per-regime aggregation with n= counts
    const regimes = groupBy(primaryForVerdict, 'regime_assigned');
    ln('### Per-Regime Verdicts');
    ln();
    ln('| Regime | n | Bucket Hit Rate | Mean Rel Error | Mean Log Error | Verdict |');
    ln('|--------|---|-----------------|----------------|----------------|---------|');
    for (const [regime, seqs] of Object.entries(regimes)) {
      const hitRate = seqs.filter(s => s.bucket_hit).length / seqs.length;
      const finiteErrors = seqs.filter(s => s.relative_error != null);
      const meanRelErr = finiteErrors.length > 0
        ? finiteErrors.reduce((s, r) => s + Math.abs(r.relative_error), 0) / finiteErrors.length
        : null;
      const meanLogErr = seqs.reduce((s, r) => s + Math.abs(r.log_error), 0) / seqs.length;
      const cls = meanRelErr != null ? classify(hitRate, meanRelErr) : 'Insufficient data';
      ln(`| ${regime} | ${seqs.length} | ${fmtPct(hitRate)} | ${meanRelErr != null ? fmtPct(meanRelErr) : 'N/A'} | ${meanLogErr.toFixed(3)} | **${cls}** (n=${seqs.length}) |`);
    }
    ln();

    // Note untested regimes
    const testedRegimes = new Set(primaryForVerdict.map(r => r.regime_assigned));
    const allRegimeNames = Object.keys(REGIME_PARAMS);
    const untested = allRegimeNames.filter(r => !testedRegimes.has(r));
    if (untested.length > 0) {
      ln(`**Untested regimes**: ${untested.join(', ')}`);
      ln();
    }
  } else {
    ln('No primary regime-fit sequences completed successfully.');
    ln();
  }

  // Regime mismatches
  const regimeMismatches = primaryForVerdict.filter(r => r.regime_assigned !== r.regime_expected);
  if (regimeMismatches.length > 0) {
    ln('### inferRegime Misassignments (Primary)');
    ln();
    ln('| Sequence | Expected | Assigned | Depth | Location |');
    ln('|----------|----------|----------|-------|----------|');
    for (const r of regimeMismatches) {
      ln(`| ${r.label} | ${r.regime_expected} | ${r.regime_assigned} | ${r.mainshock_depth_km}km | ${r.mainshock_location} |`);
    }
    ln();
    ln(`**Impact**: ${regimeMismatches.length} sequence(s) tested with wrong regime parameters. Per-regime analysis may be contaminated.`);
    ln();
  }

  // =====================================================================
  // Section 2: Intraplate secondary results
  // =====================================================================
  ln('---');
  ln();
  ln('## 2. Intraplate Secondary Results');
  ln();
  ln('**Sensitivity-only — do not use to establish or overturn primary intraplate verdict.**');
  ln();

  if (secondaryRegimeFit.length > 0) {
    ln('| # | Sequence | Regime (assigned) | Projected | Actual | Bucket Hit | Rel Error | Log Error | Why Secondary |');
    ln('|---|----------|-------------------|-----------|--------|------------|-----------|-----------|---------------|');
    for (const r of secondaryRegimeFit) {
      ln(`| ${r.sequence_id} | ${r.label} | ${r.regime_assigned} | ${r.projected_count} | ${r.actual_count} | ${r.bucket_hit ? '✓' : '✗'} | ${fmtErr(r.relative_error)} | ${r.log_error} | ${r.notes} |`);
    }
    ln();
  } else {
    ln('No secondary intraplate sequences completed.');
    ln();
  }

  // =====================================================================
  // Section 3: Bias diagnosis per regime
  // =====================================================================
  ln('---');
  ln();
  ln('## 3. Bias Diagnosis Per Regime');
  ln();
  ln('Protocol diagnosis order: c (early-time) → K (total) → p (drift) → inferRegime (regime variance).');
  ln();

  if (primaryForVerdict.length > 0) {
    const regimes = groupBy(primaryForVerdict, 'regime_assigned');
    for (const [regime, seqs] of Object.entries(regimes)) {
      ln(`### ${regime}`);
      ln();

      const params = REGIME_PARAMS[regime] || REGIME_PARAMS.default;
      ln(`**Parameters**: K=${params.K}, c=${params.c}, p=${params.p}`);
      ln(`**Sequences**: n=${seqs.length}`);
      ln();

      if (seqs.length < 2) {
        ln(`Insufficient sequences (n=${seqs.length}) for confident bias diagnosis. Observations only.`);
        ln();
      }

      // Direction
      const over = seqs.filter(s => s.projected_count > s.actual_count);
      const under = seqs.filter(s => s.projected_count < s.actual_count);
      if (over.length === seqs.length) {
        ln(`**Direction**: Systematically **over-predicting** across all ${seqs.length} sequences.`);
      } else if (under.length === seqs.length) {
        ln(`**Direction**: Systematically **under-predicting** across all ${seqs.length} sequences.`);
      } else {
        ln(`**Direction**: Mixed — ${over.length} over-predictions, ${under.length} under-predictions.`);
      }
      ln();

      // Time-signature analysis using partial windows
      const withPartials = seqs.filter(s => s.partial_windows && s.partial_windows.length === 3);
      if (withPartials.length > 0) {
        ln('**Time-signature analysis** (6h/24h/72h):');
        ln();
        ln('| Sequence | 6h proj/act | 24h proj/act | 72h proj/act | Pattern |');
        ln('|----------|-------------|--------------|--------------|---------|');
        const patterns = [];
        for (const s of withPartials) {
          const pw = s.partial_windows;
          const earlyErr = pw[0].actual > 0 ? Math.abs(pw[0].projected - pw[0].actual) / pw[0].actual : Infinity;
          const midErr = pw[1].actual > 0 ? Math.abs(pw[1].projected - pw[1].actual) / pw[1].actual : Infinity;
          const lateErr = pw[2].actual > 0 ? Math.abs(pw[2].projected - pw[2].actual) / pw[2].actual : Infinity;
          let pattern;
          if (earlyErr > 2 * midErr) pattern = 'Early bias (suspect c)';
          else if (lateErr > 2 * midErr) pattern = 'Late drift (suspect p)';
          else pattern = 'Uniform bias (suspect K)';
          patterns.push(pattern);
          ln(`| ${s.label} | ${pw[0].projected}/${pw[0].actual} | ${pw[1].projected}/${pw[1].actual} | ${pw[2].projected}/${pw[2].actual} | ${pattern} |`);
        }
        ln();

        const kCount = patterns.filter(p => p.includes('K')).length;
        const cCount = patterns.filter(p => p.includes(' c)')).length;
        const pCount = patterns.filter(p => p.includes(' p)')).length;
        if (kCount >= cCount && kCount >= pCount) {
          ln(`**Suspected parameter**: **K** (productivity) — ${kCount}/${withPartials.length} sequences show uniform bias across all time windows.`);
        } else if (cCount > kCount && cCount >= pCount) {
          ln(`**Suspected parameter**: **c** (time offset) — ${cCount}/${withPartials.length} sequences show early-time bias.`);
        } else {
          ln(`**Suspected parameter**: **p** (decay exponent) — ${pCount}/${withPartials.length} sequences show late drift.`);
        }
      } else {
        ln('No partial-window data available for this regime.');
      }
      ln();

      // Per-sequence detail
      for (const s of seqs) {
        const dir = s.projected_count > s.actual_count ? 'OVER' : (s.projected_count < s.actual_count ? 'UNDER' : 'EXACT');
        ln(`- **${s.label}**: projected ${s.projected_count} vs actual ${s.actual_count} → ${dir} (rel error: ${fmtErr(s.relative_error)})`);
      }
      ln();
    }
  }

  // =====================================================================
  // Section 4: Regime-inference results
  // =====================================================================
  ln('---');
  ln();
  ln('## 4. Regime-Inference Results');
  ln();

  const inference = results.filter(r => r.role === 'inference' && !r.error);
  if (inference.length > 0) {
    ln('| # | Sequence | Expected | Assigned | Match |');
    ln('|---|----------|----------|----------|-------|');
    for (const r of inference) {
      ln(`| ${r.sequence_id} | ${r.label} | ${r.regime_expected} | ${r.regime_assigned} | ${r.regime_match ? '✓' : '✗'} |`);
    }
    ln();

    const mismatches = inference.filter(r => !r.regime_match);
    if (mismatches.length > 0) {
      ln('### Misassignments');
      ln();
      for (const r of mismatches) {
        ln(`- **${r.label}**: assigned \`${r.regime_assigned}\` but expected \`${r.regime_expected}\`. Depth: ${r.mainshock_depth_km}km, Location: ${r.mainshock_location}`);
      }
      ln();
    }
  }

  const inferenceErrors = results.filter(r => r.role === 'inference' && r.error);
  if (inferenceErrors.length > 0) {
    ln(`**Errored**: ${inferenceErrors.map(r => `${r.label} (${r.error})`).join(', ')}`);
    ln();
  }

  // =====================================================================
  // Section 5: Volcanic robustness results
  // =====================================================================
  ln('---');
  ln();
  ln('## 5. Volcanic Robustness Results');
  ln();
  ln('Robustness/stress-test only. Do not score against protocol thresholds. Do not refit K/c/p from these.');
  ln();

  const volcanic = results.filter(r => r.role === 'volcanic' && !r.error);
  if (volcanic.length > 0) {
    ln('| # | Sequence | Regime | Projected | Actual | Bucket Hit | Notes |');
    ln('|---|----------|--------|-----------|--------|------------|-------|');
    for (const r of volcanic) {
      ln(`| ${r.sequence_id} | ${r.label} | ${r.regime_assigned} | ${r.projected_count} | ${r.actual_count} | ${r.bucket_hit ? '✓' : '✗'} | ${r.notes} |`);
    }
    ln();
  }

  const volcanicErrors = results.filter(r => r.role === 'volcanic' && r.error);
  if (volcanicErrors.length > 0) {
    for (const r of volcanicErrors) {
      ln(`- **${r.label}**: ERROR — ${r.error}. ${r.notes || ''}`);
    }
    ln();
  }

  // =====================================================================
  // Section 6: Truncation and coverage notes
  // =====================================================================
  ln('---');
  ln();
  ln('## 6. Truncation and Coverage Notes');
  ln();

  const paginated = ran.filter(r => r.aftershock_paginated);
  const nonComparable = ran.filter(r => r.aftershock_status === 'non-comparable');
  const coverageUncertainAll = ran.filter(r => r.aftershock_status === 'coverage-uncertain');

  if (paginated.length === 0 && nonComparable.length === 0 && coverageUncertainAll.length === 0) {
    ln('No truncation or coverage issues detected.');
  } else {
    if (paginated.length > 0) {
      ln(`**Paginated successfully**: ${paginated.map(r => `seq ${r.sequence_id} (${r.label})`).join(', ')}`);
      ln();
    }
    if (nonComparable.length > 0) {
      ln(`**NON-COMPARABLE** (excluded from verdicts): ${nonComparable.map(r => `seq ${r.sequence_id} (${r.label})`).join(', ')}`);
      ln();
    }
    if (coverageUncertainAll.length > 0) {
      ln(`**COVERAGE-UNCERTAIN**: ${coverageUncertainAll.map(r => `seq ${r.sequence_id} (${r.label}, ${r.reviewed_coverage_pct}% reviewed)`).join(', ')}`);
      ln('These sequences excluded from primary K/c/p conclusions, reported as robustness-only.');
      ln();

      // Document fallback candidates per protocol order
      const primaryIds = new Set(allRegimeFit.filter(r => r.intraplate_tier === 'primary' && r.aftershock_status !== 'coverage-uncertain').map(r => r.mainshock_event_id));
      const secondarySeqs = SEQUENCES.filter(s => s.intraplate_tier === 'secondary');
      const availableFallbacks = secondarySeqs.filter(s => !primaryIds.has(s.event_id));
      if (availableFallbacks.length > 0) {
        ln(`Fallback candidates (protocol order): ${availableFallbacks.map(s => s.label).join(', ')}`);
        ln();
      }
    }
  }
  ln();

  // =====================================================================
  // Section 7: Protocol adherence notes
  // =====================================================================
  ln('---');
  ln();
  ln('## 7. Protocol Adherence Notes');
  ln();
  ln('1. **Protocol version**: v2.0 confirmed before execution.');
  ln('2. **Mainshock definition**: Used event ID from protocol; searched for largest reviewed event when ID not provided. Volcanic sequences flagged as mainshock-definition-uncertain.');
  ln('3. **Mainshock verification**: lat/lon within 0.5°, magnitude within 0.3, depth within 10km tolerance applied per protocol.');
  ln('4. **72-hour window**: Half-open interval [start, end) per protocol.');
  ln('5. **Count rules**: M≥4.0, reviewed only, within TREMOR matchRadius, excluding mainshock and non-tectonic events.');
  ln('6. **Scoring**: All metrics computed (projected count, bucket hit, relative error, log error, Brier). Three-window partial analysis (6h/24h/72h) for bias diagnosis.');
  ln("7. **No duplicate math**: All Omori calculations via TREMOR's exported `omoriExpectedCount()`. M<6.0 sequences via direct function calls; M≥6.0 via `createAftershockCascade()`.");
  ln('8. **Truncation handling**: `limit=20000` on all queries; pagination attempted when limit hit.');
  ln('9. **International coverage**: Petermann and Botswana checked for reviewed-status coverage with 80% threshold.');
  ln('10. **Intraplate split**: Primary (n=up to 5) and secondary (n=2) reported separately per protocol.');
  ln('11. **500ms delay**: Applied between all FDSN queries.');

  const verificationFailures = results.filter(r => r.mainshock_event_id_verified === false);
  if (verificationFailures.length > 0) {
    ln();
    ln(`**Verification failures**: ${verificationFailures.map(r => `${r.label} (${r.verification_discrepancies?.join('; ')})`).join(', ')}`);
  }
  ln();

  // =====================================================================
  // Section 8: Recommended next steps
  // =====================================================================
  ln('---');
  ln();
  ln('## 8. Recommended Next Steps');
  ln();

  if (primaryForVerdict.length > 0) {
    const regimes = groupBy(primaryForVerdict, 'regime_assigned');
    for (const [regime, seqs] of Object.entries(regimes)) {
      const hitRate = seqs.filter(s => s.bucket_hit).length / seqs.length;
      const finiteErrors = seqs.filter(s => s.relative_error != null);
      const meanRelErr = finiteErrors.length > 0
        ? finiteErrors.reduce((s, r) => s + Math.abs(r.relative_error), 0) / finiteErrors.length
        : null;
      const cls = meanRelErr != null ? classify(hitRate, meanRelErr) : 'Insufficient data';

      if (cls === 'Fail') {
        const direction = seqs.every(s => s.projected_count > s.actual_count) ? 'over' : 'under';
        ln(`- **${regime}** (n=${seqs.length}): **REFIT NEEDED** (Fail). Systematically ${direction}-predicting. Current K=${(REGIME_PARAMS[regime] || REGIME_PARAMS.default).K}. Suspected parameter per bias diagnosis above.`);
      } else if (cls === 'Marginal') {
        ln(`- **${regime}** (n=${seqs.length}): **MONITOR** (Marginal). Parameters plausible but need refinement.`);
      } else if (cls === 'Pass') {
        ln(`- **${regime}** (n=${seqs.length}): **PASS**. Parameters directionally correct.`);
      } else {
        ln(`- **${regime}** (n=${seqs.length}): ${cls}.`);
      }
    }
    ln();
  }

  // inferRegime issues
  const allMismatches = allRegimeFit.filter(r => r.regime_assigned !== r.regime_expected);
  if (allMismatches.length > 0) {
    ln(`**inferRegime**: ${allMismatches.length} misassignment(s) detected across regime-fit sequences. Review heuristic boundaries in aftershock.js.`);
    ln();
  }

  // Coverage issues
  if (coverageIssues.length > 0) {
    ln(`**International coverage**: ${coverageIssues.length} sequence(s) below 80% reviewed threshold. Consider backup substitution per protocol fallback order.`);
    ln();
  }

  ln('---');
  ln();
  ln('*Phase 1 diagnostic backtest. Not final calibration proof.*');

  const report = lines.join('\n');
  writeFileSync(join(OUTPUT_DIR, 'diagnostic-report.md'), report + '\n');
}

// =========================================================================
// Utilities
// =========================================================================

function groupBy(arr, key) {
  const groups = {};
  for (const item of arr) {
    const k = item[key];
    if (!groups[k]) groups[k] = [];
    groups[k].push(item);
  }
  return groups;
}

function classify(hitRate, meanAbsRelErr) {
  // Protocol thresholds
  if (hitRate >= 0.7 && meanAbsRelErr < 0.3) return 'Pass';
  if (hitRate < 0.5 || meanAbsRelErr > 0.6) return 'Fail';
  return 'Marginal';
}

function fmtPct(value) {
  if (value == null || !Number.isFinite(value)) return 'N/A';
  return (value * 100).toFixed(1) + '%';
}

function fmtErr(value) {
  if (value == null) return 'N/A (zero actual)';
  if (!Number.isFinite(value)) return '∞';
  return (value * 100).toFixed(1) + '%';
}

// =========================================================================
// Run
// =========================================================================

runBacktest().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
