# Set the base image to Node
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install --omit=dev

# Copy source code
COPY . .

# Define build arguments for the environment variables needed at build time.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_OPENCLIMATE_API_URL

# Set those build arguments as environment variables so that the Next.js build process can see them.
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_OPENCLIMATE_API_URL=${NEXT_PUBLIC_OPENCLIMATE_API_URL}

# Build the application
RUN npm run build

# Expose the application on port 3000
EXPOSE 3000

# Start the application
CMD ["npm", "start"]
