# ─────────────────────────────────────────
# Stage 1 : build
# ─────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ─────────────────────────────────────────
# Stage 2 : production
# ─────────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

# Dépendances de production uniquement
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Binaire compilé
COPY --from=builder /app/dist ./dist

# Répertoires persistés via volumes
RUN mkdir -p uploads logs

# Utilisateur non-root
RUN addgroup -S appgroup && adduser -S appuser -G appgroup \
    && chown -R appuser:appgroup /app
USER appuser

EXPOSE 3002

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget -qO- http://localhost:3002/ || exit 1

CMD ["node", "dist/main"]
