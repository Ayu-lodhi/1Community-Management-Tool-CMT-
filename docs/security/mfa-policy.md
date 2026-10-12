# Admin and Super Admin MFA

## Deployment and enrollment

Existing privileged accounts are denied login until enrolled. Existing JWTs of
all roles must be replaced by signing in again. Deploy the API and login UI together.

Configure `JWT_SECRET` and a separate `MFA_ENCRYPTION_KEY` (32 random bytes encoded
as 64 hex characters) in the secret manager. Preserve the encryption key across
restarts; losing or replacing it makes existing factors unusable. Never commit it.

From `apps/api`, a trusted system operator runs:

```sh
node scripts/enroll-mfa.js admin@example.test
```

The tool uses the configured MongoDB connection and writes a temporary, owner-only
file containing an authenticator URI. Independently verify the account owner's
identity, securely import the URI into their authenticator, and enter their code
to confirm possession. The file is removed when the command finishes. Do not copy
the URI into logs, tickets, email, or the repository. Interrupted sessions may leave
a private temporary directory that the operator must remove.

The tool accepts only active, unenrolled privileged accounts and never overwrites
an existing factor. There is deliberately no password-only enrollment/reset API:
a stolen password must not allow an attacker to register their own authenticator.
Lost-factor recovery requires an independently verified operator procedure; no
self-service recovery or backup codes are implemented. Password resets preserve MFA.
Enroll new privileged accounts after provisioning them and before their first login.

## Login and enforcement

`POST /api/v1/auth/login` returns `{ mfaRequired: true, challengeToken }` after a
privileged user's password is checked. The challenge expires in five minutes and
has no access or refresh authority. Submit it with a six-digit `code` to
`POST /api/v1/auth/mfa/verify`. Successful TOTP verification issues a session only after mandatory password
replacement is complete. Accounts with a temporary password instead receive a
restricted password-change token; see `../database/password-replacement.md`.
Temporary-password login is consumed once, and MFA plus replacement must complete
within five minutes of that login.

TOTP uses SHA-1, six digits, a 30-second period, and one step of clock tolerance.
Five attempts per account per five-minute window are reserved atomically in MongoDB;
new login challenges do not reset the limit. Accepted time steps cannot be reused,
including concurrent verification requests. After enrollment or another successful
login, wait for a new code before logging in again.

Every mounted protected HTTP route and Socket.io handshake requires an access-purpose
JWT. Privileged users additionally require a signed `isMfaVerified: true` claim.
Proof is bound to current password credentials and enrollment version. Refresh and
challenge credentials are rejected by these gates; there is no refresh endpoint.
This check covers privileged operations in feature routers as well as `/admin` and
`/super-admin`. A frontend flag or user-profile field cannot satisfy it.

## Regression tests

With Node 24 and a disposable local MongoDB, run from `apps/api`:

```sh
MFA_TEST_MONGODB_URI=mongodb://127.0.0.1:27018 node --test
```

The integration suite creates and drops its own uniquely named database. Without
`MFA_TEST_MONGODB_URI`, the database integration block is explicitly skipped.
