# TREMOR Roadmap

This roadmap captures the planned evolution of TREMOR beyond v0.1.0. Items
are grouped by target release. Scope may shift; constraints (zero runtime
dependencies, full test coverage, no silent corruption) will not.

## v0.2

Theme: **oracle completeness and settlement realism.**

- **IRIS DMC oracle integration.** Add `src/oracles/iris.js` as a third
  cross-validation source alongside USGS and EMSC. Update the seismic skill
  manifest, evidence bundle provenance, and Paradox Engine divergence logic
  to treat IRIS as a first-class source.
- **On-chain P&L and gas cost capture.** Wire the RLMF certificate schema to
  real on-chain settlement. Populate the currently-`null` `on_chain_pnl` and
  `gas_cost` fields and add assertions that they are non-null when a
  settlement txhash is present.
- **Empirical calibration pass.** Replace engineering heuristics marked
  `TBD: empirical calibration needed` with values refit from historical
  catalog data. Scope for v0.2:
  - Omori-Utsu regime parameters (`src/theatres/aftershock.js`
    `REGIME_PARAMS`).
  - Regional density profiles (`src/processor/regions.js`
    `REGION_PROFILES`, `DENSITY_NORM`).
  - Rupture-length match radius multiplier.

## v0.3

Theme: **feedback loops from real runs.**

- **Omori backtest merged into the main pipeline.** Promote the backtest
  harness from a one-off script to a committed verification layer that runs
  against a frozen historical window on every release.
- **Quality weight refit.** Using accumulated RLMF certificates, refit the
  magnitude/quality weighting coefficients so that calibration bucket drift
  shrinks toward zero on out-of-sample events.

## Beyond v0.3

Ideas under consideration, not yet committed:

- Additional Theatre templates (volumetric strain, triggered swarms).
- Construct-to-construct handoffs with other Echelon skills.

These are tracked separately as GitHub issues labeled `proposal` and require
the process in `CONTRIBUTING.md` before they move onto the roadmap proper.
