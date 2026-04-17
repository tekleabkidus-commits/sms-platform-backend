FROM node:24-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN set -e; \
    echo "==> Running TypeScript compilation..."; \
    npm run build; \
    echo "==> Verifying dist/ output..."; \
    if [ ! -f "dist/src/main.js" ]; then \
      echo "ERROR: dist/src/main.js not found — TypeScript compilation produced no output." >&2; \
      exit 1; \
    fi; \
    echo "==> Build succeeded. Compiled files:"; \
    find dist/ -name "*.js" | sort

FROM base AS prod-deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/package-lock.json ./package-lock.json
COPY --from=build /app/migrations ./migrations
COPY --from=build /app/scripts ./scripts

RUN chown -R node:node /app
USER node

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || '3000') + '/api/v1/health/live').then((res)=>{if(!res.ok) process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "dist/main.js"]
