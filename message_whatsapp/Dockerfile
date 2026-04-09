# syntax=docker/dockerfile:1.4
# ─────────────────────────────────────────
# Stage 1 : dépendances (toutes)
# ─────────────────────────────────────────
FROM node:20-alpine AS deps

WORKDIR /app

COPY package*.json ./
# Cache mount : réutilise le cache npm entre les builds
RUN --mount=type=cache,target=/root/.npm \
    npm ci

# ─────────────────────────────────────────
# Stage 2 : build
# ─────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Supprimer les devDependencies dans le même layer
RUN npm prune --omit=dev

# ─────────────────────────────────────────
# Stage 3 : production
# ─────────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

# ffmpeg — nécessaire pour transcoder les audios WebM/Opus (Chrome) vers AAC/MP4
RUN apk add --no-cache ffmpeg

# Dépendances de production (déjà prunées) + binaire compilé
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package*.json ./

# Répertoires persistés via volumes
RUN mkdir -p uploads logs

# Utilisateur non-root
RUN addgroup -S appgroup && adduser -S appuser -G appgroup \
    && chown -R appuser:appgroup /app
USER appuser

EXPOSE 3002

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=5 \
  CMD node -e "require('http').get('http://127.0.0.1:3002/',r=>process.exit(r.statusCode>=500?1:0)).on('error',()=>process.exit(1))"

CMD ["node", "dist/main"]
