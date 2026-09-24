FROM node:24-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6 AS tools
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && sed -i 's@http://deb.debian.org@https://deb.debian.org@g' /etc/apt/sources.list.d/debian.sources && pnpm exec playwright install --with-deps chromium
RUN cp -r /root/.cache/ms-playwright /ms-playwright && chmod -R a+rX /ms-playwright && apt-get update && apt-get install -y --no-install-recommends fonts-noto-cjk poppler-utils && rm -rf /var/lib/apt/lists/*
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV NEXT_TELEMETRY_DISABLED=1
COPY . .

FROM tools AS build
ENV APP_PROFILE=local
RUN pnpm build
RUN mkdir -p apps/web/.next/standalone/apps/web/.next && cp -r apps/web/.next/static apps/web/.next/standalone/apps/web/.next/static && cp -r apps/web/public apps/web/.next/standalone/apps/web/public

FROM build AS runtime
RUN groupadd -g 10001 ax && useradd -u 10001 -g ax -m ax
USER ax
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
CMD ["node", "apps/web/.next/standalone/apps/web/server.js"]
