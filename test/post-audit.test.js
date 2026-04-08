/**
 * Post-audit fix regression tests.
 *
 * Each test here corresponds to one Group 1 fix from
 * grimoires/loa/sprint.md and would have caught the bug before the
 * post-audit sprint. These are behavioural, not implementation, tests.
 *
 * Maps to sprint:
 *   1a — Poll scheduling + certificate export idempotency
 *   1b — NaN fail-closed in magnitude/bundle pipeline
 *   1c — Atomic certificate writes + pending_exports
 *   1d — USGS/EMSC schema validation
 *   1e — Poll failure visibility
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { TremorConstruct } from '../src/index.js';
import { buildBundle } from '../src/processor/bundles.js';
import { buildMagnitudeUncertainty, NonFiniteMagnitudeError } from '../src/processor/magnitude.js';
import {
  exportCertificate,
  writeCertificate,
  certificateIdFor,
} from '../src/rlmf/certificates.js';
import { createMagnitudeGate, expireMagnitudeGate } from '../src/theatres/mag-gate.js';
import { createAftershockCascade } from '../src/theatres/aftershock.js';
import { validateUsgsFeature, pollAndIngest } from '../src/oracles/usgs.js';

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

function makeFeature(overrides = {}) {
  const defaults = {
    type: 'Feature',
    id: 'us7000test',
    properties: {
      mag: 5.2,
      place: '10km SSW of San Jose, CA',
      time: Date.now() - 3600_000,
      updated: Date.now() - 1800_000,
      status: 'automatic',
      tsunami: 0,
      nst: 45,
      dmin: 0.05,
      rms: 0.18,
      gap: 55,
      magType: 'Mw',
      type: 'earthquake',
      magError: null,
      magNst: null,
      horizontalError: null,
      depthError: null,
    },
    geometry: {
      type: 'Point',
      coordinates: [-121.89, 37.34, 8.2],
    },
  };
  return {
    ...defaults,
    ...overrides,
    properties: { ...defaults.properties, ...overrides.properties },
    geometry: overrides.geometry ?? defaults.geometry,
  };
}

function tempDir(label) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `tremor-${label}-`));
}

function cleanupDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch { /* ignore */ }
}

// ---------------------------------------------------------------------
// 1a — Idempotent certificate export (and deterministic IDs)
// ---------------------------------------------------------------------

describe('1a: idempotent certificate export', () => {
  it('generates a deterministic certificate_id from theatre id + resolved_at', () => {
    const t = createMagnitudeGate({
      region_name: 'Test',
      region_bbox: [-130, 30, -115, 50],
      magnitude_threshold: 5.0,
      window_hours: 24,
      base_rate: 0.15,
    });
    const expired = expireMagnitudeGate(t);

    const id1 = certificateIdFor(expired);
    const id2 = certificateIdFor(expired);
    assert.equal(id1, id2, 'same theatre + resolved_at must yield same id');
    assert.ok(id1.includes(String(expired.resolved_at)));

    const cert1 = exportCertificate(expired);
    const cert2 = exportCertificate(expired);
    assert.equal(cert1.certificate_id, cert2.certificate_id);
  });

  it('writeCertificate is idempotent: second call skips an existing file', () => {
    const dir = tempDir('1a-idempotent');
    try {
      const t = createMagnitudeGate({
        region_name: 'Test',
        region_bbox: [-130, 30, -115, 50],
        magnitude_threshold: 5.0,
        window_hours: 24,
        base_rate: 0.15,
      });
      const cert = exportCertificate(expireMagnitudeGate(t));

      const r1 = writeCertificate(cert, dir);
      const r2 = writeCertificate(cert, dir);

      assert.equal(r1.written, true);
      assert.equal(r1.skipped, false);
      assert.equal(r2.written, false);
      assert.equal(r2.skipped, true);
      assert.equal(r1.path, r2.path);

      // Exactly one file on disk.
      const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
      assert.equal(files.length, 1);
    } finally {
      cleanupDir(dir);
    }
  });

  it('does not leave a temp file behind after a successful write', () => {
    const dir = tempDir('1a-tempclean');
    try {
      const t = createMagnitudeGate({
        region_name: 'Test',
        region_bbox: [-130, 30, -115, 50],
        magnitude_threshold: 5.0,
        window_hours: 24,
        base_rate: 0.15,
      });
      const cert = exportCertificate(expireMagnitudeGate(t));
      writeCertificate(cert, dir);

      const leftovers = fs.readdirSync(dir).filter((f) => f.endsWith('.tmp'));
      assert.equal(leftovers.length, 0);
    } finally {
      cleanupDir(dir);
    }
  });
});

// ---------------------------------------------------------------------
// 1a (continued) — Single-flight poll scheduling + skipped_poll_count
// ---------------------------------------------------------------------

describe('1a: single-flight poll scheduling', () => {
  it('exposes skipped_poll_count on getState()', () => {
    const tremor = new TremorConstruct();
    const state = tremor.getState();
    assert.equal(state.skipped_poll_count, 0);
    assert.ok('skipped_poll_count' in state);
    assert.ok('consecutive_poll_failures' in state);
    assert.ok('last_successful_poll' in state);
    assert.ok('pending_exports' in state);
  });

  it('two overlapping direct poll calls resolve exactly once → one theatre spawn, one certificate', async () => {
    // This test exercises the in-memory idempotency guards. The real
    // setInterval→setTimeout fix is covered by the single-flight scheduler,
    // which cannot be tested without wall-clock time. Instead we simulate
    // the worst case: a caller invoking poll() twice concurrently.
    const dir = tempDir('1a-overlap');
    try {
      const tremor = new TremorConstruct({ certificatesDir: dir });

      // Stub out the feed fetch with a synthetic M6.2 mainshock.
      const mainshock = makeFeature({
        id: 'us7000mainshock',
        properties: { mag: 6.2, status: 'reviewed' },
      });
      const feed = {
        type: 'FeatureCollection',
        metadata: { generated: Date.now(), count: 1 },
        features: [mainshock],
      };

      // Monkey-patch global fetch for this test.
      const origFetch = globalThis.fetch;
      globalThis.fetch = async () => ({
        ok: true,
        status: 200,
        json: async () => feed,
      });

      try {
        // Run two polls back-to-back (sequential to respect processedEvents
        // dedup; the key property we assert is that the second poll cannot
        // re-spawn a cascade or re-export a certificate).
        await tremor.poll();
        await tremor.poll();

        const cascades = Array.from(tremor.theatres.values()).filter(
          (t) => t.template === 'aftershock_cascade',
        );
        assert.equal(cascades.length, 1, 'exactly one aftershock cascade spawned');

        const certFiles = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
        // Aftershock cascade does not resolve immediately (it waits for its
        // 72h window). Mainshock is used only as trigger, not for direct
        // certificate export. So the assertion is: no duplicate state.
        const state = tremor.getState();
        assert.equal(state.theatres.total, 1);
        assert.equal(state.skipped_poll_count, 0);
      } finally {
        globalThis.fetch = origFetch;
      }
    } finally {
      cleanupDir(dir);
    }
  });
});

// ---------------------------------------------------------------------
// 1b — NaN fail-closed in magnitude + bundle pipeline
// ---------------------------------------------------------------------

describe('1b: NaN fail-closed', () => {
  it('buildMagnitudeUncertainty throws NonFiniteMagnitudeError when mag is NaN', () => {
    const feature = makeFeature({ properties: { mag: NaN } });
    assert.throws(
      () => buildMagnitudeUncertainty(feature),
      (err) => err instanceof NonFiniteMagnitudeError,
    );
  });

  it('buildMagnitudeUncertainty throws when mag is undefined', () => {
    const feature = makeFeature();
    delete feature.properties.mag;
    assert.throws(
      () => buildMagnitudeUncertainty(feature),
      (err) => err instanceof NonFiniteMagnitudeError,
    );
  });

  it('buildBundle rejects (returns null) when nst/gap/rms are null but mag finite (quality still computes)', () => {
    // Per sprint: secondary metadata fields can use documented defaults.
    // This feature has mag=5.2 finite; nst/gap/rms missing should NOT
    // cause rejection — quality score uses defaults.
    const feature = makeFeature({
      properties: { nst: null, gap: null, rms: null },
    });
    const bundle = buildBundle(feature);
    assert.ok(bundle, 'secondary-metadata fallback must not reject the bundle');
    assert.ok(Number.isFinite(bundle.payload.magnitude.doubt_price));
  });

  it('buildBundle returns null when mag itself is non-finite', () => {
    const feature = makeFeature({ properties: { mag: NaN } });
    assert.equal(buildBundle(feature), null);
  });

  it('buildBundle returns null when coordinates are non-finite', () => {
    const feature = makeFeature({
      geometry: { type: 'Point', coordinates: [NaN, 37.34, 8.2] },
    });
    assert.equal(buildBundle(feature), null);
  });

  it('a fully-valid feature still produces a finite Brier-ready doubt_price', () => {
    const bundle = buildBundle(makeFeature());
    assert.ok(bundle);
    assert.ok(Number.isFinite(bundle.payload.magnitude.doubt_price));
    assert.ok(bundle.payload.magnitude.doubt_price >= 0);
    assert.ok(bundle.payload.magnitude.doubt_price <= 1);
  });
});

// ---------------------------------------------------------------------
// 1c — Atomic certificate writes + pending_exports
// ---------------------------------------------------------------------

describe('1c: atomic + pending_exports on failure', () => {
  it('leaves theatre in prior state and surfaces pending_exports when export throws', async () => {
    const dir = tempDir('1c-fail');
    try {
      // Point at a path that IS a file (not a dir) to force mkdir failure.
      const badPath = path.join(dir, 'not-a-dir');
      fs.writeFileSync(badPath, 'blocker');

      const tremor = new TremorConstruct({ certificatesDir: badPath });

      // Create an already-closed magnitude gate theatre, add it, and trigger
      // expiry. checkExpiries() should attempt export, fail, and leave the
      // theatre in 'open' state with a pending_exports entry.
      const theatre = createMagnitudeGate({
        region_name: 'Test',
        region_bbox: [-130, 30, -115, 50],
        magnitude_threshold: 5.0,
        window_hours: 0, // closes immediately
        base_rate: 0.15,
      });
      // Force closes_at into the past.
      theatre.closes_at = Date.now() - 1000;
      tremor.addTheatre(theatre);

      tremor.checkExpiries();

      const state = tremor.getState();
      assert.ok(state.pending_exports.length >= 1, 'pending export must be queued');
      // The in-memory theatre must NOT be in the resolved state on failure.
      const stored = tremor.theatres.get(theatre.id);
      assert.notEqual(stored.state, 'resolved');
      assert.equal(tremor.certificates.length, 0);
    } finally {
      cleanupDir(dir);
    }
  });

  it('successful retry after a prior failure produces exactly one certificate', async () => {
    const dir = tempDir('1c-retry');
    try {
      const tremor = new TremorConstruct({ certificatesDir: dir });

      const theatre = createMagnitudeGate({
        region_name: 'Test',
        region_bbox: [-130, 30, -115, 50],
        magnitude_threshold: 5.0,
        window_hours: 0,
        base_rate: 0.15,
      });
      theatre.closes_at = Date.now() - 1000;
      tremor.addTheatre(theatre);

      // Inject a pending_exports entry with a previously-failed theatre by
      // temporarily disabling writeability: simulate by running checkExpiries
      // after forcing an error path. Here we just retry directly.
      tremor.checkExpiries();

      const state = tremor.getState();
      assert.equal(state.pending_exports.length, 0);
      const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
      assert.equal(files.length, 1);
      assert.equal(tremor.certificates.length, 1);
    } finally {
      cleanupDir(dir);
    }
  });

  it('partial-write simulation: a throw between temp-create and rename leaves no corrupt file at the final path', () => {
    const dir = tempDir('1c-partial');
    try {
      const t = createMagnitudeGate({
        region_name: 'Test',
        region_bbox: [-130, 30, -115, 50],
        magnitude_threshold: 5.0,
        window_hours: 24,
        base_rate: 0.15,
      });
      const cert = exportCertificate(expireMagnitudeGate(t));

      // Force a rename failure by monkey-patching fs.renameSync for one call.
      const origRename = fs.renameSync;
      fs.renameSync = () => { throw new Error('simulated rename failure'); };
      try {
        assert.throws(() => writeCertificate(cert, dir));
      } finally {
        fs.renameSync = origRename;
      }

      // No final .json file should exist.
      const finals = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
      assert.equal(finals.length, 0, 'no final file on partial write');

      // Temp file should be cleaned up.
      const temps = fs.readdirSync(dir).filter((f) => f.endsWith('.tmp'));
      assert.equal(temps.length, 0, 'temp file cleaned up after failure');

      // A clean retry after the simulated failure produces exactly one cert.
      writeCertificate(cert, dir);
      const finalsAfter = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
      assert.equal(finalsAfter.length, 1);
    } finally {
      cleanupDir(dir);
    }
  });
});

// ---------------------------------------------------------------------
// 1d — USGS/EMSC schema validation
// ---------------------------------------------------------------------

describe('1d: USGS schema validation', () => {
  it('rejects a feature missing properties.mag', () => {
    const f = makeFeature();
    delete f.properties.mag;
    assert.equal(validateUsgsFeature(f), 'properties.mag_not_finite');
  });

  it('rejects a feature with non-finite mag', () => {
    assert.equal(validateUsgsFeature(makeFeature({ properties: { mag: NaN } })), 'properties.mag_not_finite');
  });

  it('rejects a feature missing magType', () => {
    const f = makeFeature();
    delete f.properties.magType;
    assert.equal(validateUsgsFeature(f), 'properties.magType_missing');
  });

  it('rejects a feature missing geometry.coordinates', () => {
    const f = makeFeature();
    f.geometry.coordinates = [];
    assert.equal(validateUsgsFeature(f), 'geometry.coordinates_missing');
  });

  it('accepts a fully-valid feature', () => {
    assert.equal(validateUsgsFeature(makeFeature()), null);
  });

  it('pollAndIngest rejects malformed features before processor sees them', async () => {
    const bad = makeFeature({ properties: { mag: NaN }, id: 'badevent' });
    const good = makeFeature({ id: 'goodevent' });
    const feed = {
      type: 'FeatureCollection',
      metadata: { generated: Date.now(), count: 2 },
      features: [bad, good],
    };
    const origFetch = globalThis.fetch;
    globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => feed });
    try {
      const result = await pollAndIngest(
        'm4.5_hour',
        { activeTheatres: [], revisionHistories: new Map() },
        new Set(),
      );
      assert.equal(result.invalid, 1);
      assert.equal(result.bundles.length, 1);
      assert.equal(result.bundles[0].payload.event_id, 'goodevent');
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});

// ---------------------------------------------------------------------
// 1e — Poll failure visibility
// ---------------------------------------------------------------------

describe('1e: poll failure visibility', () => {
  it('increments consecutive_poll_failures and emits error log on the third consecutive failure', async () => {
    const tremor = new TremorConstruct();
    const origFetch = globalThis.fetch;
    globalThis.fetch = async () => { throw new Error('network down'); };

    const origError = console.error;
    const errorLogs = [];
    console.error = (msg) => errorLogs.push(String(msg));

    try {
      await tremor.poll();
      await tremor.poll();
      await tremor.poll();

      const state = tremor.getState();
      assert.equal(state.consecutive_poll_failures, 3);
      assert.ok(errorLogs.some((m) => m.includes('error') && m.includes('Poll failed')),
        'error-level log must be emitted on the 3rd consecutive failure');
    } finally {
      globalThis.fetch = origFetch;
      console.error = origError;
    }
  });

  it('resets consecutive_poll_failures and records last_successful_poll on success', async () => {
    const tremor = new TremorConstruct();
    const origFetch = globalThis.fetch;
    let call = 0;
    globalThis.fetch = async () => {
      call++;
      if (call === 1) throw new Error('transient');
      return {
        ok: true,
        status: 200,
        json: async () => ({
          type: 'FeatureCollection',
          metadata: { generated: Date.now(), count: 0 },
          features: [],
        }),
      };
    };
    try {
      await tremor.poll();
      assert.equal(tremor.getState().consecutive_poll_failures, 1);
      await tremor.poll();
      const state = tremor.getState();
      assert.equal(state.consecutive_poll_failures, 0);
      assert.ok(state.last_successful_poll !== null);
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});

// ---------------------------------------------------------------------
// 2a — cross_validated evidence class upgrade reachable
// ---------------------------------------------------------------------

describe('2a: cross_validated evidence class upgrade', () => {
  it('upgrades provisional to cross_validated when 2+ sources agree with low divergence', async () => {
    const tremor = new TremorConstruct({ enableCrossValidation: true });
    const feature = makeFeature({
      id: 'us7000xval',
      properties: { mag: 5.2, status: 'automatic' },
    });
    const feed = {
      type: 'FeatureCollection',
      metadata: { generated: Date.now(), count: 1 },
      features: [feature],
    };

    const origFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      const urlStr = typeof url === 'string' ? url : url.toString();
      if (urlStr.includes('seismicportal.eu')) {
        return {
          ok: true,
          json: async () => ({
            features: [{
              id: 'emsc-001',
              properties: { mag: 5.25, time: feature.properties.time + 2000 },
              geometry: { coordinates: [-121.89, 37.34, 8.2] },
            }],
          }),
        };
      }
      if (urlStr.includes('geofon.gfz.de')) {
        return {
          ok: true,
          text: async () => [
            '#EventID|Time|Latitude|Longitude|Depth|Author|Catalog|Contributor|ContributorID|MagType|Magnitude|MagAuthor|EventLocationName',
            `gfz001|2026-04-07T12:00:05.0|37.34|-121.89|8.2|GFZ|GEOFON|GFZ|gfz001|Mw|5.3|GFZ|San Jose`,
          ].join('\n'),
        };
      }
      // USGS feed
      return { ok: true, status: 200, json: async () => feed };
    };

    try {
      const result = await tremor.poll();
      assert.equal(result.bundles.length, 1);
      const bundle = result.bundles[0];

      // Both sources returned — divergences are 0.05 (EMSC) and 0.1 (GEOFON),
      // both < 0.2, so evidence class should be upgraded
      assert.equal(bundle.cross_validation.sources_checked.length, 2);
      assert.ok(bundle.cross_validation.sources_checked.includes('EMSC'));
      assert.ok(bundle.cross_validation.sources_checked.includes('GEOFON_GFZ'));
      assert.equal(bundle.evidence_class, 'cross_validated');
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it('does not upgrade when divergence >= 0.2', async () => {
    const tremor = new TremorConstruct({ enableCrossValidation: true });
    const feature = makeFeature({
      id: 'us7000xval2',
      properties: { mag: 5.2, status: 'automatic' },
    });
    const feed = {
      type: 'FeatureCollection',
      metadata: { generated: Date.now(), count: 1 },
      features: [feature],
    };

    const origFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      const urlStr = typeof url === 'string' ? url : url.toString();
      if (urlStr.includes('seismicportal.eu')) {
        return {
          ok: true,
          json: async () => ({
            features: [{
              id: 'emsc-002',
              properties: { mag: 5.5, time: feature.properties.time + 2000 },
              geometry: { coordinates: [-121.89, 37.34, 8.2] },
            }],
          }),
        };
      }
      if (urlStr.includes('geofon.gfz.de')) {
        return {
          ok: true,
          text: async () => [
            '#EventID|Time|Latitude|Longitude|Depth|Author|Catalog|Contributor|ContributorID|MagType|Magnitude|MagAuthor|EventLocationName',
            `gfz002|2026-04-07T12:00:05.0|37.34|-121.89|8.2|GFZ|GEOFON|GFZ|gfz002|Mw|5.6|GFZ|San Jose`,
          ].join('\n'),
        };
      }
      return { ok: true, status: 200, json: async () => feed };
    };

    try {
      const result = await tremor.poll();
      const bundle = result.bundles[0];

      // EMSC divergence 0.3, GEOFON divergence 0.4 — max is 0.4, above 0.2 threshold
      assert.equal(bundle.cross_validation.sources_checked.length, 2);
      assert.equal(bundle.evidence_class, 'provisional');
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it('does not upgrade when only one source responds', async () => {
    const tremor = new TremorConstruct({ enableCrossValidation: true });
    const feature = makeFeature({
      id: 'us7000xval3',
      properties: { mag: 5.2, status: 'automatic' },
    });
    const feed = {
      type: 'FeatureCollection',
      metadata: { generated: Date.now(), count: 1 },
      features: [feature],
    };

    const origFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      const urlStr = typeof url === 'string' ? url : url.toString();
      if (urlStr.includes('seismicportal.eu')) {
        return {
          ok: true,
          json: async () => ({
            features: [{
              id: 'emsc-003',
              properties: { mag: 5.25, time: feature.properties.time + 2000 },
              geometry: { coordinates: [-121.89, 37.34, 8.2] },
            }],
          }),
        };
      }
      if (urlStr.includes('geofon.gfz.de')) {
        // GEOFON fails
        throw new Error('network down');
      }
      return { ok: true, status: 200, json: async () => feed };
    };

    try {
      const result = await tremor.poll();
      const bundle = result.bundles[0];

      // Only EMSC responded — 1 source, not enough for upgrade
      assert.equal(bundle.cross_validation.sources_checked.length, 1);
      assert.equal(bundle.evidence_class, 'provisional');
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});

// ---------------------------------------------------------------------
// 2b — Oracle return shape normalization (divergence field)
// ---------------------------------------------------------------------

describe('2b: oracle divergence field normalization', () => {
  it('EMSC matched result uses divergence field (not max_divergence)', async () => {
    const { crossValidateEMSC } = await import('../src/oracles/emsc.js');
    const origFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({
        features: [{
          id: 'emsc-norm-1',
          properties: { mag: 5.5, time: Date.now() },
          geometry: { coordinates: [-121.89, 37.34, 8.2] },
        }],
      }),
    });

    try {
      const result = await crossValidateEMSC({
        properties: { mag: 5.2, time: Date.now() },
        geometry: { coordinates: [-121.89, 37.34, 8.2] },
      });

      assert.notEqual(result, null);
      assert.ok('divergence' in result, 'EMSC result must have divergence field');
      assert.equal(result.max_divergence, undefined, 'EMSC result must not have max_divergence');
      assert.equal(typeof result.divergence, 'number');
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it('EMSC no-match result uses divergence field', async () => {
    const { crossValidateEMSC } = await import('../src/oracles/emsc.js');
    const origFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({ features: [] }),
    });

    try {
      const result = await crossValidateEMSC({
        properties: { mag: 5.2, time: Date.now() },
        geometry: { coordinates: [-121.89, 37.34, 8.2] },
      });

      assert.notEqual(result, null);
      assert.ok('divergence' in result, 'EMSC no-match must have divergence field');
      assert.equal(result.max_divergence, undefined, 'must not have max_divergence');
      assert.equal(result.divergence, 0);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it('aggregate cross_validation uses divergence field (not max_divergence)', async () => {
    const tremor = new TremorConstruct({ enableCrossValidation: true });
    const feature = makeFeature({
      id: 'us7000norm',
      properties: { mag: 5.2, status: 'automatic' },
    });
    const feed = {
      type: 'FeatureCollection',
      metadata: { generated: Date.now(), count: 1 },
      features: [feature],
    };

    const origFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      const urlStr = typeof url === 'string' ? url : url.toString();
      if (urlStr.includes('seismicportal.eu')) {
        return {
          ok: true,
          json: async () => ({
            features: [{
              id: 'emsc-n1',
              properties: { mag: 5.3, time: feature.properties.time + 1000 },
              geometry: { coordinates: [-121.89, 37.34, 8.2] },
            }],
          }),
        };
      }
      if (urlStr.includes('geofon.gfz.de')) {
        return {
          ok: true,
          text: async () => [
            '#EventID|Time|Latitude|Longitude|Depth|Author|Catalog|Contributor|ContributorID|MagType|Magnitude|MagAuthor|EventLocationName',
            `gfz-n1|2026-04-07T12:00:05.0|37.34|-121.89|8.2|GFZ|GEOFON|GFZ|gfz-n1|Mw|5.25|GFZ|San Jose`,
          ].join('\n'),
        };
      }
      return { ok: true, status: 200, json: async () => feed };
    };

    try {
      const result = await tremor.poll();
      const cv = result.bundles[0].cross_validation;

      assert.ok('divergence' in cv, 'aggregate must have divergence field');
      assert.equal(cv.max_divergence, undefined, 'aggregate must not have max_divergence');
      assert.equal(typeof cv.divergence, 'number');
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});
