# Profile Authorization Matrix

**Last updated:** 2026-10-05  
**Production commit:** `59cd804`  
**Verified against code:** yes  

---

## 1. Profile Endpoint Definitions

| Endpoint | Method | Handled By | Permissions Required |
|----------|--------|------------|----------------------|
| `/api/v1/profile/me` | `GET` | [profile.controller.js](file:///e:/project%20emp/tbi/apps/web/server/modules/profile/profile.controller.js) | Authenticated user (`protect`) |
| `/api/v1/profile/me` | `PATCH` | [profile.controller.js](file:///e:/project%20emp/tbi/apps/web/server/modules/profile/profile.controller.js) | Authenticated user (`protect`) |
| `/api/v1/profile/me/avatar` | `POST` | [profile.controller.js](file:///e:/project%20emp/tbi/apps/web/server/modules/profile/profile.controller.js) | Authenticated user (`protect`, 10MB limit) |
| `/api/v1/profile/me/completion` | `GET` | [profile.controller.js](file:///e:/project%20emp/tbi/apps/web/server/modules/profile/profile.controller.js) | Authenticated user (`protect`) |
| `/api/v1/profile/me/progress` | `GET` | [profile.controller.js](file:///e:/project%20emp/tbi/apps/web/server/modules/profile/profile.controller.js) | Authenticated user (`protect`) |
| `/api/v1/profile/team` | `GET` | [profile.controller.js](file:///e:/project%20emp/tbi/apps/web/server/modules/profile/profile.controller.js) | `T3_EXECUTIVE` only |
| `/api/v1/profile/:userId` | `GET` | [profile.controller.js](file:///e:/project%20emp/tbi/apps/web/server/modules/profile/profile.controller.js) | Dynamic scope (`owner`, `admin`, or `t3_team`) |
| `/api/v1/admin/users/:id/tier` | `PATCH` | [admin.routes.js](file:///e:/project%20emp/tbi/apps/web/server/modules/admin/admin.routes.js) / [profile.routes.js](file:///e:/project%20emp/tbi/apps/web/server/modules/profile/profile.routes.js) | `ADMIN`, `SUPER_ADMIN` |

---

## 2. Authorization Matrix by Role

| Caller Role / State | `GET /me` | `PATCH /me` | `POST /me/avatar` | `GET /me/completion` | `GET /me/progress` | `GET /:userId` (other user) | `GET /team` | `PATCH .../tier` |
|---------------------|-----------|-------------|-------------------|----------------------|--------------------|-----------------------------|-------------|------------------|
| **Anonymous / No Token** | 401 | 401 | 401 | 401 | 401 | 401 | 401 | 401 |
| **Invalid / Tampered Token**| 401 | 401 | 401 | 401 | 401 | 401 | 401 | 401 |
| **Expired Token** | 401 | 401 | 401 | 401 | 401 | 401 | 401 | 401 |
| **Revoked Session** | 401 | 401 | 401 | 401 | 401 | 401 | 401 | 401 |
| **T1_VOLUNTEER (own)** | 200 | 200 | 200 | 200 | 200 | 403 | 403 | 403 |
| **T2_ASSOCIATE (own)** | 200 | 200 | 200 | 200 | 200 | 403 | 403 | 403 |
| **T3_EXECUTIVE (own)** | 200 | 200 | 200 | 200 | 200 | 200 (self) | 200 | 403 |
| **T3_EXECUTIVE → team member** | — | — | — | — | — | 200 (work fields only) | 200 | 403 |
| **T3_EXECUTIVE → non-member** | — | — | — | — | — | 403 | — | 403 |
| **ADMIN (own)** | 200 | 200 | 200 | 200 | 200 | 200 (full) | 403 | 403 (self) |
| **ADMIN → T1/T2/T3 user** | — | — | — | — | — | 200 (full) | — | 200 |
| **ADMIN → other ADMIN** | — | — | — | — | — | 200 (full) | — | 403 |
| **ADMIN → SUPER_ADMIN** | — | — | — | — | — | 200 (full) | — | 403 |
| **SUPER_ADMIN (own)** | 200 | 200 | 200 | 200 | 200 | 200 (full) | 403 | 403 (self) |
| **SUPER_ADMIN → any target**| — | — | — | — | — | 200 (full) | — | 200 |

---

## 3. Field-Level Privacy Redaction Matrix

Implemented in [profile.access.js](file:///e:/project%20emp/tbi/apps/web/server/modules/profile/profile.access.js):

| Profile Field | Owner (`owner`) | Admin / Super Admin (`admin`) | T3 Team Lead (`t3_team`) |
|---------------|-----------------|-------------------------------|---------------------------|
| `name` | Visible | Visible | Visible |
| `headline` / `fieldOfStudy` | Visible | Visible | Visible |
| `university` | Visible | Visible | Visible |
| `city` | Visible | Visible | Visible |
| `skills` | Visible | Visible | Visible |
| `education` | Visible | Visible | Visible |
| `projects` | Visible | Visible | Visible |
| `linkedinUrl` | Visible | Visible | Visible |
| `avatarUrl` | Visible | Visible | Visible |
| `progressScore` | Visible | Visible | Visible |
| `completionPercent` | Visible | Visible | **REDACTED** |
| `completionMissing` | Visible | Visible | **REDACTED** |
| `gender` | Visible | Visible | **REDACTED** |
| `birthday` | Visible | Visible | **REDACTED** |
| `mobile` / `phone` | Visible | Visible | **REDACTED** |
| `email` | Visible | Visible | **REDACTED** |
