# syntax=docker/dockerfile:1
# API image. Build from the repository root, because the npm workspace needs the root manifests:
#   docker build -f stack/backend/Dockerfile --build-arg DATABASE_PROVIDER=postgresql .
# (docker-compose.yml does this for you.) DATABASE_PROVIDER picks the Prisma client and schema baked into the image.

FROM node:22-alpine AS base
# Prisma's engines link against OpenSSL, which Alpine does not ship by default.
RUN apk add --no-cache openssl libc6-compat
WORKDIR /app

# Install, build and prune the workspace in one stage.
FROM base AS build
ARG DATABASE_PROVIDER=postgresql
ENV DATABASE_PROVIDER=${DATABASE_PROVIDER}
# Toolchain in case bcrypt has no prebuilt binary for this platform.
RUN apk add --no-cache python3 make g++

# Only the manifests of the other workspaces are needed for npm to resolve the lockfile.
COPY package.json package-lock.json ./
COPY stack/frontend/package.json stack/frontend/
COPY stack/backend ./stack/backend
# postinstall runs `prisma:generate` for DATABASE_PROVIDER.
RUN npm ci --workspace stack/backend --include-workspace-root=false
RUN npm run build --workspace stack/backend
# Keep the production dependencies only. The Prisma CLI is one of them, because the container runs migrations.
RUN npm prune --omit=dev
# Regenerate last: any npm step can re-run postinstall, and the client must match DATABASE_PROVIDER.
RUN npm run prisma:generate --workspace stack/backend

FROM base AS runtime
ARG DATABASE_PROVIDER=postgresql
ENV NODE_ENV=production \
    PORT=3000 \
    DATABASE_PROVIDER=${DATABASE_PROVIDER} \
    PRISMA_HIDE_UPDATE_MESSAGE=1 \
    CHECKPOINT_DISABLE=1
WORKDIR /app/stack/backend

# npm places some backend packages (express, @nestjs/platform-express) in stack/backend/node_modules, so both trees are needed.
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/stack/backend/node_modules ./node_modules
COPY --from=build /app/stack/backend/package.json ./package.json
COPY --from=build /app/stack/backend/dist ./dist
COPY --from=build /app/stack/backend/prisma ./prisma
COPY --from=build /app/stack/backend/scripts ./scripts

USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=30s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/api/health || exit 1

# Apply pending migrations, then start the server (exec, so the server gets the stop signals).
CMD ["sh", "-c", "node scripts/prisma.mjs migrate deploy && exec node dist/main"]
