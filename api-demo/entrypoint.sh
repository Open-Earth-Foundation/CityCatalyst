#!/bin/sh

cat > /usr/share/nginx/html/config.js << EOF
export const config = {
  "CC_ORIGIN": "${CC_ORIGIN}",
  "CLIENT_ID": "${CLIENT_ID}"
};
EOF

echo "Generated config.js with:"
echo "  CC_ORIGIN: ${CC_ORIGIN}"
echo "  CLIENT_ID: ${CLIENT_ID}"

exec nginx -g 'daemon off;'