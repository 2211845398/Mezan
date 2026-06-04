# Production static SPA: build with Vite, serve with hardened nginx.conf.
# Build from repo root: docker build -f web/Dockerfile -t mezan-web .

FROM node:22-bookworm-slim AS build

ENV PNPM_HOME=/root/.pnpm \
    PATH=/root/.pnpm:$PATH

RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app/web

COPY web/package.json web/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY web/ .
RUN pnpm build

FROM nginx:1.27-alpine

COPY web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/web/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
