# TREMOR Sprint — Regional Profile Merge

**Scope**: Apply the DATA-FACTUAL regional profile replacements from Study 4. No other changes.

**Source**: `grimoires/loa/calibration/regional-profiles-findings.md` — authoritative. Verify it exists and read it before touching any code.

**Stop condition**: Values updated, tests pass, summarize what changed. Do not begin any other work.

**Hard constraints**:
- Zero new runtime npm dependencies
- Only `src/processor/regions.js` changes — no other source files
- Do not change any value not explicitly recommended in the findings file
- Preserve all existing comment structure including the `TBD:` labels added in Study 6 — update the TBD references to note that measured replacements have been applied

---

## What to do

1. Read `grimoires/loa/calibration/regional-profiles-findings.md` in full
2. For each recommended replacement, apply it to the corresponding field in `src/processor/regions.js`
3. After applying all replacements, add or update a comment block above the `REGION_PROFILES` constant noting:
   - Values updated from USGS FDSN catalog (M4.5+ reviewed events, 2021–2026)
   - Evidence tag: DATA-FACTUAL
   - Date of calibration
   - Fields that were within ±15% and left unchanged
4. Run `node --test` — must pass 70/70 with no regressions
5. If any test fails because it was asserting a hardcoded old value: update the test to use the new measured value and note it in the summary

---

## Definition of done

- [ ] All 20 recommended replacements applied
- [ ] `TBD:` comment blocks updated to reflect measured calibration
- [ ] 70/70 tests pass
- [ ] Summary lists every changed value with old → new
