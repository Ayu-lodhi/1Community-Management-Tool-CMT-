# TBI Platform — Workforce & Community Management Portal

A full-stack enterprise employee and community management portal built with Express, MongoDB, and React (Vite).

---

## Quick Start

### 1. Prerequisites
- **Node.js**: `>= 20.0.0` (LTS or Node 22 recommended, see `.nvmrc`)
- **MongoDB**: Local replica set or MongoDB Atlas cluster
- **Redis** *(Optional for local dev)*: Standalone Redis or in-memory fallback

### 2. Installation
```bash
npm install
```

### 3. Environment Configuration
Copy the development-safe environment example files:
```bash
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```
The default `.env.example` files are pre-configured for safe local development (`NODE_ENV=development`, localhost URLs, disabled CAPTCHA/MFA for local testing).

For production deployment configuration, see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

### 4. Running Locally
Start both backend API and frontend client:
```bash
# Start backend API (http://localhost:5000)
npm run dev:api

# Start frontend web app (http://localhost:5173 or :3000)
npm run dev:web
```

### 5. Running Tests
```bash
# Run backend unit tests
node --test apps/api/src/__tests__/*.unit.test.js

# Run frontend guard and web unit tests
node --test apps/web/src/__tests__/*.test.js
node --test apps/web/server/modules/auth/__tests__/*.unit.test.js

# Build frontend production bundle
npm run build --workspace=@tbi/web
```

---

## Deployment

- **Production Environment Guide**: See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for required secrets, email configuration, and production variables.
- **Vercel Serverless Deployment**: See [docs/DEPLOY_VERCEL.md](docs/DEPLOY_VERCEL.md) for deployment instructions on Vercel.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines, branch naming conventions, and security rules.
