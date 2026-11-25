# Shared base stage
FROM node:22-alpine AS base
WORKDIR /app
COPY package*.json ./

# Full build stage
FROM base AS full-build
# npm's download cache (~300 MB) is never read again inside the image
RUN npm install && npm cache clean --force
COPY . .
# .next/cache only speeds up the next `next build`, which never sees this layer.
# Shipping it adds ~490 MB to both images and to every pod's image pull on deploy.
RUN npm run build && npm run openapi:build && rm -rf .next/cache
EXPOSE 3000
CMD ["npm", "start"]

# Production stage
FROM base AS release
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=full-build /app/.next ./.next
COPY --from=full-build /app/public ./public
COPY --from=full-build /app/templates ./templates
# next start reloads this file at runtime. Without it, images.remotePatterns
# is empty and org logos (S3 via /_next/image) return 400.
COPY --from=full-build /app/next.config.mjs ./next.config.mjs
# Read at runtime by src/backend/llm/config.ts. Without it every LLM call fails.
COPY --from=full-build /app/llm_config.yaml ./llm_config.yaml
EXPOSE 3000
CMD ["npm", "run", "start"]
