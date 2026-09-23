# Builds the web (PWA) target and serves the static output with nginx.
# The Electron desktop app is unaffected — this only builds `dist/web`.
#
# Vite inlines VITE_* variables at BUILD time, so the public values below must
# be provided as build args (in Coolify, tick "Build Variable" on each).
# VITE_PRIVACY_URL / VITE_TERMS_URL are optional; unset hides the footer links.

# ── Build stage ───────────────────────────────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app

# The repo's .npmrc sets `script-shell=bash`, but Alpine ships only BusyBox sh.
RUN apk add --no-cache bash

ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_VAPID_PUBLIC_KEY
ARG VITE_PRIVACY_URL
ARG VITE_TERMS_URL
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY \
    VITE_VAPID_PUBLIC_KEY=$VITE_VAPID_PUBLIC_KEY \
    VITE_PRIVACY_URL=$VITE_PRIVACY_URL \
    VITE_TERMS_URL=$VITE_TERMS_URL \
    ELECTRON_SKIP_BINARY_DOWNLOAD=1

COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build:web

# ── Serve stage ───────────────────────────────────────────────────────────────
FROM nginx:alpine AS serve
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY docker/security-headers.conf /etc/nginx/security-headers.conf
COPY --from=build /app/dist/web /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
