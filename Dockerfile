FROM node:22-alpine AS base

# Install pnpm
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate

WORKDIR /app

# Copy workspace config (cache layer — changes rarely)
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/api-server/package.json ./packages/api-server/

# Install dependencies (only api-server)
RUN pnpm install --filter @apiex/api-server --frozen-lockfile

# Copy source
COPY packages/api-server/ ./packages/api-server/
COPY tsconfig.base.json ./

# Build
RUN pnpm --filter @apiex/api-server build

# Production stage
FROM node:22-alpine AS production

RUN corepack enable && corepack prepare pnpm@10.32.1 --activate

WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/api-server/package.json ./packages/api-server/

RUN pnpm install --filter @apiex/api-server --frozen-lockfile --prod

COPY --from=base /app/packages/api-server/dist ./packages/api-server/dist

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

# OpenTelemetry (optional - set to enable tracing)
# ENV OTEL_EXPORTER_OTLP_ENDPOINT=http://jaeger:4318

# Health check — verify server responds
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/health').then(r=>{if(!r.ok)throw 1}).catch(()=>process.exit(1))"

# Run as non-root user
USER node

CMD ["node", "packages/api-server/dist/index.js"]
