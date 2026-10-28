# Vercel Deployment Guide

This guide describes how to deploy the Community Management Tool (CMT) web application and serverless API to Vercel.

---

## 1. Project Configuration in Vercel

When importing the project in the Vercel Dashboard:

- **Framework Preset:** Vite (or Other)
- **Root Directory:** `.` *(Monorepo root — leave default / do not select apps/web)*
- **Build Command:** Handled automatically by root `vercel.json` (`npm run build --workspace=@tbi/web`)
- **Output Directory:** Handled automatically by root `vercel.json` (`apps/web/dist`)
- **Node.js Version:** `20.x` or `22.x` *(configured in `package.json` engines)*

---

## 2. Environment Variables

Configure the following variables in Vercel Project Settings > Environment Variables:

### Required (Backend Serverless Function)
| Variable | Description | Example / Notes |
| :--- | :--- | :--- |
| `MONGODB_URI` | MongoDB connection string | `mongodb+srv://<cluster-host>/cmt_prod?retryWrites=true&w=majority` |
| `JWT_ACCESS_SECRET` | Secret key for access token signing | Minimum 32 random characters |
| `JWT_REFRESH_SECRET` | Secret key for refresh token signing | Minimum 32 random characters (must differ from `JWT_ACCESS_SECRET`) |

### Recommended
| Variable | Description | Example / Notes |
| :--- | :--- | :--- |
| `NODE_ENV` | Application environment | Set to `production` |
| `CLIENT_URL` | Canonical public web URL | `https://your-domain.vercel.app` |
| `ALLOWED_ORIGINS` | CORS origin allowlist | `https://your-domain.vercel.app` |
| `EMAIL_HOST` | SMTP server host | e.g. `smtp.sendgrid.net` or `email-smtp.us-east-1.amazonaws.com` |
| `EMAIL_PORT` | SMTP port | `587` |
| `EMAIL_USER` | SMTP username | Your SMTP user |
| `EMAIL_PASS` | SMTP password | Your SMTP password or API token |
| `EMAIL_FROM` | Sender email address | `noreply@yourdomain.com` |

### Optional
| Variable | Description | Default |
| :--- | :--- | :--- |
| `JWT_ACCESS_EXPIRY` | Token expiration duration | `15m` |
| `JWT_REFRESH_EXPIRY`| Refresh token duration | `7d` |
| `ENFORCE_MFA` | Force MFA for privileged roles | `false` |
| `MFA_ENCRYPTION_KEY` | 64-hex char AES key for TOTP secrets | 32 random bytes |
| `CAPTCHA_ENABLED` | Enable login captcha | `false` |
| `RECAPTCHA_SECRET_KEY` | Google reCAPTCHA v2 secret | Secret key |
| `REDIS_CACHE_URL` | Redis URL for distributed caching | Optional; falls back to in-memory |

### Client-Side (Vite Frontend)
| Variable | Description |
| :--- | :--- |
| `VITE_API_BASE_URL` | Leave empty on Vercel to use automatic same-origin `/api` rewrites |
| `VITE_RECAPTCHA_SITE_KEY` | Public reCAPTCHA v2 site key (if CAPTCHA is enabled) |

> ⚠️ **SECURITY WARNING:** NEVER set `VITE_DEMO_*` environment variables in production. Demo login features are for local development only and are automatically tree-shaken from production bundles when these variables are unset.

---

## 3. Required External Services

Vercel provides the stateless frontend hosting and serverless compute (`/api`). The following managed services are required:

1. **MongoDB Atlas:** Database cluster (M10+ recommended for production with replica sets).
2. **SMTP Provider:** SendGrid, AWS SES, Resend, or Postmark for transactional email delivery.
3. **Redis (Optional):** Upstash or Redis Cloud if distributed cache is required across serverless invocations.

---

## 4. What Does NOT Run on Vercel

Due to the serverless execution model, the following components are not supported on Vercel:

- **Socket.io Real-Time Server:** Serverless functions cannot maintain persistent WebSocket connections. Real-time chat and push updates require a standalone Node.js instance (e.g. AWS ECS / DigitalOcean) or a managed WebSocket service.
- **Background Workers (`apps/workers`):** BullMQ workers requiring persistent Redis queue listeners do not run in serverless. Background processing should be deployed separately.

---

## 5. Health Check Endpoint

You can verify the deployment status at:
```
GET /api/health
```
This returns the database connection status, any missing environment variables, and initialization status.

---

## 6. Monorepo Deployment Architecture

The repository uses a single unified root Vercel configuration (`vercel.json`):

1. **Frontend:** Built via `npm run build --workspace=@tbi/web` into `apps/web/dist` and served statically as an SPA with catch-all rewrites to `index.html`.
2. **Serverless API:** Routed via `/api/(.*)` to `api/index.js`, which packages the backend Express app from `apps/api` along with monorepo packages in `packages/**`.
3. **Database:** Auto-connects lazily with Atlas shard hostname normalization and connection pooling to ensure zero connection leaks across serverless warm/cold invocations.
