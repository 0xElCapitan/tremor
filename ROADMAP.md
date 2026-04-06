# TREMOR Roadmap

This roadmap captures the planned evolution of TREMOR beyond v0.1.0. Items
are grouped by target release. Scope may shift; constraints (zero runtime
dependencies, full test coverage, no silent corruption) will not.

## v0.1.1 — Omori Calibration (current, completed)

- Backtest harness against 14 historical sequences across 5 tectonic regimes
- K values refit for subduction (Pass) and transform (Pass) from empirical targets
- Intraplate K provisional (Marginal, 2 sequences — human review required before production use)
- Regional profiles recalibrated from USGS FDSN catalog (M4.5+, 2021–2026)
- `inferRegime` expanded: South America, Indonesia/Philippines, Caribbean, intraplate cratons
- Five integrity/resilience issues fixed (race condition, NaN, atomic export, schema validation, poll resilience)

## v0.2.0 — Oracle Expansion (planned)

- **IRIS DMC oracle integration.** Add `src/oracles/iris.js` as a third
  cross-validation source alongside USGS and EMSC.
- **On-chain P&L and gas cost capture.** Wire the RLMF certificate schema to
  real on-chain settlement. Populate the currently-`null` `on_chain_pnl` and
  `gas_cost` fields.
- **Real-time automatic-stage data collector.** Unblocks Studies 2, 3, 5
  (doubt-price CI, settlement discounts, quality weights) which are currently
  blocked because USGS FDSN does not preserve automatic-stage records.

## v0.3.0 — Full Empirical Calibration (planned, depends on v0.2 collector)

- Doubt-price CI coverage validation (Study 2)
- Settlement discount empirical derivation (Study 3)
- Quality composite weight refit (Study 5)
- Intraplate K refit with larger sequence set
- Volcanic K calibration (requires different framing than standard Omori)

## Beyond v0.3

Ideas under consideration, not yet committed:

- Additional Theatre templates (volumetric strain, triggered swarms).
- Construct-to-construct handoffs with other Echelon skills.

These are tracked separately as GitHub issues labeled `proposal` and require
the process in `CONTRIBUTING.md` before they move onto the roadmap proper.
