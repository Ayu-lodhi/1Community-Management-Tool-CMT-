# Security Fix Baseline

**Last updated:** 2026-10-05  
**Production commit:** `59cd804`  
**Verified against code:** yes  

---

## 1. Test Suite Baseline

- **Execution Command**: `node --test apps/api/src/__tests__/*.unit.test.js`
- **Runner**: Node.js Native Test Runner
- **Status**: ✅ PASS (31 passing, 0 failing, 0 skipped, ~14s)

### Test Suite Breakdown:

| Test Suite File | Tests | Status | Areas Covered |
|-----------------|-------|--------|---------------|
| [characterization.unit.test.js](file:///e:/project%20emp/tbi/apps/api/src/__tests__/characterization.unit.test.js) | 16 | ✅ PASS | Auth session persistence, requireTeam regex sanitization, 500 error masking, queue PII masking |
| [profile.unit.test.js](file:///e:/project%20emp/tbi/apps/api/src/__tests__/profile.unit.test.js) | 15 | ✅ PASS | `canViewProfile` matrix, field-level privacy, `canChangeTier`, progress score, LinkedIn validator, completion % |

### Summary Output:
```text
✔ Characterization: auth.tokens uses ACCESS_SECRET and REFRESH_SECRET (0.24ms)
✔ Characterization: auth.tokens sign/verify roundtrip works (0.35ms)
✔ Characterization: single-session: authenticateToken checks activeSessionId (0.22ms)
✔ Characterization: single-session: DB error in authenticateToken fails closed with 401 (0.28ms)
✔ Characterization: requireTeam: sanitized regex matches valid team name (0.23ms)
✔ Characterization: requireTeam: rejects regex injection characters (0.19ms)
✔ Characterization: error handler: masks 500 details in production (0.25ms)
✔ Characterization: error handler: reveals 500 details in development/test (0.21ms)
✔ Characterization: queue service: redacts email in log output (0.18ms)
...
✔ Profile Access - canViewProfile authorization matrix (1.88ms)
✔ Profile Access - sanitizeProfileForViewer field-level privacy (0.58ms)
✔ Profile Access - canChangeTier privilege escalation and rules (0.56ms)
✔ Progress Score - returns 0 score and Beginner level when no activity metrics exist (2.70ms)
✔ Progress Score - correctly computes 100% full engagement as Star level (0.64ms)
✔ Progress Score - correctly normalizes when user only has subset of signals (0.25ms)
✔ Progress Score - boundary thresholds between Beginner, Active, and Star (0.25ms)
✔ Profile Module - validateLinkedInUrl accepts valid LinkedIn profiles (2.41ms)
✔ Profile Module - validateLinkedInUrl rejects malicious or invalid URLs (0.55ms)
✔ Profile Module - calculateCompletion weights total 100 (0.38ms)
✔ Profile Module - calculateCompletion handles empty profile (0.60ms)
✔ Profile Module - calculateCompletion handles 100% complete profile (0.46ms)
✔ Profile Validation - Mass Assignment Protection (2.59ms)
✔ Profile Validation - LinkedIn Validator rejects XSS, SSRF and malformed URLs (0.98ms)
✔ Profile Validation - Future birthday is rejected (0.47ms)

Total Tests: 31 passed, 0 failed.
```

---

## 2. Issues Baseline Status

| Issue # | Description | Status in Git | Status in Vercel Production |
|---------|-------------|---------------|----------------------------|
| **1** | Hardcoded JWT & Mongo secret fallbacks | Fixed in commit `77a884e` | Fixed in git; requires env vars set on Vercel |
| **2** | Session persistence fail-open vulnerability | Fixed in commit `fa7e1fb` | Fixed in git; blocked by 503 startup crash |
| **3** | Production 500 stack trace leak | Fixed in commit `8b920b2` | Fixed in git; blocked by 503 startup crash |
| **4** | `teamName` regex injection in requireTeam | Fixed in commit `894a6fe` | Fixed in git; blocked by 503 startup crash |
| **5** | Queue service email PII exposure | Fixed in commit `97e14a2` | Fixed in git; blocked by 503 startup crash |
| **6–15** | Profile validation, gender enum, avatar size | Fixed in commit `59cd804` | Fixed in git; blocked by 503 startup crash |
