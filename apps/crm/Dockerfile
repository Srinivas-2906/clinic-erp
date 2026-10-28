FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/crm/package.json ./apps/crm/package.json
RUN npm ci --workspace=clinic-crm
COPY apps/crm ./apps/crm
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
