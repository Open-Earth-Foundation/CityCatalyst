# Set the base image to Node
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install all dependencies
RUN npm install

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Expose the application on port 3000
EXPOSE 3000

# Start the application
CMD ["npm", "start"]
