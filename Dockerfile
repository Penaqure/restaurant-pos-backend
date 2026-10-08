FROM node:20-bookworm-slim

# Puppeteer needs a real Chromium to render bill/invoice PDFs. Installing
# Debian's own package (well-documented, predictable binary path) instead of
# letting puppeteer download its bundled one avoids the flaky download and
# missing-shared-library issues that plague slim/alpine base images.
#
# postgresql-client provides pg_dump for the automated nightly backup (see
# services/backupService.js) -- Debian bookworm's default is PG15 against
# this app's PG16 server, a one-major-version skew pg_dump handles fine for
# a schema this ordinary. Pinning postgresql-client-16 would mean adding the
# PGDG apt repo (an extra network dependency at image build time) for a gap
# not worth that fragility here.
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium \
      ca-certificates \
      fonts-liberation \
      postgresql-client \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

COPY package*.json ./
# --omit=dev skips embedded-postgres (a dev-only local Postgres that would
# otherwise download its own binary during this install for nothing, since
# production uses the real `postgres` service) and nodemon.
RUN npm ci --omit=dev

COPY . .
RUN mkdir -p public/uploads/bills logs backups

EXPOSE 5000

# Uses Node's own http client rather than curl/wget so this doesn't need an
# extra apt package -- the app already exposes GET /health for this.
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=5 \
  CMD node -e "require('http').get('http://localhost:5000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

ENTRYPOINT ["./docker-entrypoint.sh"]
