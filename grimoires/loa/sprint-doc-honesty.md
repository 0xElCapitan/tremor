# TREMOR Sprint — Doc Honesty Fix

**Scope**: Targeted language fixes in `README.md` and `CHANGELOG.md` only. No source changes. No BUTTERFREEZONE changes — that file is an intentional agent-facing interface document and is out of scope.

**Stop condition**: Marketing language removed or softened, contradictions resolved, committed and pushed. Summary lists every line changed.

**Hard constraints**:
- Zero changes to any file in `src/`, `test/`, or `scripts/`
- Zero changes to `BUTTERFREEZONE.md`
- Do not add new claims — only remove or soften existing ones
- Every surviving claim must be backed by a completed sprint or artifact

---

## The problem

The README uses language that contradicts the honest calibration status the same file also contains. Specifically:

- **"production-hardened"** — the repo has provisional Omori parameters, TBD settlement discounts, TBD quality weights, and TBD c/p/bath_delta. "Production-hardened" is not accurate.
- **"production-ready"** — same issue. The calibration status table already says what is and isn't ready. The headline language should match it.
- **"ground truth oracle"** — TREMOR ingests USGS data and applies uncalibrated uncertainty models. It is not a ground truth source.
- **"no disputes"** — this is not a claim the codebase can support. Remove it.
- Any other headline or tagline language that asserts finished or validated status while the calibration table in the same file says otherwise.

The fix is not to remove the calibration table or the TBD labels — those are the honest part. The fix is to remove the marketing language that contradicts them.

---

## Step 1 — Audit README for contradicting claims

Read `README.md` in full. Find every instance of:
- "production-hardened", "production-ready", "production-grade" or similar
- "ground truth", "no disputes", "authoritative", "verified" or similar superlatives applied to TREMOR's outputs
- Any claim that implies the system is fully calibrated or validated when the calibration table says otherwise

List every instance with the line number before changing anything.

---

## Step 2 — Apply targeted replacements

For each instance found, apply the minimum change that removes the contradiction. Guidance:

- **"production-hardened"** → remove or replace with "stable architecture" or "zero-dependency, tested pipeline"
- **"production-ready"** → replace with "stable for development and testing use; calibration in progress" or simply remove the phrase
- **"ground truth oracle"** → replace with "seismic intelligence construct" (already used elsewhere in the repo) or just "oracle"
- **"no disputes"** → remove
- Other superlatives → soften or remove case by case; use the calibration status table as the reference for what can honestly be claimed

Do not rewrite entire sections. Change the minimum number of words needed to remove the contradiction. Preserve all accurate technical description.

---

## Step 3 — Check CHANGELOG.md

Scan `CHANGELOG.md` for the same class of language. The v0.1.1 entry was written in this sprint cycle — it is unlikely to have the problem, but verify. If any "production-hardened" or equivalent language appears there, apply the same treatment.

---

## Step 4 — Check ROADMAP.md

Scan `ROADMAP.md` for the same. If v0.1.1 was labeled with language that overstates its status, correct it. The roadmap should describe what was done accurately, not market it.

---

## Step 5 — Commit and push

```bash
git add README.md CHANGELOG.md ROADMAP.md
git commit -m "docs: remove overstated production claims, align with calibration status"
git push origin $(git rev-parse --abbrev-ref HEAD)
```

Only include files that actually changed.

---

## Definition of done

- [ ] "Production-hardened" removed from README
- [ ] "Production-ready" removed or replaced with accurate language
- [ ] "Ground truth" and "no disputes" or equivalent removed
- [ ] No surviving claim contradicts the calibration status table
- [ ] CHANGELOG and ROADMAP checked and cleaned if needed
- [ ] Zero `src/`, `test/`, `scripts/`, or `BUTTERFREEZONE.md` changes
- [ ] Committed and pushed
- [ ] Summary lists every changed line with old → new
