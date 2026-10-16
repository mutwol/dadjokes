# The API image. docker-compose.yml uses it to apply migrations and seed data;
# the same image runs the API (default command) or the worker
# (`node dist/worker.js`).
#
# Build from the repo root:  docker build -f apps/api/Dockerfile -t daddy-jokes-api .

ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-alpine AS base
# Keep in step with "packageManager" in the root package.json.
ARG PNPM_VERSION=12.11.2
RUN npm install -g pnpm@${PNPM_VERSION}
WORKDIR /repo
# Every workspace manifest, so the lockfile matches; only the API's dependencies are installed.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/contracts/package.json packages/contracts/

FROM base AS build
RUN pnpm install --frozen-lockfile --filter api
COPY apps/api apps/api
RUN pnpm --filter api build

FROM base AS prod-deps
RUN pnpm install --frozen-lockfile --prod --filter api

FROM node:${NODE_VERSION}-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /repo/apps/api
COPY --from=prod-deps /repo/node_modules /repo/node_modules
COPY --from=prod-deps /repo/apps/api/node_modules ./node_modules
COPY --from=build /repo/apps/api/dist ./dist
COPY apps/api/package.json ./
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
