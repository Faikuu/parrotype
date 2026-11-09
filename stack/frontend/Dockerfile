# syntax=docker/dockerfile:1
# Web image: builds the SPA, then serves it with nginx, which also proxies /api to the API service.
# Build from the repository root, because the npm workspace needs the root manifests:
#   docker build -f stack/frontend/Dockerfile .
# (docker-compose.yml does this for you.)

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY stack/backend/package.json stack/backend/
# The frontend bundles the engine's TypeScript source through its aliases (stack/engine/src), so the engine is copied in full.
COPY stack/engine ./stack/engine
COPY stack/frontend ./stack/frontend
RUN npm ci --workspace stack/frontend --include-workspace-root=false
RUN npm run build --workspace stack/engine
RUN npm run build --workspace stack/frontend

FROM nginx:alpine AS runtime
COPY stack/frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/stack/frontend/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
