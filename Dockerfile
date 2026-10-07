FROM node:24-bookworm-slim

ENV NODE_ENV=production \
    APP_MODE=cloud \
    SERVE_FRONTEND=false \
    BIND_HOST=0.0.0.0 \
    PORT=5000

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

COPY --chown=node:node server.js version.json CHANGELOG.md ./
COPY --chown=node:node config ./config
COPY --chown=node:node controllers ./controllers
COPY --chown=node:node middleware ./middleware
COPY --chown=node:node models ./models
COPY --chown=node:node routes ./routes
COPY --chown=node:node services ./services
COPY --chown=node:node scripts/publicationSafety.js scripts/createAdmin.js scripts/adminCredentials.js scripts/createDeveloper.js ./scripts/

USER node
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + process.env.PORT + '/api/health', { signal: AbortSignal.timeout(4000) }).then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "server.js"]
