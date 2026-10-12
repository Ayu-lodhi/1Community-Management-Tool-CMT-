# Security Fix Audit — Phase 1

**Last updated:** 2026-10-05 | **Production commit:** `59cd804` | **Verified against code:** yes

## Production Deployment Status Summary

| Issue | Git Status | Vercel Production Status |
|-------|-----------|--------------------------|
| #1 Hardcoded JWT/MongoDB secrets | ✅ Fixed in git (`77a884e`) | ⚠️ DEPLOYED but missing env vars — still fails with 503 |
| #2 Session fail-open | ✅ Fixed in git (`fa7e1fb`) | ⚠️ Not functional — API crashes before reaching this code |
| #3 Production error details exposed | ✅ Fixed in git (`8b920b2`) | ⚠️ Not functional — API crashes at startup |
| #4 TeamName regex injection | ✅ Fixed in git (`894a6fe`) | ⚠️ Not functional — API crashes at startup |
| #5 Email PII in queue logs | ✅ Fixed in git (`97e14a2`) | ⚠️ Not functional — API crashes at startup |
| #6–#15 (auth, teams, chat, attendance, etc.) | ✅ Fixed in git | ⚠️ Not functional — API crashes at startup |
| **Vercel 503 Startup Crash (Route.patch undefined callback)** | ✅ Fixed in code | Resolved (ready for redeploy with env vars) |

**Root cause of 503:** `apps/web/server/modules/notifications/notifications.routes.js:10` registered `router.patch('/read-type/:type', controller.markTypeRead)` where `controller.markTypeRead` was not defined in `notifications.controller.js`. Express threw `Route.patch() requires a callback function but got a [object Undefined]` at module boot. `apps/web/api/index.js` caught `initError` and returned generic 503 on every request.

**Fix:** Added `exports.markTypeRead` to `apps/web/server/modules/notifications/notifications.controller.js`, implemented lazy cached MongoDB connection in `apps/web/api/index.js`, and added `/api/health` diagnostic endpoint.

---

## Issue 1: Hardcoded Secrets in Source

### CONFIRMED ✓

#### JWT Secret Fallback
- **File:** `apps/api/src/modules/auth/auth.tokens.js`, line 4
- **Code:** `const JWT_SECRET = process.env.JWT_SECRET || 'tbi_super_secret_key_change_in_production_min_32_chars';`
- **Issue:** Falls back to hardcoded string when `JWT_SECRET` env var is missing
- **Used by:** 
  - Line 16: `authState()` — HMAC-SHA256 key
  - Line 23: `sign()` — JWT signing key
  - Line 26: `verify()` — JWT verification key
- **Critical:** If `JWT_SECRET` is not set, all tokens are signed with the hardcoded fallback value

#### MongoDB URI Fallback (with embedded credentials)
- **File:** `apps/api/src/server.js`, line 95
- **Code:** `const MONGODB_URI = process.env.MONGODB_URI || '[REDACTED]'`
- **Issue:** Falls back to a hardcoded connection string with embedded credentials
- **Used by:** Line 98, `mongoose.connect(MONGODB_URI, ...)`
- **Critical:** Credentials are exposed in the source code

#### Environment Validation (envValidation.js)
- **File:** `apps/api/src/core/config/envValidation.js`
- **Status:** Validates at startup if `MONGODB_URI` and `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` are present
- **Problem:** `auth.tokens.js` reads `process.env.JWT_SECRET` (different name), not the validated `JWT_ACCESS_SECRET`
- **Name Mismatch:** Validation requires `JWT_ACCESS_SECRET` (min 16 chars), but `auth.tokens.js` reads `JWT_SECRET` (different variable name)
- **Result:** Validation passes but tokens still use hardcoded fallback

#### Alternative Config System (env.config.js)
- **File:** `apps/api/src/core/config/env.config.js`
- **Status:** Contains fallbacks for all secrets including `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, and `MONGODB_URI`
- **Imports:** Used in **both apps/api and apps/web** (ES6 modules):
  - `apps/api/src/core/database/connection.js` (imports `ENV.MONGODB_URI`)
  - `apps/api/src/core/middleware/auth.middleware.js` (imports `ENV.JWT_ACCESS_SECRET`)
  - `apps/api/src/core/config/redis-*.client.js` (all import from env.config.js)
  - Same pattern in `apps/web/server/` (duplicate env.config.js)
- **Fallback Values:**
  - `MONGODB_URI`: `mongodb://localhost:27017/tbi_platform`
  - `JWT_ACCESS_SECRET`: `dev_secret_jwt_access_must_be_long`
  - `JWT_REFRESH_SECRET`: `dev_secret_jwt_refresh_must_be_long`
  - Plus Redis URLs with localhost fallbacks

### Variable Name Conflict Summary
- `envValidation.js` requires: `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `MONGODB_URI`
- `auth.tokens.js` reads: `JWT_SECRET` (different name)
- `env.config.js` and database/auth middleware in both apps use: `ENV.JWT_ACCESS_SECRET`, `ENV.MONGODB_URI`
- **Active code path:** Mixed — some code uses `auth.tokens.js` (old CommonJS), some uses `env.config.js` (new ES6)

### Conclusion
**Issue #1 is CONFIRMED.** Two separate secret sources with different variable names:
1. Old path: `auth.tokens.js` reads `JWT_SECRET` with fallback (not validated)
2. New path: `env.config.js` and database connection read `JWT_ACCESS_SECRET` and `MONGODB_URI` with fallbacks (not validated at startup)

---

## Issue 2: Session Enforcement Can Fail Open

### CONFIRMED ✓

**File:** `apps/api/src/modules/auth/auth.service.js`, lines 15–47

#### acquireSession() behavior:
```javascript
const acquireSession = async (userId) => {
  const sessionId = crypto.randomBytes(32).toString('hex');
  const mongoose = require('mongoose');
  if (mongoose.connection?.readyState !== 1) {
    return { updatedUser: null, sessionId };  // ← FAIL OPEN: Returns success even if DB is down
  }
  // ... attempts update, but no error handling if update fails
  const updatedUser = await User.findByIdAndUpdate(userId, { $set: { activeSessionId: sessionId, ... } });
  return { updatedUser, sessionId };
};
```

#### issueSession() behavior:
```javascript
const issueSession = (user, isMfaVerified, sessionId) => {
  // ... generates and returns accessToken and refreshToken regardless
  return {
    mustChangePassword: boolean,
    passwordChangeToken: string,
    // OR
    user: {...},
    accessToken: string,
    refreshToken: string,
  };
};
```

#### Callers and impact:
1. **`login()` (line 73):** `const { updatedUser, sessionId } = await acquireSession(user._id);` then `return issueSession(updatedUser || user, false, sessionId);`
   - If `acquireSession` returns `{ updatedUser: null, sessionId }`, **tokens are still issued** with the user's fallback, but `activeSessionId` is never stored

2. **`verifyMfa()` (line 85):** Same pattern — calls `acquireSession()` then `issueSession()`

3. **Result:** If MongoDB is unavailable:
   - Session ID is generated but never persisted
   - Valid tokens are issued anyway
   - Single-session enforcement is bypassed
   - A second login attempt will be accepted (existing token remains valid)

### Conclusion
**Issue #2 is CONFIRMED.** `acquireSession()` returns success-like result even when the database is down, and `issueSession()` blindly generates tokens regardless of session persistence.

---

## Issue 3: Auth Verification Should Fail Closed

### CONFIRMED ✓

**File:** `apps/api/src/modules/auth/auth.middleware.js`, lines 6–51

#### authenticateToken() behavior:
```javascript
const authenticateToken = async (token, allowPasswordChange = false) => {
  const decoded = tokens.verify(token, ...);
  const user = await repository.findById(decoded.sub);
  if (!user?.isActive || decoded.authState !== tokens.authState(user)) {
    throw new Error('Account or credentials changed; sign in again');
  }
  // ... session ID check, timeout check, lastActivity update
  if (mongoose.connection?.readyState !== 1) {
    return { ...decoded, name: user.name, email: user.email, role: user.role };  // ← Returns user without DB confirmation
  }
  // Updates lastActivity if DB connected
  return { ...decoded, name: user.name, email: user.email, role: user.role };
};
```

#### Issues:
1. Line 8: `repository.findById(decoded.sub)` can throw if database is down, but error is not explicitly caught in this function
2. Lines 32–48: If MongoDB is not connected, `lastActivity` update is skipped silently (no error thrown)
3. Result: A request with a valid token but an unverifiable user state is allowed through if the database is temporarily unavailable

### Conclusion
**Issue #3 is CONFIRMED.** If the user or session state cannot be loaded (DB error/disconnection), the middleware does not fail closed; it attempts to continue or returns incomplete verification.

---

## Issue 4: Regex Built from teamName (unsafe)

### CONFIRMED ✓

**File:** `apps/api/src/modules/auth/auth.middleware.js`, line 123

```javascript
exports.requireTeam = (teamName) => {
  return async (req, res, next) => {
    const role = req.user.role || '';
    const isTeamMatch = (teamName === 'T3' && (role === 'T3_EXECUTIVE' || role === 'T3')) ||
                        (req.user.team && req.user.team.toUpperCase() === teamName.toUpperCase());
    
    if (isTeamMatch) return next();
    
    if (req.user.teamId) {
      try {
        const Team = require('../teams/teams.model');
        const team = await Team.findById(req.user.teamId);
        if (team && (team.name.toUpperCase().includes(teamName.toUpperCase()) || 
                     team.name.toUpperCase() === teamName.toUpperCase())) {
          return next();
        }
      } catch (err) {
        // Fall through
      }
    }
    
    try {
      const Team = require('../teams/teams.model');
      const memberTeam = await Team.findOne({
        name: new RegExp(`^${teamName}$`, 'i'),  // ← UNSAFE: teamName is not escaped
        $or: [{ members: req.user.sub }, { leadId: req.user.sub }]
      });
      if (memberTeam) return next();
    } catch (err) {
      // Fall through
    }
    
    return res.status(403).json({...});
  };
};
```

#### Matching behavior (current):
1. Exact match: role or `user.team` vs `teamName` (case-insensitive)
2. MongoDB regex: `^${teamName}$` case-insensitive (start/end anchored, exact match within name field)
3. Prefix/contains match: `team.name.toUpperCase().includes(teamName.toUpperCase())`

#### Risk:
- Line 123: `new RegExp(\`^${teamName}$\`, 'i')` — if `teamName` contains regex metacharacters (`.*`, `[`, `]`, `(`, `)`, etc.), they are interpreted as patterns
- Example: If `teamName = "T.*"`, it matches any team name starting with `T` followed by anything
- **Current Usage:** Only called with hardcoded strings from routes (e.g., `requireTeam('T3')`), so risk is LOW but the pattern is unsafe if reused

### Conclusion
**Issue #4 is CONFIRMED (but low risk).** The regex is dynamically built from `teamName`, which is unsafe if ever fed user-controlled values.

---

## Issue 5: Raw Error Details Returned to Clients

### CONFIRMED ✓

**File:** `apps/api/src/server.js`, lines 89–92

```javascript
app.use((err, req, res, next) => {
  console.error('Server error:', err.message);
  res.status(err.status || 500).json({ success: false, message: err.message });
});
```

#### Current behavior:
- All errors return `err.message` directly to the client
- If an error contains secrets (e.g., "Database connection failed: mongodb://...@host"), that message is exposed
- In production, internal stack traces and implementation details leak to clients

#### Example leaks:
- Database errors: "Error: connect ECONNREFUSED 127.0.0.1:27017"
- Auth errors: "ReferenceError: isAdmin is not defined" (exposes variable names)
- File system errors: "Error: ENOENT: no such file or directory, open '/tmp/secret.txt'"

### Conclusion
**Issue #5 is CONFIRMED.** Raw error messages are returned to clients for all errors, potentially leaking sensitive information.

---

## Issue 6: Sensitive Data in Queue Logs

### CONFIRMED ✓

**File:** `apps/api/src/core/queues/queue.service.js`

#### Logging with full email addresses:
- Line 110–115: `enqueueEmail()` logs:
  ```javascript
  logger.info('Email job enqueued to BullMQ worker', {
    jobId: job.id,
    name: jobName,
    to: payload.to,  // ← Full email address logged
    requestId: jobData.requestId,
  });
  ```

- Line 155–159: `enqueueCertificateGeneration()` logs:
  ```javascript
  logger.info('Certificate generation job enqueued to BullMQ worker', {
    jobId: job.id,
    certificateId: payload.certificateId,
    requestId: jobData.requestId,
  });
  ```

#### Auth module logs:
**File:** `apps/api/src/modules/auth/auth.service.js` — No direct token/password logging found in main service, but `auth.middleware.js` logs at line 66:
```javascript
catch (error) {
  return res.status(error.statusCode || 401).json({
    success: false,
    message: error.message || 'Invalid token or required authentication step incomplete',
  });
}
```

#### Verdict:
- Queue logs expose full email addresses (PII)
- No tokens, passwords, or OTPs logged in the service code itself
- Error messages in responses may leak details

### Conclusion
**Issue #6 is CONFIRMED (partial).** Queue service logs full email addresses; no token logging found in service code, but error responses may expose sensitive info (covered by Issue #5).

---

## Detailed Local Scan Findings (Phase 1 Items 1–7)

### 1. Environment Variable Name Inventory & Cross-Reference
- **Variables read in `apps/`**:
  - `NODE_ENV`, `PORT`, `CLIENT_URL`, `FRONTEND_URL`, `ALLOWED_ORIGINS`
  - `MONGODB_URI`
  - `REDIS_CACHE_URL`, `REDIS_PUBSUB_URL`, `REDIS_QUEUE_URL`
  - `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_ACCESS_EXPIRY`, `JWT_REFRESH_EXPIRY`, `JWT_SECRET`
  - `MFA_ENCRYPTION_KEY`, `ENFORCE_MFA`
  - `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASS`, `EMAIL_FROM`
  - `RECAPTCHA_SECRET_KEY`, `CAPTCHA_ENABLED`, `SESSION_TIMEOUT_MINUTES`, `AUTO_SYNC_INDEXES`
  - Frontend (`import.meta.env`): `VITE_API_URL`, `VITE_RECAPTCHA_SITE_KEY`
- **Where defined**:
  - `.env.example`: defines `MONGODB_URI`, `REDIS_*`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_SECRET` (empty alias), `MFA_*`, `RECAPTCHA_*`.
  - `apps/api/.env.example`: defines `MONGODB_URI`, `JWT_SECRET`, `JWT_REFRESH_SECRET` (missing `JWT_ACCESS_SECRET`).
  - `docker-compose.yml`: MongoDB and Redis container ports; no application JWT secrets defined.
  - `infrastructure/terraform`: MongoDB Atlas and ElastiCache provisioned; no ECS task definition environment variables configured.
- **Mismatches / Unvalidated**:
  - `JWT_SECRET`: Read by `auth.tokens.js` but NOT validated by `envValidation.js`.
  - `JWT_ACCESS_SECRET`: Validated by `envValidation.js` but NOT read by `auth.tokens.js`.
  - `MONGODB_URI`: Validated by `envValidation.js` but has hardcoded credentials fallback in `server.js` and serverless entrypoint.

### 2. Current Token Signing Architecture (`auth.tokens.js`)
- **Secret Usage**: Reads single module-level constant `const JWT_SECRET = process.env.JWT_SECRET || '...'` at import time.
- **Signing & Verification**: `exports.sign()` and `exports.verify()` use the same secret for both access and refresh tokens.
- **HMAC Proof**: `exports.authState()` computes HMAC using `JWT_SECRET`.
- **Validation Timing**: In `apps/api/src/server.js`, `validateEnvironment()` is called before routes are imported, but `auth.tokens.js` was reading `JWT_SECRET` rather than the validated `JWT_ACCESS_SECRET`.

### 3. `env.config.js` Imports and Utilized Exports
- **Imports**:
  - `apps/api/src/core/middleware/auth.middleware.js`: uses `ENV.JWT_ACCESS_SECRET`
  - `apps/api/src/core/database/connection.js`: uses `ENV.MONGODB_URI`
  - `apps/api/src/core/config/redis-cache.client.js`: uses `ENV.REDIS_CACHE_URL`
  - `apps/api/src/core/config/redis-queue.client.js`: uses `ENV.REDIS_QUEUE_URL`
  - `apps/api/src/core/config/redis-pubsub.client.js`: uses `ENV.REDIS_PUBSUB_URL`
  - Parallel imports in `apps/web/server/`

### 4. Callers of `acquireSession` and `issueSession`
- **Callers**:
  1. `login()` (`apps/api/src/modules/auth/auth.service.js:73`): If `acquireSession()` fails or returns `updatedUser: null`, `issueSession()` currently still issues access and refresh tokens.
  2. `verifyMfa()` (`apps/api/src/modules/auth/auth.service.js:85`): Same fail-open behavior when DB is unavailable.
- **Database Failure Impact**: When MongoDB is down (`readyState !== 1`), `acquireSession()` returned `{ updatedUser: null, sessionId }`, allowing tokens to be minted without persisting single-session tracking.

### 5. Repository Scan for Hardcoded Secrets & Git History Status
- **Hardcoded Secrets in Code (File & Line only)**:
  - `apps/api/src/server.js:95`
  - `apps/api/src/modules/auth/auth.tokens.js:4`
  - `apps/api/src/core/config/env.config.js:12-13`
  - `apps/api/scripts/reset-demo-users.js:4`
  - `apps/api/scripts/test-attendance-feature.js:174`
  - `apps/web/server/server.js:75`
  - `apps/web/server/modules/auth/auth.tokens.js:4`
  - `apps/web/server/core/config/env.config.js:12-13`
  - `apps/web/api/index.js:15`
- **Secret Values in Git History**: **YES** (present in prior commits; secrets must be rotated).

### 6. Client / Test Reliance on 5xx Error Messages
- **Frontend (`apps/web/src`)**: Displays generic error UI using `data?.message || 'Something went wrong'`. No component checks for raw stack trace or internal database error strings.
- **Tests**: Existing unit tests test 4xx error messages (`Session ended`, `Invalid credentials`, `Route not found`, etc.); none assert on raw 5xx internal error strings.

### 7. Sensitive Data in Logs
- `apps/api/src/core/queues/queue.service.js:113,122`: Logs full recipient email address (`payload.to`).
- Auth module: No plaintext passwords, tokens, or OTPs logged in service/controller logs.

---

## Bulk Import Users Security Audit & Resolution (2026-10-05)

| Finding / Area | Vulnerability / Issue | Fix Applied | Status |
|----------------|----------------------|-------------|--------|
| **Fix A: Privilege Escalation** | ADMIN could create SUPER_ADMIN accounts | Controller & Service guard: only callers with `role === 'SUPER_ADMIN'` may create `SUPER_ADMIN` | ✅ Applied in both backends (`a47fb85`) |
| **Fix B: Credential Disclosure** | `tempPassword` exposed in `addUser` HTTP response | Removed `tempPassword` from response JSON; credentials sent via email only | ✅ Applied in both backends (`991f878`) |
| **Fix C: Rate Limiting & Bulk API** | `createUserLimiter` (5 req/min) blocked CSV uploads >5 rows | Added dedicated `POST /api/v1/admin/users/bulk` with `bulkImportLimiter` (10 req/5min), max 500 rows, 2MB limit, no passwords returned. Frontend batches in chunks of 25 rows for Vercel 10s timeout safety | ✅ Applied in both backends |
| **Fix D: Parser Robustness** | Quoted fields with commas failed, 2MB file limit missing, non-CSV formats in accept | Added RFC 4180 quoted-field parser, client-side 2MB check, removed `.xlsx,.xls` from file input accept | ✅ Applied in frontend |
| **Fix E: Server-Side Validation** | Server trusted client for phone, name, email length constraints | Joi schemas validate phone (`/^[0-9 +\-().]*$/`, max 20, empty string allowed), email (max 254), name (max 100), `allowUnknown: false` | ✅ Applied in both backends |
| **Fix F: Formula Injection** | Previous run added apostrophe prefix to import path, altering database values | Removed apostrophe from import path; added `csvCell()` with RFC 4180 quoting and `=, +, -, @, \t` prefixing at EXPORT time in `attendance.service.js` and `timesheets.service.js`. Zero database alterations stored | ✅ Applied in both backends |
| **Fix G: Password, Logging & State** | Weak Math.random password generation, unredacted email in logs, raw error.message in addUser, window global for import state | `crypto.randomInt` used in `generateDefaultPassword`, email redacted (`al***@domain`), `error.message` sanitized in controller, `window._lastImportResult` replaced with React state | ✅ Applied in both backends & frontend |

---

## QR & Link Attendance Security Audit & Resolution (2026-10-06)

| Finding / Audit # | Vulnerability / Issue | Fix Applied | Status |
|-------------------|----------------------|-------------|--------|
| **1. IDOR on deactivate (Audit #1)** | Any T3 team member could deactivate any active session link created by another user | Checked `link.createdBy === userId || ['ADMIN', 'SUPER_ADMIN'].includes(user.role)`. Non-owners receive 403 Forbidden | ✅ Applied in both backends (`2d16bf6`) |
| **2. IDOR & Chat Injection on share-chat (Audit #2)** | Any user could post an attendance QR link to an unrelated team's chat and was silently injected into `room.members` | Enforced pre-check verifying caller leads, belongs to, or is Admin of target team before posting or touching rooms; removed silent room member injection for unauthorized callers | ✅ Applied in both backends (`c009321`) |
| **3. Unsafe actionUrl in chat (Audit #3)** | `actionUrl` in messages accepted arbitrary schemes (`javascript:`, `data:`, `//evil.com`) | Validated on server in `chat.controller.js` to allow only single-leading-slash relative paths or verified app base URL hosts (dropped to null otherwise). Added `isSafeActionUrl` client check before rendering links in `pages.jsx` | ✅ Applied in both backends & frontend (`dea0460`) |
| **4. Who can generate/deactivate sessions (Audit #4)** | `ADMIN` and `SUPER_ADMIN` were locked out of `requireTeam('T3')` routes | Added `['ADMIN', 'SUPER_ADMIN'].includes(user.role)` check to `requireTeam` middleware (additive, safe) | ✅ Applied in both backends (`30fda14`) |
| **4b. Privilege Escalation for T1 with team "T3"** | `T1_VOLUNTEER` with `team: 'T3'` could generate session links | Enforced executive privileges in `requireTeam('T3')`: blocked `T1_VOLUNTEER` and `T2_ASSOCIATE` from generating T3 sessions | ✅ Applied in both backends |
| **5. Dedicated Rate Limiting (Audit #6)** | No rate limiting on `POST /link/generate` or `POST /link/:token/mark` | Mounted `attendanceGenerateLimiter` (10/min) on `/generate` and `attendanceScanLimiter` (30/min keyed by authenticated user ID `sub` to avoid throttling shared campus Wi-Fi) on `/mark` | ✅ Applied in both backends (`5de27dc`) |
| **6. Raw Error Messages (Audit #7)** | Controllers returned unmasked `err.message` for 5xx and untyped errors | `handleAttendanceError` allows only intentional statuses (`400, 403, 404, 409, 410, 425`); returns generic 500 for untyped/5xx errors and logs server-side without PII | ✅ Applied in both backends (`bcd2aa4`) |
| **7. Audit Logging (Audit #8)** | No audit entries for session lifecycle | Added structured audit logging via `recordAttendanceAudit` for session generation, deactivation, chat sharing, and rejected attempts; records short token prefix (`token.slice(0, 8)...`), never full token or QR data | ✅ Applied in both backends (`eff27cd`) |
| **Audit #5: Hardcoded team 'T3'** | Link generation is hardcoded to team `'T3'` | Design decision: reported options to user (team query/body param vs user's team) | 📋 Report only (deferred) |
| **Audit #9: Public certificate route `GET /verify/:hash`** | Documented PRD endpoint missing from router | Planned Phase 5 feature: marked as documented skip in test suite | 📋 Documented skip |
| **Audit #10: Dead UI elements** | Generate QR button in TeamsPage & unused Team Code field | Identified and reported exact lines | 📋 Report only (deferred) |

---

## End of Audit


