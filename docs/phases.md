# PHASES.md — Delivery Plan

**Last updated:** 2026-10-05
**Production commit:** `59cd804`
**Verified against code:** yes

**Principle**: Build structure first. Every module keeps its full standard shape:
`routes / controller / service / repository / model / validator / permissions / __tests__`
from Phase 0 onward — later phases are fill-ins, not refactors.

---

## Phase 0 — Foundation & Scaffolding ✅ DONE (2026-09-17)

- Monorepo setup (npm workspaces), `packages/` shared libraries
- `core/` framework: config, middleware pipeline, health checks, base classes
- Docker Compose local dev (`API` + `web` + `Mongo` + `Redis`)
- CI skeleton (lint, test, build)
- Empty module scaffolds for every planned feature

---

## Phase 1 — Auth, RBAC & Admin Provisioning ✅ DONE (2026-10-04)

- JWT auth (access + refresh tokens, purpose enforcement)
- MFA (TOTP) for ADMIN + SUPER_ADMIN (mandatory)
- Single-session enforcement (`activeSessionId`)
- Admin-provisioned account creation (single + bulk CSV import)
- Forced first-login password change (mandatory replacement)
- Deactivate / Revoke with shared session termination
- Audit logging on admin actions
- **Security hardening** (Phase 1 security audit — 15 CVEs fixed, all committed in `fix/security-hardening` branch, merged to `main`)
- Google reCAPTCHA v2 on login form
- Unit tests: 31/31 passing

---

## Phase 2 — Events, Teams & Chat Foundation ✅ DONE (live in codebase)

- Event CRUD with role-based access
- Team management, member assignments
- Socket.io chat (auth, messaging, per-connection rate limiting)
- Chat room archiving on event close
- **Note:** Socket.io real-time not functional in Vercel serverless; requires persistent server for chat

---

## Phase 3 — Applications & Shifts ✅ DONE (live in codebase)

- Apply / review / approve-reject flow
- Shift definitions with capacity limits
- Approval → auto-add to chat room via listener

---

## Phase 4 — Attendance ✅ DONE (live in codebase)

- QR code check-in flow
- Admin + team lead attendance marking
- Attendance history (bounded 1–30 days)
- No geofencing (deferred to v2)

---

## Phase 5 — Certificates & Reviews ✅ DONE (partially — stubs)

- Certificate model + routes: ✅
- PDF certificate generation: **STUB** — not implemented
- Review model + routes: ✅
- Public QR verify page: UNVERIFIED

---

## Phase 6 — Notifications & Analytics ✅ DONE (partially)

- Unified notification service (in-app + simulated email/SMS): ✅
- BullMQ workers: **STUBS** — `notification.worker.js` and `certificate.worker.js` are `console.log` only
- Admin/Super Admin dashboards with live stats: ✅
- Preference management: ✅

---

## Phase 6.5 — User Profile Module ✅ DONE (2026-10-04, commit 68b0e4a → 59cd804)

- Profile model (headline, university, city, gender, birthday, bio, mobile, skills, education, projects, linkedinUrl, avatarUrl)
- Completion ring (progress percentage)
- Team view for T3 executives
- Admin tier management
- Avatar upload (canvas-compressed, 10MB limit)
- Field-level privacy by role scope

---

## Phase 7 — Hardening & Scale Validation 🔴 PENDING

- k6 load tests (baseline, spike, stress, soak, event-day scenario)
- MongoDB sharding strategy
- Redis workload isolation validation
- Scheduled pre-warm autoscaling
- Full security audit / pen-test
- Disaster recovery with RPO/RTO targets

---

## Vercel Deployment 🟡 IN PROGRESS (2026-10-01 → present)

- Monorepo deployed to Vercel: ✅
- TBI-GEU branding on login + dashboard: ✅
- Login page redesign: ✅
- **503 on all API calls** — `Route.patch()` startup crash: 🔴 UNFIXED
- Missing Vercel env vars (`MONGODB_URI`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`): 🟡 NEEDS ACTION

---

## v2 Backlog (Explicitly Out of Phase 0–7)

- Geofenced QR attendance
- Blockchain certificate verification
- Native mobile apps
- Payment gateway
- Multi-tenant support
- AI-based recommendations
