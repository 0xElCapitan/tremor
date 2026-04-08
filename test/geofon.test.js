import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { crossValidateGEOFON } from '../src/oracles/geofon.js';
import { crossValidateEMSC } from '../src/oracles/emsc.js';

// Realistic GEOFON pipe-delimited text response
const GEOFON_HEADER = '#EventID|Time|Latitude|Longitude|Depth|Author|Catalog|Contributor|ContributorID|MagType|Magnitude|MagAuthor|EventLocationName';

function makeGeofonResponse(mag, magType = 'mb') {
  return [
    GEOFON_HEADER,
    `gfz2026abcd|2026-04-07T12:00:05.0|35.5|25.1|10.0|GFZ|GEOFON|GFZ|gfz2026abcd|${magType}|${mag}|GFZ|Crete, Greece`,
  ].join('\n');
}

const SAMPLE_FEATURE = {
  properties: { mag: 5.2, time: new Date('2026-04-07T12:00:00Z').getTime() },
  geometry: { coordinates: [25.1, 35.5, 10.0] },
};

// EMSC JSON response for combined test
const EMSC_RESPONSE = {
  features: [
    {
      id: 'emsc-test-001',
      properties: { mag: 5.1, time: new Date('2026-04-07T12:00:02Z').getTime() },
      geometry: { coordinates: [25.1, 35.5, 10.0] },
    },
  ],
};

describe('GEOFON cross-validation', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('test_geofon_valid_response_returns_cross_validation_result', async () => {
    globalThis.fetch = mock.fn(async () => ({
      ok: true,
      text: async () => makeGeofonResponse(5.3),
    }));

    const result = await crossValidateGEOFON(SAMPLE_FEATURE);
    assert.notEqual(result, null);
    assert.equal(result.source, 'GEOFON_GFZ');
    assert.equal(result.geofon_mag, 5.3);
    assert.equal(result.geofon_mag_type, 'mb');
    assert.equal(result.event_count, 1);
    assert.deepStrictEqual(result.sources_checked, ['GEOFON_GFZ']);
    assert.equal(typeof result.queried_at, 'number');
    assert.equal(typeof result.divergence, 'number');
  });

  it('test_geofon_divergence_gte_0_3_sets_paradox_flag', async () => {
    // USGS mag 5.2, GEOFON mag 5.6 → divergence 0.4
    globalThis.fetch = mock.fn(async () => ({
      ok: true,
      text: async () => makeGeofonResponse(5.6),
    }));

    const result = await crossValidateGEOFON(SAMPLE_FEATURE);
    assert.notEqual(result, null);
    assert.equal(result.divergence, 0.4);
    assert.equal(result.paradox_flag, true);
  });

  it('test_geofon_divergence_lt_0_3_no_flag', async () => {
    // USGS mag 5.2, GEOFON mag 5.3 → divergence 0.1
    globalThis.fetch = mock.fn(async () => ({
      ok: true,
      text: async () => makeGeofonResponse(5.3),
    }));

    const result = await crossValidateGEOFON(SAMPLE_FEATURE);
    assert.notEqual(result, null);
    assert.equal(result.divergence, 0.1);
    assert.equal(result.paradox_flag, false);
  });

  it('test_geofon_malformed_response_returns_null', async () => {
    globalThis.fetch = mock.fn(async () => ({
      ok: true,
      text: async () => 'garbage data with no pipes',
    }));

    const result = await crossValidateGEOFON(SAMPLE_FEATURE);
    // parseFloat on a non-numeric field returns NaN → null
    assert.equal(result, null);
  });

  it('test_geofon_network_error_returns_null', async () => {
    globalThis.fetch = mock.fn(async () => {
      throw new Error('network down');
    });

    const result = await crossValidateGEOFON(SAMPLE_FEATURE);
    assert.equal(result, null);
  });

  it('test_geofon_no_data_lines_in_response_returns_null', async () => {
    // Response with only a header line and no data
    globalThis.fetch = mock.fn(async () => ({
      ok: true,
      text: async () => GEOFON_HEADER + '\n',
    }));

    const result = await crossValidateGEOFON(SAMPLE_FEATURE);
    assert.equal(result, null);
  });

  it('test_cross_validation_sources_checked_contains_both_emsc_and_geofon', async () => {
    // Mock fetch per URL — EMSC returns JSON, GEOFON returns pipe-delimited text
    globalThis.fetch = mock.fn(async (url) => {
      const urlStr = typeof url === 'string' ? url : url.toString();

      if (urlStr.includes('seismicportal.eu')) {
        return {
          ok: true,
          json: async () => EMSC_RESPONSE,
        };
      }

      if (urlStr.includes('geofon.gfz.de')) {
        return {
          ok: true,
          text: async () => makeGeofonResponse(5.3),
        };
      }

      return { ok: false, status: 404 };
    });

    const [emscResult, geofonResult] = await Promise.all([
      crossValidateEMSC(SAMPLE_FEATURE),
      crossValidateGEOFON(SAMPLE_FEATURE),
    ]);

    assert.notEqual(emscResult, null);
    assert.notEqual(geofonResult, null);

    // Build aggregate like src/index.js does
    const sources = [
      ...emscResult.sources_checked,
      ...geofonResult.sources_checked,
    ];

    assert.ok(sources.includes('EMSC'), 'sources_checked should include EMSC');
    assert.ok(sources.includes('GEOFON_GFZ'), 'sources_checked should include GEOFON_GFZ');
  });
});
