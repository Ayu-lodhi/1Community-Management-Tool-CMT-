# Contributing Guidelines

Thank you for contributing to the TBI Platform! Please follow these guidelines to keep the codebase clean, secure, and maintainable.

---

## 1. Branch Naming Conventions

Use lowercase branch names prefixed with the category of change:
- `feat/feature-name` — New features or capabilities
- `fix/bug-description` — Bug fixes and security patches
- `chore/task-name` — Dependency updates, tooling, or documentation
- `refactor/scope-name` — Code restructuring without functional changes

Examples:
- `feat/user-id-ses`
- `fix/cors-allowlist`
- `chore/update-dependencies`

---

## 2. Pull Request Workflow

1. **Branch from `main`**: Ensure your branch is up-to-date with the latest `main`.
2. **Make focused commits**: Keep commits atomic and descriptive with imperative commit messages (e.g. `fix(auth): prevent timing attacks on verification`).
3. **Include tests**: Add or update unit tests covering your changes in `__tests__/`.
4. **Run tests locally**: Verify all tests pass and production build succeeds (`npm run build --workspace=@tbi/web`) before opening a PR.
5. **Open Pull Request**: Use the provided pull request template and link any relevant issue.

---

## 3. Security Rules (Strictly Enforced)

- ❌ **NEVER commit `.env` or credential files**: Only `.env.example` templates with placeholders belong in git.
- ❌ **NEVER hardcode secrets or keys**: Do not commit AWS keys, JWT secrets, database credentials, or private keys.
- ❌ **NEVER set `VITE_DEMO_*` in production**: Demo credentials are for local development only and are guarded at build-time.
- ❌ **Fail closed**: Security and authentication checks must fail closed on configuration or database errors.

---

## 4. Environment and Runtime

- **Node.js**: The repository uses Node `>= 20.0.0` (LTS or Node 22 pinned in `.nvmrc`).
- **Dependencies**: Install dependencies using `npm ci` or `npm install`.
