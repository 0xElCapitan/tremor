# Changelog

All notable changes to TREMOR will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1] - 2026-04-05

### Fixed

- Single-flight poll scheduling prevents duplicate certificate exports on concurrent polls
- Fail-closed NaN handling in magnitude/bundle pipeline
- Atomic certificate export writes (temp file + rename) prevent partial-write corruption
- USGS/EMSC GeoJSON schema validation at oracle layer
- Poll failure visibility: `consecutive_poll_failures`, `last_successful_poll`, `pending_exports` in `getState()`

### Changed

- Regional profiles recalibrated from USGS FDSN catalog (M4.5+ reviewed, 2021–2026) — 20 of 24 field-region pairs updated
- Omori K values refit: subduction (Pass), transform (Pass), intraplate (Marginal/provisional)
- `inferRegime` expanded to cover South America Andes, Indonesia/Philippines, Caribbean, and five stable-craton intraplate regions
- All uncited quantitative parameters annotated with `// source:` or `// TBD: empirical calibration needed`

### Known Gaps

- IRIS integration not yet implemented (v0.2 planned)
- On-chain P&L parameter reserved, not implemented (v0.2 planned)
- Doubt-price CI, settlement discounts, quality weights blocked on automatic-stage data access

## [0.1.0] - 2026-04-05

### Added

- USGS NEIC oracle poller (`src/oracles/usgs.js`) — GeoJSON feed ingestion for
  M4.5+ events with standalone CLI invocation.
- EMSC cross-validation oracle (`src/oracles/emsc.js`) — secondary source for
  magnitude/location triangulation.
- Evidence bundle pipeline (`src/processor/bundles.js`) — raw event → normalized
  evidence bundle with provenance and quality metadata.
- Magnitude uncertainty processor (`src/processor/magnitude.js`) — doubt pricing
  from magType, error, and network density.
- Quality scoring (`src/processor/quality.js`) — RMS residual, azimuthal gap,
  and station count weighting with regional density normalization.
- Regional density profiles (`src/processor/regions.js`) — bias normalization
  for sparse vs. dense seismic networks.
- Three-tier settlement logic (`src/processor/settlement.js`) — oracle,
  provisional_mature, and provisional evidence classes with Brier discounts.
- Theatre lifecycle for five investigation types:
  - Magnitude threshold (binary) — `src/theatres/threshold.js`
  - Aftershock cascade (multi-class, Omori-law) — `src/theatres/aftershock.js`
  - Regional clustering (spatial-statistical) — `src/theatres/clustering.js`
  - Depth profile (structural-binary) — `src/theatres/depth.js`
  - Multi-source divergence (paradox) — `src/theatres/divergence.js`
- RLMF certificate export (`src/rlmf/certificates.js`) — Brier scores, position
  history, calibration bucket assignment, Paradox Engine event counts.
- Seismic skill definition (`src/skills/seismic.md`) — Echelon-compatible skill
  manifest for the construct.

### Known Gaps

- **IRIS DMC integration**: listed as a planned quality reference source but
  not implemented in v0.1. Only USGS and EMSC are wired in.
- **On-chain P&L and gas costs**: RLMF certificate schema reserves fields for
  on-chain settlement but no chain integration exists in v0.1. Values are
  emitted as `null`.
- **Empirical calibration**: Omori-law regime parameters, regional density
  profiles, rupture-length match radius, and related constants are engineering
  heuristics pending empirical refit from historical catalog data. See
  in-source `TBD: empirical calibration needed` markers.

### Planned for v0.2

- IRIS DMC oracle integration as third cross-validation source.
- On-chain P&L and gas cost capture in RLMF certificates.
- Empirical calibration pass for Omori regime parameters and regional
  density profiles.

[0.1.1]: https://github.com/your-org/tremor/releases/tag/v0.1.1
[0.1.0]: https://github.com/your-org/tremor/releases/tag/v0.1.0
