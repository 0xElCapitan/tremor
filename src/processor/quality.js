/**
 * Quality scoring for evidence bundles.
 *
 * Computes a composite 0-1 confidence score from USGS metadata,
 * normalized against regional network density baselines.
 *
 * A 40° azimuthal gap in Japan (dense network) = mediocre.
 * A 40° gap in the South Pacific (sparse network) = excellent.
 * The construct should know the difference.
 */

import { findRegion, DENSITY_NORM } from './regions.js';

/**
 * Normalize station count against regional baseline.
 * Score 0-1 where 1 = excellent relative to expected.
 */
function normalizeStationCount(raw, region) {
  if (raw === null || raw === 0) return 0;
  return Math.min(1, raw / (region.median_nst * 1.5));
}

/**
 * Normalize azimuthal gap against regional baseline.
 * Lower gap is better. Score 1 when gap=0, 0 when gap ≥ 1.5× median.
 */
function normalizeGap(raw, region) {
  // TBD: empirical calibration needed — 0.3 missing-value default is an
  // engineering heuristic; see grimoires/loa/calibration/
  if (raw === null) return 0.3;
  return Math.max(0, 1 - raw / (region.median_gap * 1.5));
}

/**
 * Normalize RMS residual against regional baseline.
 * Lower RMS is better.
 */
function normalizeRms(raw, region) {
  // TBD: empirical calibration needed — 0.3 missing-value default is an
  // engineering heuristic; see grimoires/loa/calibration/
  if (raw === null) return 0.3;
  return Math.max(0, 1 - raw / (region.baseline_rms * 2));
}

/**
 * Compute quality score for a USGS feature.
 *
 * @param {object} feature - USGS GeoJSON feature
 * @returns {object} Quality score with composite and components
 */
export function computeQuality(feature) {
  const { properties: props, geometry } = feature;
  const [lon, lat] = geometry.coordinates;
  const region = findRegion(lon, lat);

  // ---------------------------------------------------------------------
  // statusWeights, composite weights, and missing-value defaults below are
  // TBD: empirical calibration needed — see grimoires/loa/calibration/
  // Values are engineering defaults, not derived from a historical catalog
  // refit. Do not tune without empirical backing.
  // ---------------------------------------------------------------------
  const statusWeights = {
    reviewed: 1.0,
    automatic: 0.4,
    deleted: 0.0,
  };
  const statusWeight = statusWeights[props.status] ?? 0.2;

  // Normalize against regional baselines
  const gapScore = normalizeGap(props.gap, region);
  const rmsScore = normalizeRms(props.rms, region);
  const stationScore = normalizeStationCount(props.nst, region);
  const networkDensityNorm = DENSITY_NORM[region.density_grade] ?? 0.5;

  // Weighted composite (five-component weighted average; weights sum to 1.0).
  // TBD: empirical calibration needed — weight distribution is an engineering
  // judgement, not sourced; see grimoires/loa/calibration/
  const composite =
    statusWeight * 0.40 +
    gapScore * 0.15 +
    rmsScore * 0.15 +
    stationScore * 0.15 +
    networkDensityNorm * 0.15;

  const rationale = [
    `region=${region.name} (${region.density_grade})`,
    `status=${props.status} (w=${statusWeight})`,
    `gap=${props.gap ?? 'null'}° (norm=${gapScore.toFixed(2)} vs median ${region.median_gap}°)`,
    `rms=${props.rms ?? 'null'}s (norm=${rmsScore.toFixed(2)} vs baseline ${region.baseline_rms}s)`,
    `nst=${props.nst ?? 'null'} (norm=${stationScore.toFixed(2)} vs median ${region.median_nst})`,
  ].join('; ');

  return {
    composite: round3(composite),
    components: {
      status_weight: statusWeight,
      gap_penalty: round3(gapScore),
      rms_penalty: round3(rmsScore),
      station_score: round3(stationScore),
      network_density_norm: networkDensityNorm,
    },
    region: {
      name: region.name,
      density_grade: region.density_grade,
    },
    rationale,
  };
}

function round3(n) { return Math.round(n * 1000) / 1000; }
