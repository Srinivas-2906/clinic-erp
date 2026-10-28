FROM node:20-bookworm-slim AS builder
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps ./apps
COPY packages ./packages
RUN npm ci --workspace=clinic-crm \
  && npm install --no-save \
    @rollup/rollup-linux-x64-gnu \
    @rolldown/binding-linux-x64-gnu \
    lightningcss-linux-x64-gnu
WORKDIR /app/apps/crm
ARG VITE_CLINIC_API=/api
ARG VITE_TENANT_SLUG=dentacare
ENV VITE_CLINIC_API=$VITE_CLINIC_API \
  VITE_TENANT_SLUG=$VITE_TENANT_SLUG
RUN npm run build

FROM nginx:1.27-alpine
COPY apps/crm/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY apps/crm/docker-entrypoint.sh /docker-entrypoint.sh
RUN sed -i 's/\r$//' /docker-entrypoint.sh ; chmod +x /docker-entrypoint.sh
COPY --from=builder /app/apps/crm/dist /usr/share/nginx/html
EXPOSE 8080
ENTRYPOINT ["/docker-entrypoint.sh"]
