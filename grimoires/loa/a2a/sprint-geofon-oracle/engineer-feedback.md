# Engineer Feedback: Sprint GEOFON Oracle

**Reviewer**: Senior Tech Lead
**Date**: 2026-04-08
**Verdict**: All good

---

Sprint geofon-oracle has been reviewed and approved. All acceptance criteria met. 81/81 tests pass.

## Previous Feedback Verification (iteration 2)

| # | Issue | Status | Verification |
|---|-------|--------|-------------|
| 1 | EMSC field name `divergence` → `max_divergence` (CRITICAL) | **RESOLVED** | `src/index.js:239` now reads `emsc?.max_divergence` |
| 2 | TODO comment unreachable after `return` | **RESOLVED** | `src/oracles/geofon.js:82` — comment now above `return` |
| 3 | Missing `Number.isFinite(usgsMag)` guard | **RESOLVED** | `src/oracles/geofon.js:77` — guard added, matches EMSC pattern |

All three items verified in code, not just report.

## Adversarial Analysis

### Concerns Identified (non-blocking)

1. **EMSC `matched: false` enters aggregate** — `src/index.js:233`. When EMSC returns no match, it's truthy (`{ matched: false, sources_checked: ['EMSC'], ... }`), so `'EMSC'` appears in aggregate `sources_checked` even with no actual match. Correct behavior (EMSC *was* checked) but could confuse consumers. Document if needed downstream.

2. **HTTP 204 handling path** — `src/oracles/geofon.js:55`. GEOFON returns 204 for empty results. 204 is "ok", so code proceeds to empty text → 0 lines → `null`. Works correctly but incidentally. If GEOFON changes 204 behavior, this path would need revisiting.

3. **EMSC/GEOFON return shape inconsistency** — EMSC uses `max_divergence`, GEOFON uses `divergence`. Normalizing both oracle return shapes is a valid Sprint B candidate to prevent future field-name confusion.

### Assumptions Challenged

- **Assumption**: Sprint plan's prescribed code was correct for EMSC field access.
- **Risk if wrong**: Silently dropped EMSC paradox signals from aggregate (caught in review iteration 1).
- **Resolution**: Fixed. This is a good example of why code review must verify against actual module contracts, not just sprint spec.

### Alternatives Not Considered

- **Alternative**: Have the aggregate read a normalized field from both oracles (e.g., always `.divergence`), and fix EMSC to also return `.divergence`.
- **Tradeoff**: Cleaner aggregate code, but requires changing EMSC's return shape which could break existing consumers.
- **Verdict**: Current approach (read the field each oracle actually returns) is correct for this sprint. Shape normalization is Sprint B scope.

## Documentation Verification: PASS

- BUTTERFREEZONE.md: Updated with GEOFON oracle entry and module count
- Code comments: Adequate (JSDoc, inline rationale, TODO)
- Shape change: Documented in implementation report

## Sprint plan updated with checkmarks.
