# The web app: a static build served by Caddy, which also proxies the API and
# gets HTTPS certificates automatically. Build from the repo root:
#   docker build -f apps/web/Dockerfile -t daddy-jokes-web .

ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-alpine AS build
# Keep in step with "packageManager" in the root package.json.
ARG PNPM_VERSION=12.11.2
RUN npm install -g pnpm@${PNPM_VERSION}
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/contracts/package.json packages/contracts/
RUN pnpm install --frozen-lockfile --filter "web..."
COPY packages/contracts packages/contracts
COPY apps/web apps/web
# Shown as "Continue with Google" when set. Baked in at build time.
ARG VITE_GOOGLE_CLIENT_ID=""
ENV VITE_GOOGLE_CLIENT_ID=${VITE_GOOGLE_CLIENT_ID}
RUN pnpm --filter web build

FROM caddy:2-alpine
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /repo/apps/web/dist /srv
