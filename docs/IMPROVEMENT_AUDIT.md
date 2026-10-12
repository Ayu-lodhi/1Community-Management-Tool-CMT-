# TBI Platform — Performance, Efficiency & Control Audit

**Last updated:** 2026-10-05  
**Production commit:** `59cd804`  
**Verified against code:** yes  

---

## 1. Executive Summary

This audit tracks operational performance, resource efficiency, and reliability gaps across `apps/api`, `apps/web`, and `apps/workers`. Completed security items have been closed. Active findings are prioritized below.

---

## 2. Completed Improvements (Verified in Git)

| Area | Resolution | Commit / Verification |
|------|------------|-----------------------|
| **Env Validation & Secret Enforcement** | Fallbacks removed; `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `MONGODB_URI` enforced | `77a884e` |
| **Error Leakage Masking** | Masked production 500 error stack traces and details | `8b920b2` |
| **TeamName Injection** | Regex sanitization added to `requireTeam` middleware | `894a6fe` |
| **Queue Service Email PII** | Redacted email addresses in logger payloads | `97e14a2` |
| **Single-Session Fail Closed** | DB failure during session check immediately rejects with 401 | `fa7e1fb` |
| **Mobile & Dashboard Responsiveness** | Tables, forms, and navigation upgraded for mobile viewports | `7c020aa` |
| **401 Redirect Loop Debounce** | Fixed browser freezing on repeated unauthenticated API calls | `8c8e0d6` |
| **Gender Enum & Avatar Compression** | Case-insensitive gender validation, client canvas downscaling | `59cd804` |
| **Route Shadowing** | Fixed `/profile/team` shadowed by `/profile/:userId` | `59cd804` |
| **Vercel 503 Startup Crash** | Added missing `markTypeRead` to `notifications.controller.js`, lazy cached DB connection | Verified in code |

---

## 3. Active Open Findings & Technical Debt


### 🟡 High Priority
- **Missing Vercel Production Environment Variables**:
  - `MONGODB_URI`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, and `NODE_ENV=production` must be set in Vercel Project Settings.
- **Dual Backend Divergence**:
  - `apps/api/` (standalone Node dev/test) vs `apps/web/server/` (production Vercel serverless). Changes must currently be duplicated across both codebases.
- **In-Memory Rate Limiting on Serverless**:
  - [rateLimit.middleware.js](file:///e:/project%20emp/tbi/apps/web/server/middleware/rateLimit.middleware.js) uses in-memory `Map`. On Vercel lambdas, state resets on cold starts and does not share across concurrent instances.

### 🟢 Medium / Architectural
- **Socket.io on Serverless**:
  - WebSocket real-time chat cannot maintain persistent connections on Vercel serverless functions. Polling fallback works, but real-time push requires a standalone persistent server (or external provider like Pusher / Ably).
- **Missing MongoDB Indexes**:
  - Missing indexes on `Review` (`studentId`, `eventId`), `Certificate` (`studentId`, `issuedAt`), `Application` (`studentId`, `teamId`), and `Team` (`leadId`).
- **Heavy Tasks Running in HTTP Process**:
  - Email sending and PDF generation run synchronously inside the API service rather than being offloaded to dedicated BullMQ workers.
- **Client Bundle Size**:
  - [apps/web/src/App.jsx](file:///e:/project%20emp/tbi/apps/web/src/App.jsx) statically imports all pages, resulting in a single monolithic >900kB bundle without route-based code-splitting (`React.lazy`).
