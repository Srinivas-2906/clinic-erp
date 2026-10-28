FROM node:20-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates wget python3 make g++ \
  && wget -q https://github.com/benbjohnson/litestream/releases/download/v0.3.13/litestream-v0.3.13-linux-amd64.deb \
  && dpkg -i litestream-v0.3.13-linux-amd64.deb \
  && rm litestream-v0.3.13-linux-amd64.deb \
  && apt-get purge -y wget \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Monorepo install — root lock includes all workspace deps (e.g. nodemailer).
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/package.json
RUN npm ci --omit=dev --workspace=clinic-api

WORKDIR /app/apps/api

COPY apps/api/src ./src
COPY apps/api/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN sed -i 's/\r$//' /usr/local/bin/docker-entrypoint.sh ; chmod +x /usr/local/bin/docker-entrypoint.sh

RUN mkdir -p /data/uploads

ENV NODE_ENV=production
ENV PORT=8080
ENV DATABASE_PATH=/data/clinic.db
ENV UPLOADS_DIR=/data/uploads

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 8080) + '/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

ENTRYPOINT ["docker-entrypoint.sh"]
