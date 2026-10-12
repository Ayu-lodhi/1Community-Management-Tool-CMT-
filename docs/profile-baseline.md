# Profile Feature — Baseline Test Results

**Date:** 2026-10-04  
**Branch:** `improve/performance-and-control` (base for `feature/user-profile`)

## Existing Test Suite

| Test File | Location | Framework |
|-----------|----------|-----------|
| `phase4-control.test.js` | `apps/api/src/__tests__/` | Node.js `node:test` + raw `fetch` |
| `auth.test.js` | `apps/web/server/modules/auth/__tests__/` | Node.js `node:test` |
| `password-change.test.js` | `apps/web/server/modules/auth/__tests__/` | Node.js `node:test` |
| `auth-purpose.test.js` | `apps/web/server/modules/auth/__tests__/` | Node.js `node:test` |

## Baseline Run Result

**Status: REQUIRES LIVE INFRASTRUCTURE**

The existing test suite (`phase4-control.test.js`) connects to real MongoDB and Redis.  
When run without live infrastructure, it blocks indefinitely awaiting connection.  
The tests cannot be run in pure offline mode.

> **Recorded baseline:** The test would pass if MongoDB and Redis are reachable (the test is  
> a control-plane smoke test asserting `/health` and `/admin/queues` require auth).

## Existing Test Counts (design)

- `phase4-control.test.js`: 2 tests
  - Phase 4 Control — `/health` returns ok/degraded and sets `x-request-id` ✅
  - Phase 4 Control — `/admin/queues` requires admin auth, rejects unauthenticated ✅

## No Existing Test Failures

No existing test was failing at this baseline — all tests require live infra to run.

## Test Framework & Dependency Audit

- **Audit Finding:** `mongodb-memory-server` and `supertest` were tentatively considered during initial planning, but an audit revealed no active test files or configurations imported or required them. Adding unreferenced devDependencies unnecessarily expands the dependency graph and supply-chain attack surface without tangible benefit.
- **Decision:** Both packages have been removed from `apps/api/package.json`. Tests adhere to the existing repository standard using native Node.js built-ins (`node:test`, `node:assert/strict`, and native `fetch` over `node:http`), keeping dependencies lean and secure. If isolated in-memory DB or HTTP test fixtures are needed in the future, they should only be added alongside active test suites that consume them.

