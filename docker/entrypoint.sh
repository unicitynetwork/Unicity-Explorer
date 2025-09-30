#!/bin/sh
set -e

# Ensure nginx conf.d directory exists
mkdir -p /etc/nginx/conf.d

# Check if SSL certificates are mounted
SSL_ENABLED=false
if [ -f "/etc/nginx/ssl/fullchain.pem" ] && [ -f "/etc/nginx/ssl/privkey.pem" ]; then
    SSL_ENABLED=true
    echo "SSL certificates detected, enabling HTTPS"
    
    # Get domain from environment or use default
    DOMAIN="${SSL_DOMAIN:-localhost}"
    
    # Create nginx SSL configuration
    cat > /etc/nginx/conf.d/default.conf << EOF
server {
    listen 80;
    server_name _;
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name _;
    
    ssl_certificate /etc/nginx/ssl/fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/privkey.pem;
    
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    
    client_max_body_size 100M;
    proxy_connect_timeout 600;
    proxy_send_timeout 600;
    proxy_read_timeout 600;
    send_timeout 600;
    
    location / {
        proxy_pass http://127.0.0.1:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF
else
    echo "No SSL certificates found, using HTTP only"
    
    # Create nginx HTTP-only configuration
    cat > /etc/nginx/conf.d/default.conf << EOF
server {
    listen 80;
    server_name _;
    
    client_max_body_size 100M;
    proxy_connect_timeout 600;
    proxy_send_timeout 600;
    proxy_read_timeout 600;
    send_timeout 600;
    
    location / {
        proxy_pass http://127.0.0.1:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto http;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF
fi

# Start nginx in background (as non-root, no daemon mode needed)
nginx -g "daemon off;" &

# Start the Node.js application
exec npm start