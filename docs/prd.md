# PRD.md — TBI Student Engagement & Event Workforce Management System

**Last updated:** 2026-10-05  
**Production commit:** `59cd804`  
**Verified against code:** yes  

---

## 1. Product Overview

A centralized, admin-provisioned web platform that replaces WhatsApp groups, spreadsheets, and email chains for running TBI-GEU's (Technology Business Incubator) event workforce.
Covers the full event lifecycle:
**Event creation → Team assembly → Auto-created chat rooms → Student applications → Approval → QR attendance → Certificate verification → Analytics.**

No public self-signup. All accounts are created by Admin or Super Admin and distributed with temporary credentials.

---

## 2. User Roles & Personas

| Role | Target Persona | Core Capabilities & Boundaries |
|------|----------------|---------------------------------|
| `SUPER_ADMIN` | Platform Director | Full access, user revocation, token audits, administrative actions log |
| `ADMIN` | TBI Manager | Event creation, user provisioning (single + bulk CSV), tier management, platform KPIs |
| `T3_EXECUTIVE` | Senior Team Lead | Review applications, team profile view, QR attendance marking, team chat |
| `T2_ASSOCIATE` | Team Coordinator | Shift coordination, applicant review assistance, team chat participation |
| `T1_VOLUNTEER` | Student / Volunteer | Discover events, apply to shifts, chat, QR check-in, profile completion, certificates |

---

## 3. Current Production Features (Verified in Code)

### 3.1 Authentication & Security
- **Admin-Provisioned Login**: Login with email and password ([apps/web/server/modules/auth/](file:///e:/project%20emp/tbi/apps/web/server/modules/auth/)). Forgot password and self-signup links removed.
- **Forced First-Login Password Change**: `needsPasswordChange` flag forces immediate update on initial login.
- **MFA (TOTP)**: Mandatory for `ADMIN` and `SUPER_ADMIN` via `apps/web/server/modules/auth/mfa.service.js`.
- **Single-Session Enforcement**: `activeSessionId` checked on each request; newer login terminates previous session.
- **Google reCAPTCHA v2**: Bot prevention on login (bypassed if `CAPTCHA_ENABLED` != `true`).

### 3.2 User Profiles & Progression
- **Naukri-Style Profile**: Headline, bio, gender, DOB, mobile, education, skills, projects, LinkedIn ([apps/web/server/modules/profile/](file:///e:/project%20emp/tbi/apps/web/server/modules/profile/)).
- **Completion Ring**: Visual percentage score computed via `profile.completion.js`.
- **Avatar Upload**: Native file picker with client-side canvas compression (10MB limit) via [MyProfilePage.jsx](file:///e:/project%20emp/tbi/apps/web/src/pages/profile/MyProfilePage.jsx).
- **Field-Level Privacy**: Strict scoping based on viewer relationship (Self / Admin / Lead / Peer) via `profile.access.js`.
- **Team Profiles View**: T3 leads view profiles of members in their assigned teams via `/profile/team`.

### 3.3 Events, Teams & Shifts
- **Event Lifecycle**: Draft → Published → Ongoing → Completed → Archived ([apps/web/server/modules/events/](file:///e:/project%20emp/tbi/apps/web/server/modules/events/)).
- **Team Management**: Team assignments, team leads, member rosters ([apps/web/server/modules/teams/](file:///e:/project%20emp/tbi/apps/web/server/modules/teams/)).
- **Shifts**: Shift start/end times and capacity controls ([apps/web/server/modules/shifts/](file:///e:/project%20emp/tbi/apps/web/server/modules/shifts/)).

### 3.4 Applications & Attendance
- **Shift Applications**: Apply, pending status, approve, reject flow ([apps/web/server/modules/applications/](file:///e:/project%20emp/tbi/apps/web/server/modules/applications/)).
- **QR Attendance**: Dynamic QR generation and check-in validation ([apps/web/server/modules/attendance/](file:///e:/project%20emp/tbi/apps/web/server/modules/attendance/)).
- **Timesheets**: Volunteer hours logging and verification ([apps/web/server/modules/timesheets/](file:///e:/project%20emp/tbi/apps/web/server/modules/timesheets/)).

### 3.5 Chat & Notifications
- **Chat Rooms**: Per-team chat rooms with message history and polling fallback ([apps/web/server/modules/chat/](file:///e:/project%20emp/tbi/apps/web/server/modules/chat/)).
- **In-App Notifications**: Unread badges and notification feed ([apps/web/server/modules/notifications/](file:///e:/project%20emp/tbi/apps/web/server/modules/notifications/)).

---

## 4. Planned & In-Progress Features

| Feature | Target Phase | Status | Technical Requirement |
|---------|--------------|--------|----------------------|
| **Vercel Startup Fix** | Immediate | 🔴 Blocking Prod | Resolve circular/undefined require in `apps/web/server/server.js:61` |
| **PDF Certificate Generation** | Phase 5 | 🟡 Stub | Implement real PDFKit vector generator with signed QR code |
| **Public Certificate Verification** | Phase 5 | 🟡 Stub | Standalone public lookup page at `/verify/:hash` |
| **BullMQ Worker Processors** | Phase 6 | 🟡 Stub | Provision persistent worker host (Render/ECS) with Redis |
| **Geofenced Attendance** | Phase 7 / v2 | ⚪ Planned | GPS latitude/longitude verification with browser Geolocation API |
| **Load Testing & Benchmarking** | Phase 7 | ⚪ Planned | k6 stress/spike/soak suites for 10,000 peak concurrent users |

---

## 5. Non-Goals for Current Release

- No public user self-registration.
- No native mobile apps (mobile-responsive web SPA only).
- No payment gateway or paid transactions.
- No blockchain-based certificates.
