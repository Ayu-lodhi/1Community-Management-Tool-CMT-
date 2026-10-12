# CHANGELOG-decisions.md

**Last updated:** 2026-10-05 | **Production commit:** `59cd804` | **Verified against code:** yes

---

### [2026-10-07] Super Admin Permissions Management
- **What:**
  1. `customGrants` array field added to `User` model to store explicit permission overrides for `ADMIN` role.
  2. `requireAdminPermission` middleware added to read `customGrants` dynamically from database without relying on caching.
  3. Replaced existing `restrictTo('ADMIN', 'SUPER_ADMIN')` on `ADMIN` accessible routes with `restrictTo('ADMIN', 'SUPER_ADMIN'), requireAdminPermission(...)` to apply granular permission checks while ignoring T1/T2/T3/SUPER_ADMIN roles.
  4. Added `PATCH /admin/users/:id/permissions` to `apps/web/server` and fixed it in `apps/api/src` to securely accept permission arrays, validating against the defaults for `ADMIN`.
  5. Built `Manage Permissions` modal in `AdminManagementPage` in frontend to list exact default permissions an `ADMIN` gets and allow granular selection.
  6. Blocked `ADMIN`s from creating `ADMIN` accounts—this is now strictly a `SUPER_ADMIN` capability.
- **Where:** `apps/api/src/modules/admin/`, `apps/web/server/modules/admin/`, `apps/api/src/modules/auth/`, `apps/web/server/modules/auth/`, `apps/web/src/pages.jsx`, `apps/api/src/__tests__/admin-permissions.unit.test.js`.
- **Note:** Existing Admins with `customGrants: undefined` keep full default access natively. Only explicit overrides alter permission matrices.

### [2026-10-06] QR & Link Attendance Security Hardening (Fixes 1, 2, 3, 4a, 5, 6, 7)
- **What:**
  1. Fix 1 (IDOR on deactivate): Gated `deactivateLink` so only the session creator, `ADMIN`, or `SUPER_ADMIN` can deactivate an active attendance session (returns 403 otherwise).
  2. Fix 2 (IDOR & chat injection): Enforced authorization check on `shareLinkToTeamChat` verifying caller is team lead, member, or `ADMIN`/`SUPER_ADMIN` BEFORE creating message or modifying room; removed side effect that silently added unauthorized callers to `room.members`.
  3. Fix 3 (Unsafe actionUrl): Added server-side validation in `chat.controller.js` restricting `actionUrl` to relative paths starting with single `/` (and not `//`) or allow-listed app hosts; added client-side `isSafeActionUrl` verification in `pages.jsx` before rendering `<a href>`.
  4. Fix 4a (Admin access to team routes): Extended `requireTeam` middleware to permit `ADMIN` and `SUPER_ADMIN` (additive, no existing legitimate users lose access).
  5. Fix 5 (Dedicated rate limiters): Mounted `attendanceGenerateLimiter` (10/min) on `POST /link/generate` and `attendanceScanLimiter` (30/min keyed by authenticated `sub` ID to avoid blocking shared campus Wi-Fi) on `POST /link/:token/mark`.
  6. Fix 6 (Raw error masking): Standardized `attendance.controller.js` error handling to return `err.message` only for intentional statuses (`400, 403, 404, 409, 410, 425`); unexpected errors and 5xx return generic `'An unexpected error occurred. Please try again shortly.'` and log details without PII.
  7. Fix 7 (Audit logging): Structured audit logging via `recordAttendanceAudit` for session generation, deactivation, chat sharing, and rejected attempts; records short token prefix (`token.slice(0, 8)...`), never the full token or QR image.
- **Where:** `apps/web/server/modules/attendance/`, `apps/api/src/modules/attendance/`, `apps/web/server/modules/auth/auth.middleware.js`, `apps/api/src/modules/auth/auth.middleware.js`, `apps/web/server/modules/chat/chat.controller.js`, `apps/api/src/modules/chat/chat.controller.js`, `apps/web/server/middleware/rateLimit.middleware.js`, `apps/api/src/middleware/rateLimit.middleware.js`, `apps/web/server/middleware/audit.middleware.js`, `apps/api/src/middleware/audit.middleware.js`, `apps/web/src/pages.jsx`.

### [2026-10-05] Canonicalize documentation under docs/ and replace root duplicates with redirect links
- **What:** Designated `docs/` as the single canonical source of truth for all repository documentation (`CHANGELOG-decisions.md`, `TESTING.md`, `architecture.md`, `designe.md`, `memory.md`, `phases.md`, `prd.md`, `rules.md`). Replaced root markdown files with redirect links pointing to `docs/`. Updated cross-document references to point to `docs/`.
- **Reason:** Eliminates document drift and dual-synchronization maintenance overhead where both root and `docs/` copies were previously updated in parallel.
- **Where:** `docs/rules.md`, `docs/memory.md`, `docs/CHANGELOG-decisions.md`, and root redirect stubs (`CHANGELOG-decisions.md`, `TESTING.md`, `architecture.md`, `designe.md`, `memory.md`, `phases.md`, `prd.md`, `rules.md`).

### [2026-10-05] Fix gender enum, avatar limit, broken routes — commit `59cd804`
- **What:** Gender setter normalizes Male/Female/Other to lowercase; avatar limit raised to 10MB; canvas compression on client; avatarUrl excluded from PATCH /me; /profile/team route shadow fixed in App.jsx; GET /teams/my-teams alias added; PATCH /admin/users/:id/tier added to web server admin.routes.js; req.user.id/._id aliases attached; fieldOfStudy added to profile model.
- **Where:** profile.model.js, profile.service.js, profile.controller.js, MyProfilePage.jsx, security.middleware.js, profile.routes.js, App.jsx, teams.routes.js, admin.routes.js, auth.middleware.js

### [2026-10-05] Resolved: Vercel 503 startup crash, lazy cached MongoDB connection, and added /api/health endpoint
- **What:** Added missing `markTypeRead` to `apps/web/server/modules/notifications/notifications.controller.js`; implemented lazy cached MongoDB connection on `global.mongoose` in `apps/web/api/index.js` and gated module-level connection behind `!process.env.VERCEL`; added `/api/health` and `/health` diagnostic endpoint returning connection state and missing env var names; converted ESM files (`env.config.js`, `cacheInvalidator.js`, `redis-*.client.js`) in `apps/web/server/core/` to CommonJS.
- **Root Cause:** Express crashed during `require('../server/server.js')` because `notifications.routes.js:10` mounted `router.patch('/read-type/:type', controller.markTypeRead)` while `controller.markTypeRead` was not exported. `apps/web/api/index.js` caught `initError` and returned a generic 503 message (`Service is temporarily unavailable. Please try again shortly.`) for all routes. In addition, unawaited module-level MongoDB connection in `server.js` was racing on serverless cold starts.
- **Where:** `apps/web/server/modules/notifications/notifications.controller.js`, `apps/web/server/server.js`, `apps/web/api/index.js`, `apps/web/server/core/cache/cacheInvalidator.js`, `apps/web/server/core/config/env.config.js`, `apps/web/server/core/config/redis-*.client.js`


### [2026-10-04] Security hardening Phase 1 merged — commits 77a884e to 97e14a2
- **What:** Enforce validated env secrets; mask production errors; sanitize requireTeam regex; fail closed on session/DB failure; redact email PII in logs.
- **Where:** auth.tokens.js (both server trees), error handler, auth.middleware.js, queue service

### [2026-10-04] Vercel monorepo deployment — commit 197e914
- **What:** Root vercel.json: @vercel/static-build (web) + @vercel/node (API). apps/web/api/index.js is the serverless wrapper for apps/web/server/server.js.
- **Where:** vercel.json, apps/web/vercel.json, apps/web/api/index.js

### [2026-10-04] Login redesign + removed Forgot Password links — commits bfe83b6, 2eda444
- **What:** Retro-industrial TBI-GEU login design; Forgot Password and Already have an Account links removed (admin-only provisioning).
- **Where:** apps/web/src/pages.jsx (LoginPage)

### [2026-10-04] Profile module full implementation — commits 68b0e4a to 82edc97
- **What:** Full profile backend + frontend: model, service, controller, routes, access, completion, progress, LinkedIn validator, avatar upload, MyProfilePage.jsx with completion ring.
- **Where:** apps/api/src/modules/profile/, apps/web/server/modules/profile/, apps/web/src/pages/profile/MyProfilePage.jsx

### [2026-10-04] reCAPTCHA v2 added to login — commit dc9f1ba
- **What:** Google reCAPTCHA v2 on login; bypassed when CAPTCHA_ENABLED != true or secret key absent.
- **Where:** apps/web/src/pages.jsx, apps/web/server/middleware/verifyCaptcha.js

---
# CHANGELOG-decisions.md

Registry of approved changes, per the Change Approval & Logging Protocol in `docs/rules.md`. Entries below this line are backfilled from decisions made earlier in this project’s design discussion, before the protocol itself was added.

---

### [2026-09-17] RBAC model: permission-based, not simple role-string
- **What**: RBAC enforcement uses granular permission codes (role-default grants + per-user `ACCESS_GRANT` overrides), not a flat role-string check.
- **Reason**: Chosen over simple role-based checking to support per-user exceptions (e.g. a T2 granted one T3-level permission without a full promotion) without duplicating role strings across services.
- **Where**: `apps/api/src/core/middleware/rbac.middleware.js`, `apps/api/src/core/config/rbac.config.js`, `packages/shared-constants/permissions.js`, `docs/database/ER-DIAGRAM.md`

### [2026-09-17] Drop redundant tier field from auth logic
- **What**: Single role field (`T1_VOLUNTEER` / `T2_ASSOCIATE` / `T3_EXECUTIVE` / `ADMIN` / `SUPER_ADMIN`) is the only field used in auth decisions; `tiers.js` becomes display-label-only.
- **Reason**: Chosen over keeping tier as an independent field, to remove a redundant encoding that could desync from role.
- **Where**: `packages/shared-constants/tiers.js`, `apps/api/src/modules/users/users.model.js`, `apps/web/src/core/router/RoleRoute.jsx`, `docs/database/migrations/004-remove-tier-from-auth-logic.md`

### [2026-09-17] Geofenced QR attendance deferred to v2
- **What**: Geofence validation removed from MVP scope.
- **Reason**: Chosen over keeping it in scope, given browser geolocation reliability concerns for a web-only (no native app) v1 and no prior PRD/diagram coverage.
- **Where**: `apps/web/src/modules/attendance/components/` (`GeoFenceAlert.jsx` removed), `apps/api/src/modules/attendance/qr.service.js`, `docs/phases.md` (v2 backlog)

### [2026-09-17] MFA required for Admin and Super Admin
- **What**: TOTP-based MFA added as a mandatory step for the two highest-privilege roles.
- **Reason**: Identified as the single highest-severity open security gap (privileged accounts were password-only).
- **Where**: `apps/api/src/modules/auth/mfa.service.js`, `apps/api/src/core/middleware/mfa.middleware.js`, `apps/web/src/modules/auth/pages/MFASetup.jsx`, `docs/security/mfa-policy.md`

### [2026-09-17] Explicit cache invalidation on write
- **What**: Every mutating service call explicitly deletes the relevant Redis cache key, rather than relying on TTL alone.
- **Reason**: Closes a stale-read window (up to 1hr) discovered in the shift-approval flow.
- **Where**: `apps/api/src/core/cache/cacheInvalidator.js`, called from `shifts.service.js`, `applications.service.js`

### [2026-09-17] Shared session-termination path for Deactivate and Revoke
- **What**: Both the Admin’s “Deactivate” action and the Super Admin’s “Revoke” action call one shared utility to kill active sessions/tokens.
- **Reason**: Avoids divergent behavior between the two actions on whether sessions are actually invalidated.
- **Where**: `apps/api/src/core/session/sessionTerminator.js`, `apps/api/src/modules/admin/admin.service.js`, `apps/api/src/modules/super-admin/revocation.service.js`

### [2026-09-17] Redis split into three logically isolated concerns
- **What**: `cache+sessions`, `pub/sub` (chat), and `BullMQ queue` each get their own Redis client/config, rather than sharing one general-purpose connection.
- **Reason**: Avoids noisy-neighbor contention between chat message bursts and ordinary API session checks during peak event load.
- **Where**: `apps/api/src/core/config/redis-cache.client.js`, `redis-pubsub.client.js`, `redis-queue.client.js`, `infrastructure/terraform/modules/elasticache/`

### [2026-09-17] MongoDB Atlas brought under Terraform, sharding added
- **What**: MongoDB Atlas provisioning (previously manual/unmanaged) is now IaC, with a sharding module for write-scaling.
- **Reason**: Addresses the identified write-scaling gap for event-day check-in bursts (read replicas alone don’t help write throughput).
- **Where**: `infrastructure/terraform/modules/mongodb-atlas/`, `docs/architecture/15-mongodb-sharding-strategy.md`

### [2026-09-17] Scheduled pre-warm autoscaling added
- **What**: A scheduled scaling policy bumps ECS desired task count ahead of known event start times, in addition to reactive CPU-target autoscaling.
- **Reason**: Reactive autoscaling alone can lag a known, scheduled traffic spike (mass QR check-in at event start).
- **Where**: `infrastructure/terraform/modules/autoscaling/scheduled-scaling.tf`, `apps/workers/src/jobs/definitions/preScaleForEvent.job.js`

### [2026-09-17] Full directory tree embedded directly in architecture.md
- **What**: Section 3 (“Folder & File Structure”) now contains the complete, fully-annotated directory tree inline, instead of a condensed top-level view with a pointer to a separate file.
- **Reason**: Chosen over keeping it as an external-file pointer, per explicit clarification that the full structure should live inside `architecture.md` itself.
- **Where**: `docs/architecture.md` (Section 3)

### [2026-09-17] memory.md added as the agent read-first project snapshot
- **What**: New self-contained `memory.md` created (project summary, current phase, finalized role/architecture facts, out-of-scope list, condensed decision log, open gaps); `rules.md` updated with a Memory Protocol (Section 0) requiring agents to read `memory.md` first and keep it in sync with `CHANGELOG-decisions.md`.
- **Reason**: Avoids the coding agent re-reading the full project repeatedly; full self-contained snapshot chosen over a lean pointer-only file.
- **Where**: `docs/memory.md` (new), `docs/rules.md` (Section 0)

### [2026-09-17] Explicit session-start rule added; all docs converted to .docx
- **What**: `rules.md` Section 0 now states an explicit session-start rule — Antigravity must read `memory.md` first at the start of every session/task, before repo or other docs. All 7 markdown docs (`prd`, `architecture`, `rules`, `phases`, `designe`, `memory`, `CHANGELOG-decisions`) converted to `.docx` via pandoc for distribution.
- **Reason**: Makes the “read `memory.md` first” behavior an unambiguous trigger tied to session start, not just a general principle; `.docx` requested for sharing outside the repo.
- **Where**: `docs/rules.md` (Section 0), all `docs/*.docx`

### [2026-09-30] Attendance upsert error handling & stale index fallback
- **What**: Wrapped attendance upsert in try/catch with fallback to plain update on E11000 duplicate key error.
- **Reason**: Gracefully recovers from race conditions or duplicate key collisions from stale indexes during attendance marking without failing the operation.
- **Where**: `apps/api/src/modules/attendance/attendance.service.js`


### [2026-10-01] Enforce MFA in the mounted authentication flow
- What: Privileged login now requires a restricted password challenge and verified TOTP before issuing access; HTTP and Socket.io share access-purpose and MFA enforcement.
- Reason: Confirmed password-only and refresh-token access to administrative operations. Trusted operator enrollment prevents password possession from also enrolling an attacker-controlled factor; the security-fix request authorizes this change.
- Where: `apps/api/src/modules/auth/`, `apps/api/src/modules/admin/admin.model.js`, `apps/api/src/config/socket.js`, `apps/api/scripts/enroll-mfa.js`, `apps/web/src/pages.jsx`, `docs/security/mfa-policy.md`, `docs/database/mfa.md`, `packages/shared-types/index.js`, `.env.example`, API dependency manifests.

### [2026-10-01] Enforce JWT purpose at resource authentication
- What: Login signs access/refresh purpose claims; HTTP protect and socket handshakes require access purpose, with regression tests.
- Reason: Confirmed that a login-issued seven-day refresh token could authenticate as an access token. Enforce signed purpose using the existing key configuration; no refresh endpoint currently exists. Existing tokens without purpose require a new login. Fix authorized by the security investigation request; authentication changes require human review before merge.
- Where: `apps/api/src/modules/auth/auth.service.js`, `apps/api/src/modules/auth/auth.middleware.js`, `apps/api/src/modules/auth/__tests__/auth.test.js`, `apps/api/src/config/socket.js`, `apps/api/src/config/__tests__/socket.test.js`

### [2026-10-01] Reconcile token-purpose and MFA fixes
- What: Resolved overlap with main while retaining MFA enforcement, access-only HTTP/socket authentication, and both regression suites.
- Reason: PR #4 and PR #5 independently changed the same authentication paths. Shared MFA token validation already enforces the token-purpose requirement.
- Where: Auth service/middleware/tests, Socket.io authentication/tests, this changelog, and memory.md.
### [2026-10-01] Preserve application listing team authorization
- What: Validate scalar listing filters, retain the lead's team scope as a separate query condition, and persist required application team ownership with regression coverage.
- Reason: Confirmed that request filters replaced the authorization predicate and the schema discarded ownership. The security-fix request authorizes this change. Legacy records stay outside T3 listings until ownership is restored from trusted evidence; event-based inference is unsafe. Authorization changes require human review before merge.
- Where: `apps/api/src/modules/applications/applications.service.js`, `apps/api/src/modules/applications/applications.model.js`, `apps/api/src/modules/applications/__tests__/applications.test.js`, `packages/shared-types/index.js`, `docs/database/applications.md`, `memory.md`.

### [2026-10-01] Enforce membership for manual attendance
- What: Require the selected student to be a current team member or lead before the attendance upsert or duplicate-key fallback; add HTTP regression coverage.
- Reason: Confirmed that a lead could write attendance for unrelated users, affecting personal history and statistics. Existing self check-in establishes member/lead eligibility; administrators have no membership exception. Fix authorized by the security investigation request; authorization changes require human review before merge.
- Where: `apps/api/src/modules/attendance/attendance.service.js`, `apps/api/src/modules/attendance/__tests__/attendance.test.js`, `memory.md`.
### [2026-10-01] Enforce mandatory password replacement
- What: Consume temporary login atomically; issue only bounded password-change credentials until replacement; enforce the state on HTTP and Socket.io authentication and route the UI into replacement.
- Reason: Confirmed security investigation authorized this fix. Existing MFA/purpose controls did not enforce mandatory replacement or one-time temporary login. Authentication changes require human review before merge.
- Where: apps/api/src/modules/auth/, apps/api/src/modules/admin/admin.model.js and admin.service.js, apps/api/src/config/__tests__/socket.test.js, apps/web/src/pages.jsx and lib/api.js, packages/shared-types/index.js, docs/database/password-replacement.md, docs/security/mfa-policy.md.

### [2026-10-01] Scope team membership mutations to their manager
- What: Pass the authenticated requester into membership services, require team leadership or administrative authority, and validate membership and protected team/event roles before cascade writes.
- Reason: Confirmed unrelated T3 callers could mutate teams, user assignments and event rosters. The security investigation authorizes this fix; human review is required before merge. Preserve the mounted role gate and shared role constants without introducing a broader RBAC migration.
- Where: apps/api/src/modules/teams/teams.controller.js, teams.service.js, __tests__/teams.test.js; memory.md.
### [2026-10-01] Restrict event updates to literal editable fields
- What: Validate event PATCH data against an explicit field/type allowlist at the repository boundary; the active base repository rejects pipeline/operator input and constructs `$set` updates. Add HTTP and repository regression coverage.
- Reason: Confirmed an authenticated administrator could pass a `$function` pipeline through Mongoose validation to database IO. The security investigation authorizes this fix. Preserve the editor fields (including clearing an unselected head) and lifecycle status; membership, derived counters and audit fields are not generic edits.
- Where: `apps/api/src/core/BaseRepository.js`, `apps/api/src/modules/events/events.repository.js`, `events.validator.js`, `__tests__/events.test.js`, `memory.md`. The common-JS base repository currently has only the event repository as a consumer; the separate scaffold in `core/database/` is unaffected.

### [2026-10-02] Limit new passwords to bcrypt's byte boundary
- What: Reject new passwords exceeding 72 UTF-8 bytes before composition checks and hashing in self-service replacement and administrative setting, including deployed server copies; add byte-boundary regression tests.
- Reason: Installed bcryptjs 2.4.3 accepts the 72-byte prefix when required character classes occur only in the discarded suffix. Existing authentication controls do not mitigate this policy bypass. The security investigation authorizes this fix; auth changes require human review before merge.
- Where: `apps/api/src/modules/{auth,admin}/*.service.js`, `apps/web/server/modules/{auth,admin}/*.service.js`, auth `__tests__/password-bytes.test.js` in both server trees, `memory.md`.

### [2026-10-02] Restrict notification read updates to the recipient
- What: Match both notification ID and authenticated recipient in the atomic read-state update; return the same 404 for foreign and missing notifications in API and deployed web server copies. Add HTTP regression coverage.
- Reason: Confirmed authenticated callers could mark another recipient's notification read by ID. Existing authentication and scoped list/bulk updates did not protect the individual update. The security investigation authorizes this fix; authorization changes require human review before merge.
- Where: `apps/api/src/modules/notifications/notifications.controller.js`, `apps/web/server/modules/notifications/notifications.controller.js`, corresponding `__tests__/notifications.test.js`, `memory.md`.

### [2026-10-02] Prevent simulated delivery log injection
- What: Keep only fixed email/SMS queue status messages in both notification service copies; add announcement-flow regression coverage for forged lines, control characters, preserved content and delivery preferences.
- Reason: Confirmed authorized team announcements could inject process-log records through title/message text. The security investigation authorizes the fix. Removing unnecessary recipient/content fields also avoids exposing personal data. The active services have no Winston dependency or implemented shared logger, so this bounded fix retains their existing console sink.
- Where: `apps/api/src/modules/notifications/notifications.service.js`, `apps/web/server/modules/notifications/notifications.service.js`, corresponding `__tests__/delivery.test.js`, `memory.md`.

### [2026-10-02] Bind team timesheet listing to the authorized team
- What: Validate a scalar ObjectId before team lookup and use the authorized team's persisted ID for timesheet reads in both server copies; add HTTP/service regression tests.
- Reason: Confirmed Express bracket selectors and Mongoose operator casting allowed a lead to select foreign-team timesheets after authorization against one led team. The security investigation authorizes this scoped fix; human review is required before merge.
- Where: `apps/api/src/modules/timesheets/timesheets.service.js`, `apps/web/server/modules/timesheets/timesheets.service.js`, corresponding `__tests__/timesheets.test.js`, `memory.md`.

### [2026-10-02] Escape profile names in credential email HTML
- What: Encode profile names in password-reset and welcome HTML in both server copies, with regression coverage.
- Reason: The security investigation confirmed ADMIN-editable names could inject markup into later credential emails. Encode at the HTML sink to preserve stored names and plain-text output; fix authorized by the investigation request.
- Where: `apps/api/src/services/email.service.js`, `apps/web/server/services/email.service.js`, corresponding `__tests__/email.test.js`, `memory.md`.

### [2026-10-02] Bound bulk-import email validation
- What: Reject email fields over 254 characters before matching and use separator-exclusive regex components; add CSV parser regression tests.
- Reason: The security investigation authorized a scoped fix. A 60 KB field with repeated at signs exceeded a one-second execution deadline before preview; server controls run only after parsing.
- Where: `apps/web/src/pages.jsx`, `apps/web/src/__tests__/bulk-import.test.js`, `memory.md`.

### [2026-10-02] Enforce authoritative team chat access
- What: Reject team bindings on generic room creation in both server copies; check current team/account records for team-room reads, socket delivery and management. Team initialization replaces legacy ownership and membership with the authorized requester and current roster; manual additions require team eligibility.
- Reason: Confirmed an unrelated executive could pre-create a tagged room that initialization adopted, retaining message access and deletion authority. The security investigation authorizes this fix; human review is required before merge. Per-operation checks also protect previously poisoned rooms and application-approval auto-joins without a data migration. Uniqueness is not used as an authorization control: every tagged room is checked against its stored team.
- Where: `apps/api/src/modules/chat/chat.service.js`, `apps/web/server/modules/chat/chat.service.js`, corresponding `__tests__/chat.test.js`, `memory.md`.

### [2026-10-01] Require TLS for SMTP delivery
- **What**: Require STARTTLS for configured and Ethereal SMTP transports, retaining default certificate verification and failing delivery if TLS cannot be established.
- **Reason**: Security investigation confirmed plaintext SMTP authentication when STARTTLS was omitted; temporary account passwords use the same transport. Fix authorized by the investigation request.
- **Where**: `apps/api/src/services/email.service.js`, `apps/api/src/services/__tests__/email.test.js`, `memory.md`

### [2026-10-01] Restrict team discovery contact data
- What: General team listing/detail responses expose an explicit metadata allowlist to outsiders; only current members, leads, and administrators receive populated rosters. Added HTTP regression tests.
- Reason: Confirmed that authentication alone exposed member contacts and cached lead names. Preserve student team discovery and administrative roster views using the mounted application's existing member/lead and administrative authority. Fix authorized by the security investigation request; authorization changes require human review before merge.
- Where: `apps/api/src/modules/teams/teams.service.js`, `teams.controller.js`, `teams.permissions.js`, `teams.routes.js`, `__tests__/teams.test.js`, and `memory.md`.

### [2026-10-01] Enforce team attendance read access
- **What**: Roster, statistics, history and CSV reads now authorize the authenticated requester before reading attendance or populating member details; team IDs must be scalar ObjectId strings.
- **Reason**: Confirmed unrelated-team disclosure. Preserve the existing `/teams/me` lead/member policy for T3 and global administrative access. Fix authorized by the security investigation request; authorization changes require human review before merge.
- **Where**: `apps/api/src/modules/attendance/attendance.service.js`, `attendance.permissions.js`, `attendance.controller.js`, and `__tests__/attendance.test.js`.

### [2026-10-01] Bound team attendance history generation
- What: Validate raw history intervals in the service as integers from 1 to 30 before querying or generating rows; retain the seven-day default and add service/HTTP regressions.
- Reason: Confirmed that authorized callers could request unbounded synchronous work. A 30-day cap matches the attendance module's longer reporting defaults and preserves the UI's seven-day request. Fix authorized by the security investigation request.
- Where: `apps/api/src/modules/attendance/attendance.controller.js`, `apps/api/src/modules/attendance/attendance.service.js`, `apps/api/src/modules/attendance/__tests__/attendance.test.js`, `memory.md`.

### [2026-10-05] Bulk Import Users Security Hardening (Fixes C, D, E, F, G)
- **What**:
  - **C**: Added `POST /api/v1/admin/users/bulk` with dedicated `bulkImportLimiter` (10 requests per 5 minutes per user/IP), max 500 rows, 2MB body limit, per-row execution report without passwords. Frontend `BulkImportPage` chunks imports into batches of 25 rows to guarantee execution within Vercel's 10-second serverless execution window.
  - **E**: Server-side Joi validation added for phone (regex `^[0-9 +\-().]*$`, max 20 chars, optional/empty allowed), email (max 254 chars), name (max 100 chars), with mass-assignment protection (`allowUnknown: false`).
  - **F**: Formula injection defense relocated from import mutation to export-time escaping. Removed client-side apostrophe prefixing (`neutralize()`); no altered data stored in database. Added `csvCell()` with RFC 4180 double-quoting and apostrophe escaping for `=, +, -, @, \t` in `attendance.service.js` and `timesheets.service.js` in both `apps/api/src` and `apps/web/server`.
  - **D**: Enforced 2MB file limit client-side, restricted file input to `.csv,.txt` (removed `.xlsx,.xls`), and integrated RFC 4180 quoted-field parser handling commas inside quotes.
  - **G**: Switched default password generation to `crypto.randomInt`, redacted recipient emails in `EMAIL_SENT` logs, sanitized raw `error.message` disclosure in `addUser`, and replaced `window._lastImportResult` with React component state.
- **Reason**: Closes CVE vulnerabilities regarding rate-limiting circumvention, CSV injection, information disclosure, and unvalidated server input without changing existing routes or normal UI behavior.
- **Where**: `apps/api/src/modules/admin/`, `apps/web/server/modules/admin/`, `apps/web/src/pages.jsx`, `apps/api/src/middleware/`, `apps/web/server/middleware/`, `apps/api/src/modules/attendance/`, `apps/api/src/modules/timesheets/`, `apps/web/server/modules/attendance/`, `apps/web/server/modules/timesheets/`.

### [2026-10-01] Enforce socket session revocation and expiry
- What: Disconnect the mounted API's user sockets after successful revocation and at access-token expiry; reapply shared account/credential/MFA authentication before subscriptions and broadcasts, including private notifications.
- Reason: Investigation confirmed existing handshake and chat account checks, but retained sockets could receive notifications after revocation and messages after token expiry. User authorized the scoped security fix.
- Where: `apps/api/src/config/socket.js`, its `__tests__/`, `modules/admin/admin.service.js`, `modules/notifications/notifications.service.js`, and `modules/chat/chat.controller.js` under `apps/api/src/`.
- Review: Authentication changes require human review before merge. The mounted CommonJS API uses the in-memory Socket.IO adapter; the Redis-based `core/session/sessionTerminator.js` is an unmounted scaffold with unavailable imports. Revocation disconnects local sockets, and every protected delivery rechecks persisted account state.

