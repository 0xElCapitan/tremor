/**
 * Status flip assessment — three-tier settlement logic.
 *
 * Handles the latency between USGS automatic detection and reviewed
 * confirmation. TREMOR Theatres resolve in hours to days — we can't
 * always wait for the oracle stamp.
 *
 * Tier 1 — Oracle: status='reviewed' → ground_truth → resolve
 * Tier 2 — Provisional Mature: automatic but stable, cross-validated
 * Tier 3 — Market Freeze: theatre expiring, data not ready
 *
 * 7-day hard expiry for events that never get reviewed.
 */

// ---------------------------------------------------------------------
// Settlement-tier time constants and brier_discount values below are
// TBD: empirical calibration needed — see grimoires/loa/calibration/
//
// - TWO_HOURS: minimum age before an automatic event can be treated as
//   "provisional mature" (engineering heuristic; USGS typically promotes
//   to 'reviewed' within hours to days).
// - ONE_HOUR: revision-stability window and theatre-expiring guard.
// - SEVEN_DAYS: hard expiry for events that never reach 'reviewed'.
// - composite > 0.5 quality gate (below) and the three brier_discount
//   values (0.10 / 0.20 / 0.25) are also TBD: empirical calibration
//   needed. Discounts currently encode "how much to penalize a Brier
//   score when resolving against less-than-gold-standard evidence".
//   See grimoires/loa/calibration/settlement-findings.md for empirical
//   derivation of replacement values.
// ---------------------------------------------------------------------
const TWO_HOURS = 2 * 60 * 60;
const ONE_HOUR = 60 * 60;
const SEVEN_DAYS = 7 * 24 * 60 * 60;

/**
 * Assess whether an event is ready for market settlement.
 *
 * @param {object} feature - USGS GeoJSON feature
 * @param {object} quality - Output from computeQuality()
 * @param {Array} revisionHistory - Array of {timestamp, magnitude, magType, status}
 * @param {boolean} crossValidated - Whether event confirmed by another network
 * @param {number|null} theatreExpiresAt - Epoch ms of earliest matching theatre expiry
 * @returns {object} Settlement assessment
 */
export function assessStatusFlip(
  feature,
  quality,
  revisionHistory = [],
  crossValidated = false,
  theatreExpiresAt = null,
) {
  const now = Date.now();
  const eventTime = feature.properties.time;
  const eventAge = (now - eventTime) / 1000;
  const status = feature.properties.status;

  // Tier 1: Oracle — reviewed by seismologist
  if (status === 'reviewed') {
    return {
      evidence_class: 'ground_truth',
      recommended_state: 'resolved',
      resolution_eligible: true,
      ineligible_reason: null,
      brier_discount: 0,
    };
  }

  // Deleted events — market resolves as "event did not occur"
  if (status === 'deleted') {
    return {
      evidence_class: 'degraded',
      recommended_state: 'resolved',
      resolution_eligible: true,
      ineligible_reason: null,
      brier_discount: 0,
    };
  }

  // Check magnitude stability (no revisions in last hour)
  const recentRevisions = revisionHistory.filter(
    (r) => (now - r.timestamp) / 1000 < ONE_HOUR
  );
  const magnitudeStable = recentRevisions.length === 0;

  // Tier 2: Provisional Mature
  if (
    eventAge > TWO_HOURS &&
    magnitudeStable &&
    quality.composite > 0.5 &&
    crossValidated
  ) {
    return {
      evidence_class: 'provisional_mature',
      recommended_state: 'provisional_hold',
      resolution_eligible: true,
      ineligible_reason: null,
      brier_discount: 0.10,
    };
  }

  // Check if theatre is expiring
  const theatreExpiring =
    theatreExpiresAt !== null && (theatreExpiresAt - now) / 1000 < ONE_HOUR;

  // Tier 3: Market Freeze
  if (theatreExpiring) {
    return {
      evidence_class: 'provisional',
      recommended_state: 'frozen',
      resolution_eligible: false,
      ineligible_reason:
        `Theatre expiring but event still automatic ` +
        `(composite=${quality.composite.toFixed(3)}, cross_validated=${crossValidated})`,
      brier_discount: 0.20,
    };
  }

  // 7-day hard expiry
  if (eventAge > SEVEN_DAYS) {
    return {
      evidence_class: 'provisional_mature',
      recommended_state: 'resolved',
      resolution_eligible: true,
      ineligible_reason: null,
      brier_discount: 0.25,
    };
  }

  // Default: still cooking
  return {
    evidence_class: 'provisional',
    recommended_state: null,
    resolution_eligible: false,
    ineligible_reason:
      `Event age ${Math.round(eventAge)}s, status=${status}, ` +
      `stable=${magnitudeStable}, quality=${quality.composite.toFixed(3)}`,
    brier_discount: 0,
  };
}
