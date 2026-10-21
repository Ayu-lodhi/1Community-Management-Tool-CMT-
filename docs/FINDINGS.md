# SonarQube & Code Quality Findings

| Group | SonarQube Rule | Target Pattern | Scanner Count | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Group 1** | **S7773** | `parseInt` → `Number.parseInt` | 18 | Approved (exact args preserved) |
| **Group 2** | **S105** / **S7773** | `isNaN` → `Number.isNaN` | 4 | Approved with type proof |
| **Group 3** | **S7772** | Node built-ins `node:` prefix | 31 | Approved (verified via check-prod-deps) |
| **Group 4** | **S7774** | `.replace(/.../g)` → `.replaceAll(/.../g)` | 6 | Approved (strictly with regex `g`) |
| **Group 5** | **S1186** / **no-unused-vars** | Remove unreferenced variables & imports | 12 | Approved (side-effect verified) |
| **Group 7** | **S5852** (ReDoS) | Linear string rewrite of `profile.linkedin.js` | 1 | Approved with 20-case test matrix & timing |
| **Group 8** | **S7775** | Optional chaining `?.` | 8 | Approved with nullish-only proof |
