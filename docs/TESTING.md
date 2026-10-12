# TESTING.md

**Last updated:** 2026-10-05
**Production commit:** `59cd804`
**Verified against code:** yes

---

## Test Commands

```pwsh
# Unit tests — apps/api (31 tests, zero deps, ~14s)
node --test apps/api/src/__tests__/*.unit.test.js

# Same via npm script
npm test --workspace=tbi-api

# Production build gate (web bundle)
npm run build   # from repo root — alias for vite build in apps/web
```

---

## Latest Test Results (2026-10-06)

```
tests 79 | pass 78 | fail 0 | cancelled 0 | skipped 1 (Phase 5 verify route) | duration ~3.9s
```

### Tests by file (`apps/api/src/__tests__/`)

| File | What it covers |
|------|---------------|
| `qr-attendance.unit.test.js` | QR cryptographic token strength & PII protection, end-to-end authorized flow & duplicate prevention, negative security checks (expired/future/tampered/wrong-team), Fix 1 IDOR on deactivate, Fix 2 IDOR & chat room injection on share-chat, Fix 3 unsafe actionUrl server/client drop, Fix 5 dedicated rate limits (429 on generate & scan), Fix 6 generic error masking for 5xx/untyped errors, Fix 7 structured audit logs with token prefixes, Vercel serverless registration |
| `profile.unit.test.js` | `calculateCompletion`, mass-assignment protection, LinkedIn validator (XSS/SSRF rejection, normalization), future birthday rejection, gender normalization across enum, `fieldOfStudy` casting |
| `profile.access.unit.test.js` | Profile access matrix, viewer sanitization, tier escalation rules |
| `profile.progress.unit.test.js` | Engagement calculation, normalization, tier thresholds |
| `profile.validation.unit.test.js` | Joi schemas, birth date, gender, education casting |
| `phase2-secrets.unit.test.js` | Secret leakage and validation tests |
| `phase3-sessions.unit.test.js` | Session validation, fail-closed handling |
| `phase4-team.unit.test.js` | Team membership checks, regex metacharacter handling |
| `phase5-errors.unit.test.js` | Production error masking |
| `phase6-logs.unit.test.js` | Queue log PII redaction |
| `session-revocation.unit.test.js` | Single session enforcement, logout revocation, socket disconnection |
| `rotate-mfa-key.unit.test.js` | MFA encryption rotation script round-trip, idempotency, dry-run |
| `bulk-import.unit.test.js` | Bulk import client parser, validation rules, intra-file duplicates, role checks, formula rejection |
| `bulk-import-routes.unit.test.js` | Server-level route tests: SUPER_ADMIN escalation rejection, server phone validation, 500-row limit rejection, zero password exposure, export formula escaping in attendance & timesheets |


---

## Test Tooling

- **Runner:** Built-in `node:test` (Node 18+) — zero external test deps
- **Assertions:** `node:assert/strict`
- **HTTP:** `node:http` + native `fetch`
- **No:** jest, mocha, supertest, mongodb-memory-server

**Why no external test deps:** Supply-chain security, portability across Windows/Linux/macOS, CI performance (<100ms unit suite overhead).

---

## Coverage Gaps (not yet tested)

- End-to-end browser flows (no Playwright/Cypress)
- Vercel serverless cold-start behavior
- Socket.io real-time events in integration
- Certificate PDF generation (stub — not implemented)
- Workers/BullMQ (stubs — not implemented)
- Redis-based rate limiting (in-memory only, no cross-instance tests)
- MongoDB index performance

---

## Known Test Issues

- Gender normalization test takes ~11s (uses `mongoose.connect` to test real schema setter behavior with in-memory validation) — this is expected.
- `core/cache/cacheInvalidator.js` emits ESM warning when loaded via `require()` in the CJS server context — does not fail tests but causes a warning line in output.
