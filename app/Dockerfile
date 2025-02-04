# Stage 1: Build
FROM node:22-alpine AS builder

# Define build arguments for the environment variables needed at build time.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_OPENCLIMATE_API_URL
ARG NODE_ENV

# Set those build arguments as environment variables so that the Next.js build process can see them.
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_OPENCLIMATE_API_URL=${NEXT_PUBLIC_OPENCLIMATE_API_URL}
ENV NODE_ENV ${NODE_ENV}

# Set the working directory
WORKDIR /app
# Copy package files and install dependencies
COPY package*.json ./
RUN npm install
# Copy application files and build the production bundle
COPY . .
RUN npm run build

# Stage 2: Production
FROM node:22-alpine
# Set the working directory
WORKDIR /app
# Copy only the built files from the builder stage
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public

COPY package*.json ./
# Install only production dependencies (no devDependencies in the final image to keep it smaller)
RUN npm ci --omit=dev
# Set environment variables for production
ENV NODE_ENV=production
# Expose the application port
EXPOSE 3000
# Command to run the application
CMD ["npm", "start"]
