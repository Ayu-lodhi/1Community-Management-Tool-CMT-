# memory.md — Project Memory Snapshot

**Last updated:** 2026-10-05  
**Production commit:** `59cd804`  
**Verified against code:** yes  

**Read this first every session.** Fall back to detailed docs only for specifics.

---

## 1. Project Summary

**TBI-GEU Employee Management & Event Workforce Platform** — admin-provisioned web app replacing WhatsApp/spreadsheets for running TBI events.  
Flow: Event creation → Team assembly → Auto chat rooms → Applications → Approval → QR attendance → Certificates → Analytics.  
No public signup. All accounts created by Admin/Super Admin.  
Deployed at Vercel (monorepo: web SPA + api serverless function).

---

## 2. Production Status

| Item | Value |
|------|-------|
| Production URL | `employee-manager-[project].vercel.app` (UNVERIFIED — verify from Vercel dashboard) |
| Production branch | `main` |
| Production commit | `59cd804` — Oct 05 2026 |
| Local branch | `main` |
| **Vercel 503 Crash** | **RESOLVED IN CODE** — root cause identified & fixed in web server controller & serverless wrapper |
| Verification Endpoint | `GET /api/health` — reports DB connected status and any missing required env var names |

### Root Cause of Vercel 503 & Resolution
1. **Real Cause of Startup Crash**: [apps/web/server/modules/notifications/notifications.routes.js](file:///e:/project%20emp/tbi/apps/web/server/modules/notifications/notifications.routes.js) line 10 mounted `controller.markTypeRead` which was missing in `notifications.controller.js`. Express threw `Route.patch() requires a callback function but got a [object Undefined]` on cold start.
2. **503 Masking**: [apps/web/api/index.js](file:///e:/project%20emp/tbi/apps/web/api/index.js) caught `initError` and returned `Service is temporarily unavailable. Please try again shortly.` on every request.
3. **Serverless DB Connection**: Mongoose was connecting unawaited at module load in `server.js`. Converted to lazy cached connection on `global.mongoose` in `api/index.js`.
4. **Action Required on Vercel**: Ensure `MONGODB_URI`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `NODE_ENV=production` are added in Vercel **Settings → Environment Variables** and Atlas allowlist contains `0.0.0.0/0`.

---

## 3. How to Run / Test / Deploy

```pwsh
# Dev — frontend (port 3000, proxies /api to 5000)
npm run dev:web

# Dev — API (port 5000)
npm run dev:api

# Unit tests (78 tests passing, zero external test deps, ~3.9s)
node --test apps/api/src/__tests__/*.unit.test.js

# Production build (web only — Vercel runs this)
npm run build

# Required Vercel env vars (add in Project Settings → Environment Variables)
MONGODB_URI, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, NODE_ENV=production
```

---

## 4. Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite 5, TailwindCSS 3, React Router 6 |
| Styling | Retro-Industrial Console theme ([index.css](file:///e:/project%20emp/tbi/apps/web/src/index.css)) with chassis panels, rivets, LEDs |
| Charts | Recharts 3 |
| Backend (prod) | Node.js/Express serverless — [apps/web/server/](file:///e:/project%20emp/tbi/apps/web/server/) (CommonJS) |
| Backend (dev) | Node.js/Express standalone — [apps/api/](file:///e:/project%20emp/tbi/apps/api/) |
| Database | MongoDB Atlas (via Mongoose with cached connection) |
| Auth | JWT (access + refresh), bcryptjs, TOTP MFA for Admin/Super Admin |
| Deployment | Vercel (monorepo) — web via `@vercel/static-build`, API via `@vercel/node` |

---

## 5. Roles & Access

- **5 roles:** `T1_VOLUNTEER`, `T2_ASSOCIATE`, `T3_EXECUTIVE`, `ADMIN`, `SUPER_ADMIN`
- MFA (TOTP) required for `ADMIN` + `SUPER_ADMIN`
- `tier` field on users (T1/T2/T3) — display/progression metadata only
- Single active session per user (`activeSessionId`) — new login revokes previous session

---

## 6. Key Decisions (condensed — full detail in docs/CHANGELOG-decisions.md)

| Date | Decision |
|------|----------|
| 2026-10-06 | QR & Link Attendance Security Hardening: Fix 1 (IDOR on deactivate), Fix 2 (IDOR & unauthorized chat injection on share-chat), Fix 3 (server/client actionUrl validation), Fix 4a (ADMIN/SUPER_ADMIN added to requireTeam), Fix 5 (dedicated rate limiters: 10/min gen, 30/min scan keyed by userId), Fix 6 (masked 5xx/untyped errors in attendance controller), Fix 7 (structured audit logging with token prefixes, no full tokens) |
| 2026-10-05 | Bulk import hardening: added POST `/api/v1/admin/users/bulk` (25-row Vercel batching, dedicated limiter, no passwords), server-side phone/name/email validation, export-time formula escaping, crypto.randomInt password generation |
| 2026-10-05 | Added `markTypeRead` to web `notifications.controller.js` to fix `Route.patch()` undefined callback |
| 2026-10-05 | Cached lazy MongoDB connection on `global.mongoose` in `apps/web/api/index.js` |
| 2026-10-05 | Added `/api/health` diagnostic endpoint reporting DB status & missing env var names |
| 2026-10-05 | Converted ESM config/cache files in `apps/web/server/core/` to CommonJS |
| 2026-10-05 | Gender enum normalized to lowercase at setter; avatar limit 10MB with canvas compression |
| 2026-10-05 | Route shadowing fixed: `/profile/team` moved before `/profile/:userId` in App.jsx |
| 2026-10-05 | Canonicalized documentation under docs/ and replaced root duplicates with redirect links |
| 2026-10-04 | Vercel monorepo deployment configured; retro-industrial login design applied |
| 2026-10-02–04 | Phase 1 security hardening: 15 CVEs resolved across auth, teams, chat, attendance |

---

## 7. Known Issues / Open Items

- **🟡 Missing Vercel Env Vars**: Must verify `MONGODB_URI`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `NODE_ENV=production` exist in Vercel Production.
- **🟡 MongoDB Atlas IP Whitelist**: Must ensure `0.0.0.0/0` is added to Atlas Network Access for serverless function access.
- **🟡 In-memory rate limiting**: Resets per cold start on serverless.
- **🟡 Socket.io**: Real-time push requires persistent host; falls back to polling on Vercel.
- **🟡 ponytail:** a failed-attempts limiter keyed on email+IP is a later upgrade.

---

## 8. Doc Index

| Topic | File |
|-------|------|
| Full architecture & module map | [docs/architecture.md](file:///e:/project%20emp/tbi/docs/architecture.md) |
| Security fixes status | [docs/SECURITY_FIX_AUDIT.md](file:///e:/project%20emp/tbi/docs/SECURITY_FIX_AUDIT.md) |
| Profile auth matrix & field privacy | [docs/PROFILE_AUTH_MATRIX.md](file:///e:/project%20emp/tbi/docs/PROFILE_AUTH_MATRIX.md) |
| Profile feature audit | [docs/PROFILE_FEATURE_AUDIT.md](file:///e:/project%20emp/tbi/docs/PROFILE_FEATURE_AUDIT.md) |
| Test commands & coverage | [docs/TESTING.md](file:///e:/project%20emp/tbi/docs/TESTING.md) |
| All approved changes with rationale | [docs/CHANGELOG-decisions.md](file:///e:/project%20emp/tbi/docs/CHANGELOG-decisions.md) |
| Performance/efficiency issues | [docs/IMPROVEMENT_AUDIT.md](file:///e:/project%20emp/tbi/docs/IMPROVEMENT_AUDIT.md) |
| Phase status | [docs/phases.md](file:///e:/project%20emp/tbi/docs/phases.md) |
| Design system / UI rules | [docs/designe.md](file:///e:/project%20emp/tbi/docs/designe.md) |
| Coding conventions & guardrails | [docs/rules.md](file:///e:/project%20emp/tbi/docs/rules.md) |
| Product requirements | [docs/prd.md](file:///e:/project%20emp/tbi/docs/prd.md) |
