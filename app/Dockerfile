# Shared base stage
FROM node:22-alpine AS base
WORKDIR /app
COPY package*.json ./

# Full build stage
FROM base AS full-build
RUN npm install
COPY . .
RUN npm run build && npm run openapi:build
EXPOSE 3000
CMD ["npm", "start"]

# Production stage
FROM base AS release
RUN npm ci --omit=dev
COPY --from=full-build /app/.next ./.next
COPY --from=full-build /app/public ./public
COPY --from=full-build /app/templates ./templates
# next start reloads this file at runtime. Without it, images.remotePatterns
# is empty and org logos (S3 via /_next/image) return 400.
COPY --from=full-build /app/next.config.mjs ./next.config.mjs
EXPOSE 3000
CMD ["npm", "run", "start"]
