/**
 * GEOFON cross-validation oracle.
 *
 * Queries the GFZ German Research Centre for Geosciences FDSN event service
 * for independent magnitude readings to cross-validate USGS data. Uses the
 * pipe-delimited text format (GEOFON does not support GeoJSON).
 *
 * Endpoint: https://geofon.gfz.de/fdsnws/event/1/query
 *
 * Why GEOFON: IRIS/EarthScope FDSN event endpoint retires June 1, 2026.
 * GEOFON is independent, real-time, global, FDSN-compliant, and has no
 * announced retirement.
 */

const GEOFON_API_BASE = 'https://geofon.gfz.de/fdsnws/event/1/query';

/**
 * Cross-validate a USGS event against GEOFON GFZ.
 *
 * Matches by time window (±60s) and spatial proximity (≤1° radius).
 * Parses GEOFON's pipe-delimited text response format.
 *
 * @param {object} feature - USGS GeoJSON-like feature
 * @param {object} feature.properties - { mag: number, time: number (epoch ms) }
 * @param {object} feature.geometry - { coordinates: [lon, lat, depth] }
 * @returns {Promise<object|null>} Cross-validation result or null on failure
 */
export async function crossValidateGEOFON(feature) {
  const { properties: props, geometry } = feature;
  const [lon, lat] = geometry.coordinates;
  const eventTime = new Date(props.time);

  // Build time window: ±60 seconds
  const start = new Date(eventTime.getTime() - 60_000).toISOString();
  const end = new Date(eventTime.getTime() + 60_000).toISOString();

  // GEOFON uses `start`/`end`, not `starttime`/`endtime`
  const params = new URLSearchParams({
    start,
    end,
    latitude: lat.toString(),
    longitude: lon.toString(),
    maxradius: '1.0',
    minmag: Math.max(0, (props.mag ?? 0) - 1.0).toString(),
    format: 'text',
    limit: '5',
    orderby: 'time',
  });

  try {
    const response = await fetch(`${GEOFON_API_BASE}?${params}`, {
      signal: AbortSignal.timeout(10_000), // 10s timeout
    });

    if (!response.ok) {
      return null;
    }

    const body = await response.text();

    // Parse pipe-delimited text response
    const lines = body.split('\n').filter((l) => l.trim() !== '' && !l.startsWith('#'));

    if (lines.length === 0) {
      return null;
    }

    // First data line (closest in time given orderby=time)
    const fields = lines[0].split('|');
    const geofonMag = parseFloat(fields[10]);

    if (!Number.isFinite(geofonMag)) {
      return null;
    }

    const usgsMag = props.mag;
    if (!Number.isFinite(usgsMag)) {
      return null;
    }
    const divergence = Math.round(Math.abs(usgsMag - geofonMag) * 10000) / 10000;

    // TODO: queue/batch in production to respect rate limits
    return {
      source: 'GEOFON_GFZ',
      queried_at: Date.now(),
      geofon_mag: geofonMag,
      geofon_mag_type: fields[9] || 'unknown',
      divergence,
      paradox_flag: divergence >= 0.3,
      event_count: lines.length,
      sources_checked: ['GEOFON_GFZ'],
    };
  } catch (err) {
    // Network error, timeout, etc. — fail gracefully
    console.warn('[TREMOR:GEOFON] Cross-validation failed:', err.message);
    return null;
  }
}
