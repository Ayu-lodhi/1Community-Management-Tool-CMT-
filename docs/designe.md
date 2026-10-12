# DESIGNE.md — Frontend Design Rules & Design Tokens

**Last updated:** 2026-10-05  
**Production commit:** `59cd804`  
**Verified against code:** yes  

---

## 1. Visual Identity & Design Philosophy

The TBI-GEU interface employs a **Retro-Industrial Engineering Console** visual aesthetic combined with modern, high-density utility dashboards:
- Industrial chassis inputs, screw rivets, tactile buttons, and live LED indicators for authentication and critical control panels.
- Blueprint grid backgrounds and warm neutrals for card containers.
- High-contrast, clean data density for administrative tables and rosters.
- Mobile-first, single-thumb ergonomics for student volunteers on phone browsers.

---

## 2. Typography & Fonts

Configured in [apps/web/src/index.css](file:///e:/project%20emp/tbi/apps/web/src/index.css) and [apps/web/tailwind.config.js](file:///e:/project%20emp/tbi/apps/web/tailwind.config.js):

| Font Family | Usage | Fallback |
|-------------|-------|----------|
| **Inter** | Primary UI font across all body, tables, navigation, inputs | `system-ui`, `sans-serif` |
| **Space Mono / Monospace** | Badges, hashes, token displays, timestamp logs, codes | `monospace` |
| **Barlow Condensed / Rajdhani** | Industrial section headers, uppercase stamp tags | `sans-serif` |

---

## 3. Color Tokens & Industrial Classes

Defined in [apps/web/src/index.css](file:///e:/project%20emp/tbi/apps/web/src/index.css):

| Class / Token | Value / Gradient | Visual Effect |
|---------------|------------------|---------------|
| `industrial-chassis` | `linear-gradient(180deg, #373b43 0%, #26292f 100%)` | Dark cast-metal casing with inset bevel |
| `screw-rivet` | `#b0b7c3` with 45° slotted screw head | Mechanical rivet detail on panel corners |
| `industrial-button` | `linear-gradient(180deg, #a82d2d 0%, #821c1c 55%, #661414 100%)` | Crimson-to-dark-red stamped actuation button |
| `blueprint-grid` | `#f0ede6` background with `#d5ccbf` 24px grid dots | Technical drafting paper backdrop |
| `led-green` | `#4ade80` with `0 0 8px #22c55e` glow | Active session / Connected status |
| `led-amber` | `#fde047` with `0 0 7px #eab308` glow | Pending / Standby / MFA challenge |
| `led-red` | `#f87171` with `0 0 7px #ef4444` glow | Revoked / Error / Inactive status |

---

## 4. Role-Based Layout Hierarchy

Layouts managed in [apps/web/src/pages.jsx](file:///e:/project%20emp/tbi/apps/web/src/pages.jsx):

| Role | Information Density | Key Focus |
|------|---------------------|-----------|
| `SUPER_ADMIN` | Maximum / High | Audit logs, session termination, token revoke, platform health |
| `ADMIN` | High | Event creation wizards, user provisioning, CSV bulk import, statistics |
| `T3_EXECUTIVE` | Moderate | Applicant review queues, team roster viewer, attendance check-in |
| `T2_ASSOCIATE` | Moderate | Shift assignments, event coordination, team chat |
| `T1_VOLUNTEER` | Streamlined / Mobile-First | Event discovery cards, shift apply, QR check-in scanner, profile completion |

---

## 5. UI Components & Mobile Rules

### Form Inputs & Buttons:
- Minimum touch target: `44px` on mobile screens.
- Avoid low-contrast gray text; adhere strictly to WCAG AA.
- Form submissions require clear disabled states with spinners during async API calls.

### Image & Avatar Uploads:
- Handled in [apps/web/src/pages/profile/MyProfilePage.jsx](file:///e:/project%20emp/tbi/apps/web/src/pages/profile/MyProfilePage.jsx).
- Native `<input type="file" accept="image/*">`.
- Canvas-based client-side downscaling and compression before upload to keep payloads `< 10MB`.
