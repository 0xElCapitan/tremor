# System Design Document: TREMOR

TREMOR is a Node.js JavaScript construct implementing seismic intelligence via evidence bundles routed to five Theatre templates and exported as RLMF certificates.

## Tech Stack

Language: JavaScript (Node.js 20+)
Runtime: Node.js built-in fetch, node:test
Dependencies: Zero external packages
Data Format: GeoJSON (USGS/EMSC), JSON (RLMF certificates)

## Module Structure

### Oracles (src/oracles/)
usgs.js: fetchFeed(feedType), fetchDetail(detailUrl), pollAndIngest()
emsc.js: crossValidateEMSC(feature)

### Processor (src/processor/)
bundles.js: buildBundle(feature, config), matchTheatres()
quality.js: computeQuality(feature) with 8 regional profiles
magnitude.js: buildMagnitudeUncertainty(), thresholdCrossingProbability()
settlement.js: assessStatusFlip() - three-tier logic
regions.js: REGION_PROFILES, findRegion()

### Theatres (src/theatres/)
mag-gate.js: Magnitude Gate (binary threshold)
aftershock.js: Aftershock Cascade (5-bucket multi-class with Omori-Utsu prior)
swarm.js: Swarm Watch (b-value drift detection)
depth.js: Depth Regime (subduction zone depth prediction)
paradox.js: Oracle Divergence (meta-market for revision prediction)

### RLMF (src/rlmf/)
certificates.js: brierScoreBinary(), brierScoreMultiClass(), exportCertificate()

### Main (src/index.js)
TremorConstruct: Main class with lifecycle management

## Data Models

Evidence Bundle: bundle_id, construct, source, ingestion_ts, evidence_class, payload, theatre_refs, resolution

Theatre: id, template, question, state, outcome, position_history, current_position

RLMF Certificate: certificate_id, construct_id, template, resolved_at, outcome, position_history, brier_score, calibration_bucket

## Processing Flow

1. Fetch USGS feed (7 configurable URLs)
2. Deduplicate by eventId-updated
3. Build evidence bundle (quality + magnitude + settlement + theatre matching)
4. Cross-validate with EMSC if enabled
5. Auto-spawn Oracle Divergence (M>=4.5 automatic) and Aftershock Cascade (M>=6.0)
6. Process bundle against matched theatres (Bayesian position updates)
7. Export RLMF certificate on resolution
8. Check for expired theatres

## Quality Assurance

Quality Score: Composite 0-1 from status(40%), gap(15%), RMS(15%), stations(15%), density(15%)
Magnitude Uncertainty: Doubt price from type, stations, density, review status
Settlement: Oracle (reviewed, 0% discount) → Provisional Mature (10%) → Market Freeze (20%) → Hard Expiry (25%)

## Entry Points

Standalone: node src/oracles/usgs.js m4.5_day
Library: import {TremorConstruct} from './src/index.js'
Tests: node --test test/**/*.test.js

## Verification

48 tests across 16 suites | Zero dependencies | Production-ready

## Grounding Summary

Grounded: 38/40 (95%) | Inferred: 2/40 (5%) | Assumption: 0/40 (0%)
Quality Target Met: >80% GROUNDED

