# RULES.md — Engineering & AI Guardrails

**Last updated:** 2026-10-05  
**Production commit:** `59cd804`  
**Verified against code:** yes  

---

## 1. Memory Protocol

- **Start of Session**: Read [docs/memory.md](file:///e:/project%20emp/tbi/docs/memory.md) first. It is the single source of truth for high-level state, open issues, and doc references.
- **Code is Truth**: If a document and the codebase disagree, inspect and follow the code, then update the documentation to match.
- **Log Decisions**: Any architectural decision or non-trivial change must be logged in [docs/CHANGELOG-decisions.md](file:///e:/project%20emp/tbi/docs/CHANGELOG-decisions.md) and summarized in [docs/memory.md](file:///e:/project%20emp/tbi/docs/memory.md).

---

## 2. Engineering Conventions & What to Use

| Domain | Rule / Practice | File Path / Implementation |
|--------|----------------|----------------------------|
| **Auth** | Short-lived JWT access + refresh tokens, bcrypt (12 rounds) for passwords, TOTP for MFA | [apps/web/server/modules/auth/](file:///e:/project%20emp/tbi/apps/web/server/modules/auth/) |
| **RBAC** | Permission-based checks via middleware; never check hardcoded role strings in controllers | [packages/shared-constants/permissions.js](file:///e:/project%20emp/tbi/packages/shared-constants/permissions.js), [apps/web/server/middleware/rbac.middleware.js](file:///e:/project%20emp/tbi/apps/web/server/middleware/rbac.middleware.js) |
| **Roles & Tiers** | 5 canonical roles; `tier` (T1/T2/T3) is progression/display metadata only | [packages/shared-constants/roles.js](file:///e:/project%20emp/tbi/packages/shared-constants/roles.js), [packages/shared-constants/tiers.js](file:///e:/project%20emp/tbi/packages/shared-constants/tiers.js) |
| **Data Access** | Always query Mongoose through repository layer; never directly in controllers | `*.repository.js` in each module |
| **Errors** | Throw typed errors (`ValidationError`, `AuthenticationError`, etc.) caught by centralized handler | [apps/web/server/middleware/error.middleware.js](file:///e:/project%20emp/tbi/apps/web/server/middleware/error.middleware.js) |
| **Logging** | Structured logging; strictly redact PII, tokens, and passwords | Winston / centralized logger |
| **Sessions** | Single active session per user via `activeSessionId`; fail closed on DB errors | [apps/web/server/middleware/auth.middleware.js](file:///e:/project%20emp/tbi/apps/web/server/middleware/auth.middleware.js) |
| **Transactions**| Multi-document writes must execute inside an atomic session | `BaseRepository.js` |

---

## 3. Strict Prohibitions (What NOT to Do)

- ❌ **NO secrets or keys in git**: Never commit `.env` files, API keys, or JWT secrets. Document only variable names.
- ❌ **NO direct role strings in business logic**: Do not write `if (user.role === 'T2')` — use permission checks (`user.permissions.includes(...)`).
- ❌ **NO storing tokens in insecure client storage**: Access tokens are kept in-memory or secure cookies.
- ❌ **NO sync crypto**: Never use `bcrypt.hashSync()` on the main event loop thread.
- ❌ **NO bypass of rate limiting or MFA** in production code for convenience.
- ❌ **NO unvalidated regex queries**: Escape user-supplied strings before constructing regular expressions (e.g. `teamName` search).
- ❌ **NO direct cross-module model imports**: Modules must import each other via service interfaces or public index exports.

---

## 4. Red-Zone Files (High-Risk Areas)

Changes to these files require explicit verification and testing before committing:
- Authentication & Tokens: [apps/web/server/modules/auth/](file:///e:/project%20emp/tbi/apps/web/server/modules/auth/), `auth.tokens.js`
- RBAC Middleware & Constants: [apps/web/server/middleware/rbac.middleware.js](file:///e:/project%20emp/tbi/apps/web/server/middleware/rbac.middleware.js), [packages/shared-constants/](file:///e:/project%20emp/tbi/packages/shared-constants)
- Super Admin Revocation: [apps/web/server/modules/super-admin/](file:///e:/project%20emp/tbi/apps/web/server/modules/super-admin/)
- Error Handler & Sanitizer: [apps/web/server/middleware/error.middleware.js](file:///e:/project%20emp/tbi/apps/web/server/middleware/error.middleware.js)
