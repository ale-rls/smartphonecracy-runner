# syntax=docker/dockerfile:1.7
FROM node:22.17.0-bookworm-slim AS build

ARG BUILD_VERSION=dev
ENV BUILD_VERSION=$BUILD_VERSION
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.12.2 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps ./apps
COPY packages ./packages
COPY scripts ./scripts
COPY content ./content
COPY tsconfig.base.json ./
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @smartphonecracy/display build \
 && pnpm --filter @smartphonecracy/phone build \
 && pnpm --filter @smartphonecracy/admin build \
 && pnpm --filter @smartphonecracy/server typecheck

FROM node:22.17.0-bookworm-slim AS runtime

ARG BUILD_VERSION=dev
LABEL org.opencontainers.image.version=$BUILD_VERSION
ENV NODE_ENV=production
ENV BUILD_VERSION=$BUILD_VERSION
ENV HOST=0.0.0.0
ENV PORT=3000
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.12.2 --activate \
 && groupadd --system --gid 10001 app \
 && useradd --system --uid 10001 --gid app --home-dir /app app
COPY --from=build --chown=app:app /app /app
USER app
EXPOSE 3000
CMD ["pnpm", "exec", "tsx", "apps/server/src/index.ts"]
