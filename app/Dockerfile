# Shared base stage
FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./

# Full build stage
FROM base AS full-build
RUN npm install
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]

# Production stage
FROM base AS release
RUN npm ci --omit=dev
COPY --from=full-build /app/.next ./.next
COPY --from=full-build /app/public ./public
COPY --from=full-build /app/templates ./templates
EXPOSE 3000
CMD ["npm", "run", "start"]