# Production Deployment Environment Guide

This document describes environment configuration required for production deployments (e.g., Vercel, AWS, or containerized deployments).

> **Important**: Do not use production configuration values for local development. For local development, copy `.env.example` directly, which contains safe localhost defaults.

---

## 1. Production Environment Variables

### Core Server Settings
| Variable | Production Value / Format | Description |
|---|---|---|
| `NODE_ENV` | `production` | Enables production optimizations, secure cookies, and strict CORS. |
| `PORT` | `5000` | Port for Express standalone server (ignored on serverless platforms like Vercel). |
| `CLIENT_URL` | `https://your-domain.com` | Canonical public URL of the frontend application. |
| `ALLOWED_ORIGINS` | `https://your-domain.com` | Comma-separated allowlist of origins permitted for CORS requests. Localhost is blocked when `NODE_ENV=production`. |

### Database & Caching
| Variable | Production Value / Format | Description |
|---|---|---|
| `MONGODB_URI` | `mongodb+srv://user:pass@cluster.mongodb.net/dbname` | Authenticated MongoDB connection string. Never use fallback values. |
| `REDIS_CACHE_URL` | `rediss://user:pass@host:port/0` | Dedicated Redis instance for caching. |
| `REDIS_PUBSUB_URL` | `rediss://user:pass@host:port/1` | Dedicated Redis instance for Socket.io pub/sub. |
| `REDIS_QUEUE_URL` | `rediss://user:pass@host:port/2` | Dedicated Redis instance for background worker queues. |

### Authentication & Secrets
| Variable | Production Value / Format | Description |
|---|---|---|
| `JWT_ACCESS_SECRET` | 64+ character random string | Secret for signing short-lived access tokens (min 32 chars). |
| `JWT_REFRESH_SECRET` | 64+ character random string | Secret for refresh tokens (must differ from `JWT_ACCESS_SECRET`). |
| `JWT_ACCESS_EXPIRY` | `15m` | Lifetime of access tokens. |
| `JWT_REFRESH_EXPIRY` | `7d` | Lifetime of refresh tokens. |
| `MFA_ENCRYPTION_KEY` | 64-character hex string (32 bytes) | AES-256 key used to encrypt TOTP secrets at rest in MongoDB. |
| `ENFORCE_MFA` | `true` | Enforces mandatory TOTP verification for privileged accounts (`ADMIN`, `SUPER_ADMIN`). |

### Security & Verification
| Variable | Production Value / Format | Description |
|---|---|---|
| `CAPTCHA_ENABLED` | `true` | Enforces reCAPTCHA verification on login and authentication flows. |
| `RECAPTCHA_SITE_KEY` | Public site key | Google reCAPTCHA v2 site key (also set as `VITE_RECAPTCHA_SITE_KEY` in web). |
| `RECAPTCHA_SECRET_KEY` | Secret key | Google reCAPTCHA v2 secret key for server-side verification. |
| `SESSION_TIMEOUT_MINUTES` | `30` | Inactivity window before user session expires. |

### Email Service (SMTP / SES)
| Variable | Production Value / Format | Description |
|---|---|---|
| `EMAIL_HOST` | `email-smtp.ap-south-1.amazonaws.com` | Production SMTP hostname. |
| `EMAIL_PORT` | `587` | SMTP port (enforces STARTTLS). |
| `EMAIL_USER` | SMTP username | AWS SES SMTP username or email provider username. |
| `EMAIL_PASS` | SMTP password | AWS SES SMTP password or email provider password. |
| `EMAIL_FROM` | `TBI Platform <noreply@your-domain.com>` | Verified sender email address. |

---

## 2. Frontend Settings (`apps/web`)

| Variable | Production Setting | Notes |
|---|---|---|
| `VITE_API_BASE_URL` | Empty string `""` or `https://api.your-domain.com` | On Vercel, leave empty to use relative same-origin `/api` rewrites. |
| `VITE_RECAPTCHA_SITE_KEY` | Public reCAPTCHA key | Safe to expose to client browsers. |
| `VITE_DEMO_*` | **NEVER SET** | **DO NOT SET IN PRODUCTION.** Vite bundles any defined `VITE_*` variable into client code. The web build contains guards that will abort the build if any `VITE_DEMO_*` variable is set in production. |
