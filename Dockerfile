# =====================================================================
# Image Docker d'Awé.
# Étape 1 ("construction") : installe tout et compile le serveur + l'interface.
# Étape 2 (image finale)    : garde seulement le nécessaire pour tourner.
# =====================================================================
FROM node:22-bookworm-slim AS construction
WORKDIR /app
RUN npm install -g pnpm@10

# Dépendances d'abord (Docker les garde en cache tant qu'elles ne changent pas).
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY web/package.json web/pnpm-lock.yaml web/
RUN pnpm --dir web install --frozen-lockfile

# Le code, puis la compilation.
COPY . .
RUN pnpm build && pnpm web:build && pnpm prune --prod

# ---------------------------------------------------------------------
FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=construction /app/package.json ./
COPY --from=construction /app/node_modules ./node_modules
COPY --from=construction /app/dist ./dist
COPY --from=construction /app/drizzle ./drizzle
COPY --from=construction /app/web/dist ./web/dist
# data/ (base SQLite) et storage/ (PDF) sont des dossiers du serveur, montés par docker-compose.
RUN mkdir -p data storage && chown -R node:node /app
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://localhost:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/server.js"]
