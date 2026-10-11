# Multi-stage production Dockerfile for apps/api
# Ensures devDependencies are omitted from the production container image

# Stage 1: Dependency installation with devDependencies omitted
FROM node:20-alpine AS dependencies
WORKDIR /app

# Copy dependency manifests
COPY package*.json ./

# Install production dependencies strictly with --omit=dev
RUN npm ci --omit=dev --ignore-scripts

# Verify zero devDependencies exist in the installed node_modules
COPY scripts/check-prod-deps.js ./scripts/check-prod-deps.js
RUN node scripts/check-prod-deps.js --strict

# Stage 2: Minimal runtime image
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Security: non-root execution
USER node

# Copy production node_modules and application source
COPY --chown=node:node --from=dependencies /app/node_modules ./node_modules
COPY --chown=node:node package*.json ./
COPY --chown=node:node src ./src

EXPOSE 5000

CMD ["npm", "start"]
