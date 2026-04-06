#!/usr/bin/env node

/**
 * Study 4 — Regional Profile Recalibration
 *
 * Query USGS FDSN for M4.5+ reviewed events 2021-01-01 to 2026-01-01,
 * compute actual medians of nst, gap, rms per region bbox, compare to
 * hardcoded values in src/processor/regions.js.
 *
 * Output: grimoires/loa/calibration/regional-profiles-findings.md
 */

import { REGION_PROFILES, DEFAULT_REGION } from '../src/processor/regions.js';
import { writeFileSync } from 'node:fs';

const FDSN_BASE = 'https://earthquake.usgs.gov/fdsnws/event/1/query';
const DELAY_MS = 500;
const LIMIT = 20000;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function median(arr) {
  if (arr.length === 0) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

async function fetchRegionEvents(region) {
  const [minLon, minLat, maxLon, maxLat] = region.bbox;

  // Handle antimeridian crossing (South Pacific: minLon > maxLon)
  if (minLon > maxLon) {
    // Split into two queries: minLon→180 and -180→maxLon
    const eventsA = await fetchBbox(region.name + ' (west)', minLon, minLat, 180, maxLat);
    await sleep(DELAY_MS);
    const eventsB = await fetchBbox(region.name + ' (east)', -180, minLat, maxLon, maxLat);
    return [...eventsA, ...eventsB];
  }

  return fetchBbox(region.name, minLon, minLat, maxLon, maxLat);
}

async function fetchBbox(label, minLon, minLat, maxLon, maxLat) {
  const allEvents = [];
  let offset = 1; // FDSN offset is 1-based
  let truncated = false;

  while (true) {
    const params = new URLSearchParams({
      format: 'geojson',
      minmagnitude: '4.5',
      starttime: '2021-01-01',
      endtime: '2026-01-01',
      minlatitude: String(minLat),
      maxlatitude: String(maxLat),
      minlongitude: String(minLon),
      maxlongitude: String(maxLon),
      eventtype: 'earthquake',
      reviewstatus: 'reviewed',
      limit: String(LIMIT),
      offset: String(offset),
    });

    const url = `${FDSN_BASE}?${params}`;
    console.log(`  Fetching ${label} offset=${offset}...`);
    const resp = await fetch(url);

    if (!resp.ok) {
      console.error(`  HTTP ${resp.status} for ${label}`);
      break;
    }

    const data = await resp.json();
    const features = data.features || [];
    allEvents.push(...features);

    if (features.length >= LIMIT) {
      truncated = true;
      offset += features.length;
      console.log(`  Truncated at ${LIMIT}, paginating (offset=${offset})...`);
      await sleep(DELAY_MS);
    } else {
      break;
    }
  }

  return allEvents;
}

function extractFieldValues(events) {
  const nst = [];
  const gap = [];
  const rms = [];

  for (const e of events) {
    const p = e.properties;
    if (p.nst != null && Number.isFinite(p.nst)) nst.push(p.nst);
    if (p.gap != null && Number.isFinite(p.gap)) gap.push(p.gap);
    if (p.rms != null && Number.isFinite(p.rms)) rms.push(p.rms);
  }

  return { nst, gap, rms };
}

function pctDeviation(current, measured) {
  if (measured === null || measured === 0) return null;
  return ((measured - current) / current) * 100;
}

function flag(deviation) {
  if (deviation === null) return '';
  return Math.abs(deviation) > 15 ? ' ⚠️' : '';
}

async function main() {
  console.log('Study 4 — Regional Profile Recalibration');
  console.log('=========================================\n');

  const results = [];

  for (const region of REGION_PROFILES) {
    console.log(`Region: ${region.name}`);
    const events = await fetchRegionEvents(region);
    console.log(`  Total events: ${events.length}`);

    const vals = extractFieldValues(events);
    const medNst = median(vals.nst);
    const medGap = median(vals.gap);
    const medRms = median(vals.rms);

    console.log(`  median_nst=${medNst} (current=${region.median_nst}, n=${vals.nst.length})`);
    console.log(`  median_gap=${medGap} (current=${region.median_gap}, n=${vals.gap.length})`);
    console.log(`  median_rms=${medRms} (current=${region.baseline_rms}, n=${vals.rms.length})`);

    results.push({
      name: region.name,
      eventCount: events.length,
      nst: { current: region.median_nst, measured: medNst, n: vals.nst.length },
      gap: { current: region.median_gap, measured: medGap, n: vals.gap.length },
      rms: { current: region.baseline_rms, measured: medRms, n: vals.rms.length },
      truncated: events.length >= LIMIT,
    });

    await sleep(DELAY_MS);
  }

  // Generate findings markdown
  let md = '# Study 4 — Regional Profile Recalibration Findings\n\n';
  md += `**Date**: ${new Date().toISOString().slice(0, 10)}\n`;
  md += '**Data source**: USGS FDSN event web service, M4.5+ reviewed earthquakes, 2021-01-01 to 2026-01-01\n';
  md += '**Evidence tag**: DATA-FACTUAL (all measured values derived from USGS catalog queries)\n\n';

  md += '## Per-Region Comparison\n\n';
  md += '| Region | Field | Current | Measured Median | Deviation % | Flag | Events (n) |\n';
  md += '|--------|-------|---------|-----------------|-------------|------|------------|\n';

  for (const r of results) {
    const nstDev = pctDeviation(r.nst.current, r.nst.measured);
    const gapDev = pctDeviation(r.gap.current, r.gap.measured);
    const rmsDev = pctDeviation(r.rms.current, r.rms.measured);

    const fmt = (v) => v !== null ? v.toFixed(2) : 'N/A';
    const fmtDev = (v) => v !== null ? (v >= 0 ? '+' : '') + v.toFixed(1) + '%' : 'N/A';

    md += `| ${r.name} | median_nst | ${r.nst.current} | ${fmt(r.nst.measured)} | ${fmtDev(nstDev)}${flag(nstDev)} | ${r.nst.n} events |\n`;
    md += `| | median_gap | ${r.gap.current} | ${fmt(r.gap.measured)} | ${fmtDev(gapDev)}${flag(gapDev)} | ${r.gap.n} events |\n`;
    md += `| | baseline_rms | ${r.rms.current} | ${fmt(r.rms.measured)} | ${fmtDev(rmsDev)}${flag(rmsDev)} | ${r.rms.n} events |\n`;

    if (r.truncated) {
      md += `| | **⚠️ TRUNCATED** | Dataset hit ${LIMIT} limit — medians may be biased | | | |\n`;
    }
  }

  md += '\n## Recommendations\n\n';

  let hasRecommendations = false;
  for (const r of results) {
    const fields = [
      { name: 'median_nst', current: r.nst.current, measured: r.nst.measured },
      { name: 'median_gap', current: r.gap.current, measured: r.gap.measured },
      { name: 'baseline_rms', current: r.rms.current, measured: r.rms.measured },
    ];

    for (const f of fields) {
      const dev = pctDeviation(f.current, f.measured);
      if (dev !== null && Math.abs(dev) > 15) {
        hasRecommendations = true;
        md += `- **${r.name}.${f.name}**: Replace \`${f.current}\` → \`${f.measured.toFixed(2)}\` `;
        md += `(${dev >= 0 ? '+' : ''}${dev.toFixed(1)}% deviation). Evidence: DATA-FACTUAL.\n`;
      }
    }
  }

  if (!hasRecommendations) {
    md += 'All values within ±15% of measured medians. No replacements recommended at this time.\n';
  }

  md += '\n## Truncation Notes\n\n';
  const truncated = results.filter(r => r.truncated);
  if (truncated.length > 0) {
    for (const r of truncated) {
      md += `- **${r.name}**: Result count hit the ${LIMIT} limit. Pagination was attempted but medians may still be affected if the dataset is very large.\n`;
    }
  } else {
    md += 'No regions hit the truncation limit.\n';
  }

  md += '\n## Methodology\n\n';
  md += '- One FDSN query per region bounding box with 500ms delay between queries\n';
  md += '- Antimeridian-crossing regions (South Pacific) split into two bbox queries\n';
  md += '- Medians computed only over events where the field is present and non-null\n';
  md += '- Deviation = (measured − current) / current × 100%\n';
  md += '- Flag threshold: |deviation| > 15%\n';

  writeFileSync('grimoires/loa/calibration/regional-profiles-findings.md', md);
  console.log('\n✅ Findings written to grimoires/loa/calibration/regional-profiles-findings.md');
}

main().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
