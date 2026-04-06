# TREMOR Sprint — Repo Wrap-Up

**Scope**: Documentation and changelog updates only. No source code changes. No parameter changes. Files that may change: `ROADMAP.md`, `README.md`, `BUTTERFREEZONE.md`, `CHANGELOG.md`.

**Stop condition**: All four files updated, committed, pushed. Summary of changes written.

**Before editing anything**: verify the current branch name, version string, test count, and suite count from the live repo. Do not trust counts or version numbers in this prompt — they may have drifted. Use live values in all documentation.

**Hard constraints**:
- Zero changes to any file in `src/`
- Zero changes to any file in `test/`
- Zero changes to any file in `scripts/`
- Do not invent claims — every statement must reflect the actual current state of the codebase and calibration artifacts

---

## Context: what is now true about TREMOR

Read the following before writing anything. These are the facts the documentation must reflect.

**Omori regime parameters** (`src/theatres/aftershock.js`):
- Subduction K: backtest-derived, Pass (Run 5, mean rel error 6.9%)
- Transform K: backtest-derived, Pass (Run 5, mean rel error 16.9%)
- Intraplate K: backtest-derived, Marginal, provisional (2 sequences only — human review required before production use)
- Volcanic K: TBD, empirical calibration needed
- Default K: TBD, empirical calibration needed
- c, p, bath_delta: TBD across all regimes
- 0.75 scaling exponent: source Reasenberg & Jones (1989), no evidence of a magnitude-dependence issue in the current Run 5 sample

**Regional profiles** (`src/processor/regions.js`):
- All 8 regions recalibrated from USGS FDSN catalog (M4.5+, 2021–2026)
- 20 of 24 field-region pairs updated to measured medians
- Evidence tag: DATA-FACTUAL

**Blocked calibration studies** (Studies 2, 3, 5):
- Doubt-price CI coverage, settlement discounts, quality weights
- Blocked: USGS FDSN does not preserve automatic-stage records
- ISC also blocked: no temporal ordering metadata on NEIC magnitude entries
- Path forward: real-time collector or direct inquiry to ISC/USGS for internal archives
- Parameters remain TBD, labeled as such in source

**Code fixes applied** (Sprint 1):
- Race condition on concurrent polls (single-flight scheduling)
- NaN propagation in magnitude/bundle pipeline (fail-closed)
- Atomic certificate export writes
- USGS/EMSC schema validation
- Poll failure visibility and retry behavior

**Test suite**: 70 tests, all passing

**Known gaps**:
- IRIS integration: planned v0.2, not yet implemented
- On-chain P&L: planned v0.2, parameter reserved
- Studies 2, 3, 5: blocked on data access
- Intraplate K: provisional, needs more sequences
- Volcanic and default K: uncalibrated

---

## File 1 — `ROADMAP.md`

This file was withheld from the v0.1.0 commit because it was too aspirational. It is now honest enough to publish. Create `ROADMAP.md` if it does not exist. If it already exists, update or replace it only if the existing content is materially less accurate than this prompt — do not unconditionally overwrite content that may have been added since the last session.

**v0.1.1 — Omori Calibration** (current, just completed):
- Backtest harness against 14 historical sequences across 5 tectonic regimes
- K values refit for subduction (Pass) and transform (Pass) from empirical targets
- Intraplate K provisional (Marginal, 2 sequences)
- Regional profiles recalibrated from USGS FDSN catalog
- `inferRegime` expanded: South America, Indonesia/Philippines, Caribbean, intraplate cratons
- Five integrity/resilience issues fixed (race condition, NaN, atomic export, schema validation, poll resilience)

**v0.2.0 — Oracle Expansion** (planned):
- IRIS DMC oracle integration as third cross-validation source
- On-chain P&L and gas cost capture in RLMF certificates
- Real-time automatic-stage data collector (unblocks Studies 2, 3, 5)

**v0.3.0 — Full Empirical Calibration** (planned, depends on v0.2 collector):
- Doubt-price CI coverage validation (Study 2)
- Settlement discount empirical derivation (Study 3)
- Quality composite weight refit (Study 5)
- Intraplate K refit with larger sequence set
- Volcanic K calibration (requires different framing than standard Omori)

Keep the roadmap honest. Do not add items that have no implementation path. Do not remove the "planned, depends on" language from v0.3.

---

## File 2 — `CHANGELOG.md`

Add a `v0.1.1` entry above the existing `v0.1.0` entry. Do not modify the v0.1.0 entry.

**v0.1.1 sections**:

*Fixed* (Sprint 1 code fixes):
- Single-flight poll scheduling prevents duplicate certificate exports on concurrent polls
- Fail-closed NaN handling in magnitude/bundle pipeline
- Atomic certificate export writes (temp file + rename) prevent partial-write corruption
- USGS/EMSC GeoJSON schema validation at oracle layer
- Poll failure visibility: `consecutive_poll_failures`, `last_successful_poll`, `pending_exports` in `getState()`

*Changed* (calibration):
- Regional profiles recalibrated from USGS FDSN catalog (M4.5+ reviewed, 2021–2026) — 20 of 24 field-region pairs updated
- Omori K values refit: subduction (Pass), transform (Pass), intraplate (Marginal/provisional)
- `inferRegime` expanded to cover South America Andes, Indonesia/Philippines, Caribbean, and five stable-craton intraplate regions
- All uncited quantitative parameters annotated with `// source:` or `// TBD: empirical calibration needed`

*Known gaps* (unchanged from v0.1.0, still planned):
- IRIS integration not yet implemented (v0.2 planned)
- On-chain P&L parameter reserved, not implemented (v0.2 planned)
- Doubt-price CI, settlement discounts, quality weights blocked on automatic-stage data access

---

## File 3 — `README.md`

Update the following sections only. Do not rewrite sections that are still accurate.

**Calibration status section** — add or update a section (after Architecture, before Quick Start or wherever it fits cleanly) that states current empirical status:

```
## Calibration Status

| Component | Status | Evidence |
|-----------|--------|----------|
| Regional profiles | Measured from catalog | USGS FDSN catalog, M4.5+, 2021–2026 |
| Omori K (subduction) | Backtest-derived | Run 5, 3 sequences, mean error 6.9% |
| Omori K (transform) | Backtest-derived | Run 5, 2 sequences, mean error 16.9% |
| Omori K (intraplate) | Backtest-derived (provisional) | Run 5, 2 sequences, Marginal — review before production use |
| Omori K (volcanic/default) | Pending calibration | — |
| Omori c, p, bath_delta | Pending calibration | — |
| Doubt-price CI | Blocked by data access | Automatic-stage records not preserved in public API |
| Settlement discounts | Blocked by data access | Same |
| Quality weights | Blocked by data access | Same |
```

**IRIS reference** — confirm it already says "planned v0.2" from the earlier fix. If it still says IRIS is active, correct it.

**Version** — if the README mentions a version number, update it to v0.1.1.

Do not add any claim that is not backed by a completed sprint or artifact.

---

## File 4 — `BUTTERFREEZONE.md`

Update the following only:

**Verification block** — update test count if it changed from the v0.1.0 commit. Current: 70 tests, 22 suites. If unchanged, leave it.

**Calibration section** — add a brief calibration status note consistent with README. One paragraph is enough:

```
Empirical calibration status as of v0.1.1: regional profiles are DATA-FACTUAL (USGS FDSN catalog). 
Omori K is backtest-derived for subduction (Pass) and transform (Pass); intraplate is provisional. 
c, p, bath_delta, and three calibration studies remain TBD pending automatic-stage data access.
```

**IRIS reference** — same check as README. Confirm it says planned v0.2, correct if not.

---

## Commit and push

After all four files are updated:

```bash
git add ROADMAP.md CHANGELOG.md README.md BUTTERFREEZONE.md
git commit -m "docs(v0.1.1): roadmap, changelog, calibration status, inferRegime coverage"
git push origin $(git rev-parse --abbrev-ref HEAD)
```

Confirm push succeeded before reporting done.

---

## Definition of done

- [ ] `ROADMAP.md` published with v0.1.1 (actual) and v0.2/v0.3 (planned, honest)
- [ ] `CHANGELOG.md` has v0.1.1 entry above v0.1.0, nothing in v0.1.0 changed
- [ ] `README.md` has calibration status table, IRIS correctly labeled, version updated
- [ ] `BUTTERFREEZONE.md` has calibration paragraph, IRIS correctly labeled
- [ ] No `src/` files touched
- [ ] Committed and pushed to `origin/main`
- [ ] Summary lists every file changed and the key addition to each
