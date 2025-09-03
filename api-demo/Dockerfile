# Use nginx to serve the static files
FROM nginx:alpine

# Install bash for our startup script
RUN apk add --no-cache bash

# Copy your static files (HTML, CSS, JS, etc.)
COPY ./public /usr/share/nginx/html

# Copy the entrypoint script
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Set default environment variables
ENV CC_ORIGIN=https://citycatalyst.io/
ENV CLIENT_ID=doesnotexist

# Expose port 80
EXPOSE 80

# Use our custom entrypoint
ENTRYPOINT ["/entrypoint.sh"]