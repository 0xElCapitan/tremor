# Security Audit: Sprint GEOFON Oracle

**Auditor**: Paranoid Cypherpunk Auditor
**Date**: 2026-04-08
**Verdict**: APPROVED - LETS FUCKING GO

---

## Audit Scope

| File | Type | Lines Changed |
|------|------|---------------|
| `src/oracles/geofon.js` | New file | 98 |
| `src/index.js` | Modified | ~35 lines (import, cross-validation block, re-export) |
| `test/geofon.test.js` | New file | 157 |
| `BUTTERFREEZONE.md` | Modified | 3 lines (table row, capability entry, module count) |

---

## Security Checklist

### 1. Secrets & Credentials

| Check | Result | Notes |
|-------|--------|-------|
| Hardcoded API keys | **PASS** | No auth required — GEOFON FDSN is public, unauthenticated |
| Environment variable leaks | **PASS** | No env vars read |
| Credential files | **PASS** | No credential file access |

### 2. Network Security

| Check | Result | Notes |
|-------|--------|-------|
| HTTPS enforcement | **PASS** | Endpoint is `https://geofon.gfz.de/...` — TLS enforced |
| Request timeout | **PASS** | `AbortSignal.timeout(10_000)` at `geofon.js:52` — 10s hard cap, matches EMSC pattern |
| DNS rebinding / SSRF | **PASS** | Endpoint is hardcoded constant `GEOFON_API_BASE` at `geofon.js:15` — no user-controlled URL construction |
| Response size | **ADVISORY** | `response.text()` reads full body into memory. `limit=5` param caps server-side results, but a malicious/misbehaving server could send unbounded data. Risk: LOW — this is a trusted government research endpoint, and the existing EMSC oracle has the same pattern (`response.json()` without size limit) |

### 3. Input Validation

| Check | Result | Notes |
|-------|--------|-------|
| Feature input validation | **PASS** | Destructures `properties` and `geometry.coordinates` — will throw on malformed input (caught by try/catch → `null`) |
| Magnitude NaN guard | **PASS** | `Number.isFinite(geofonMag)` at `geofon.js:72` and `Number.isFinite(usgsMag)` at `geofon.js:77` |
| Integer overflow | **PASS** | All arithmetic is floating-point with bounded inputs (magnitude ≤ ~10, coordinates ≤ 180/90) |
| URL parameter injection | **PASS** | All params constructed via `URLSearchParams` which handles encoding. No string concatenation in URL construction |

### 4. Data Integrity

| Check | Result | Notes |
|-------|--------|-------|
| Response parsing safety | **PASS** | `split('|')` on pipe-delimited text — no eval, no dynamic code execution, no regex DOS risk |
| `parseFloat` safety | **PASS** | Result checked with `Number.isFinite()` — NaN/Infinity rejected |
| Divergence rounding | **PASS** | `Math.round(... * 10000) / 10000` — deterministic, no floating-point accumulation |
| Array index access | **PASS** | `fields[10]` and `fields[9]` — if line has fewer fields, returns `undefined` → `parseFloat(undefined)` → `NaN` → caught by `Number.isFinite` check. `fields[9] || 'unknown'` handles undefined mag type |

### 5. Error Handling & Information Disclosure

| Check | Result | Notes |
|-------|--------|-------|
| Error swallowing | **PASS** | Catch block at `geofon.js:93` logs warning with `err.message` only — no stack traces leaked |
| Graceful degradation | **PASS** | Every failure path returns `null` — never throws to caller |
| Console output | **PASS** | Uses `console.warn` with `[TREMOR:GEOFON]` prefix — consistent with EMSC pattern, no sensitive data in log |

### 6. Concurrency & Resource Management

| Check | Result | Notes |
|-------|--------|-------|
| Parallel oracle calls | **PASS** | `Promise.allSettled` at `index.js:225` — one oracle failure doesn't reject the other. Correct concurrency primitive |
| Memory unbounded growth | **PASS** | No new state arrays or caches introduced. Aggregate result is per-bundle, garbage-collected normally |
| Connection pooling | **N/A** | Uses `fetch` — Node.js manages connection lifecycle |

### 7. Dependency Security

| Check | Result | Notes |
|-------|--------|-------|
| New runtime deps | **PASS** | Zero — `package.json` unchanged |
| Import chain | **PASS** | `src/oracles/geofon.js` imports nothing — pure Node.js built-ins only |

### 8. Test Security

| Check | Result | Notes |
|-------|--------|-------|
| No live network in tests | **PASS** | All 7 tests mock `globalThis.fetch` — verified no real HTTP calls |
| Mock restoration | **PASS** | `afterEach` restores original fetch at `geofon.test.js:39-41` |
| Negative path coverage | **PASS** | Tests cover: malformed response, network error, no data lines, NaN magnitude |

---

## Threat Model Assessment

| Threat | Likelihood | Impact | Mitigation | Verdict |
|--------|-----------|--------|------------|---------|
| GEOFON endpoint compromise (serves malicious data) | Very Low | Low — worst case: incorrect divergence value, no code execution | Magnitude validated with `Number.isFinite`, no `eval` or dynamic execution | **ACCEPTABLE** |
| GEOFON endpoint unavailable | Medium | None — returns `null`, EMSC continues independently | `Promise.allSettled` + timeout + graceful null | **MITIGATED** |
| Response body bomb (huge payload) | Very Low | Medium — memory pressure | `limit=5` server-side, trusted endpoint. Same risk profile as existing EMSC oracle | **ACCEPTABLE** |
| Timing side-channel via cross-validation latency | Very Low | None — seismic data is public | N/A | **NOT APPLICABLE** |

---

## Forbidden File Verification

| Constraint | Result |
|------------|--------|
| `src/processor/bundles.js` untouched | **PASS** |
| `src/theatres/*` untouched | **PASS** |
| `src/rlmf/certificates.js` untouched | **PASS** |
| `inferRegime` return type unchanged | **PASS** (not touched) |
| K, c, p, bath_delta, exponent unchanged | **PASS** (not touched) |

---

## Findings Summary

| Severity | Count | Details |
|----------|-------|---------|
| CRITICAL | 0 | — |
| HIGH | 0 | — |
| MEDIUM | 0 | — |
| LOW | 0 | — |
| ADVISORY | 1 | Response body size unbounded (same as EMSC, trusted endpoint, `limit=5` mitigates server-side) |

---

## Verdict

**APPROVED - LETS FUCKING GO**

Clean implementation. No secrets, no injection surfaces, no code execution from external input, proper timeout, proper NaN guards, proper error handling. The new oracle follows the exact security posture of the existing EMSC oracle — same timeout pattern, same graceful-null pattern, same console-warn-only logging. `Promise.allSettled` is the correct concurrency primitive for independent fallible network calls. Zero new dependencies. 81/81 tests pass.

Ship it.
