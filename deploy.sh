#!/bin/bash

#################################################
# PostmanXodja Automated Deployment Script
# For Ubuntu/Debian servers
# Domain: postbaby.uz
#################################################

set -e  # Exit on any error

DOMAIN="postbaby.uz"
APP_DIR="/opt/postmanxodja"
BACKEND_PORT=8080
FRONTEND_PORT=3000
# REMOVE: DB_NAME="postmanxodja"
# REMOVE: DB_USER="postmanxodja_user"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

#################################################
# Check if running as root
#################################################
if [ "$EUID" -ne 0 ]; then
    log_error "Please run as root (use sudo)"
    exit 1
fi

log_info "Starting deployment for $DOMAIN..."

#################################################
# Update system
#################################################
log_info "Updating system packages..."
apt-get update
apt-get upgrade -y

#################################################
# Install Node.js
#################################################
if ! command -v node &> /dev/null; then
    log_info "Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
else
    log_info "Node.js already installed"
fi

#################################################
# Install Nginx
#################################################
if ! command -v nginx &> /dev/null; then
    log_info "Installing Nginx..."
    apt-get install -y nginx
    systemctl start nginx
    systemctl enable nginx
else
    log_info "Nginx already installed"
fi

#################################################
# Install Certbot
#################################################
if ! command -v certbot &> /dev/null; then
    log_info "Installing Certbot..."
    apt-get install -y certbot python3-certbot-nginx
else
    log_info "Certbot already installed"
fi

#################################################
# Install Go (if needed for backend)
#################################################
if ! command -v go &> /dev/null; then
    log_info "Installing Go..."
    GO_VERSION="1.21.5"
    wget "https://go.dev/dl/go${GO_VERSION}.linux-amd64.tar.gz"
    rm -rf /usr/local/go
    tar -C /usr/local -xzf "go${GO_VERSION}.linux-amd64.tar.gz"
    rm "go${GO_VERSION}.linux-amd64.tar.gz"

    # Add Go to PATH
    if ! grep -q "/usr/local/go/bin" /etc/profile; then
        echo "export PATH=\$PATH:/usr/local/go/bin" >> /etc/profile
    fi
    export PATH=$PATH:/usr/local/go/bin
else
    log_info "Go already installed"
fi

#################################################
# Install and Configure PostgreSQL
#################################################
if ! command -v psql &> /dev/null; then
    log_info "Installing PostgreSQL..."
    apt-get install -y postgresql postgresql-contrib
    systemctl start postgresql
    systemctl enable postgresql
else
    log_info "PostgreSQL already installed"
fi

# Configure PostgreSQL database and user
log_info "Configuring PostgreSQL database..."

# Trim function to remove whitespace and newlines
trim_pg() {
    echo "$1" | tr -d '\n\r' | xargs
}

# Set default values if not provided and trim
POSTGRES_USER="$(trim_pg "${POSTGRES_USER:-postgres}")"
POSTGRES_PASSWORD="$(trim_pg "${POSTGRES_PASSWORD:-changeme}")"
POSTGRES_DB="$(trim_pg "${POSTGRES_DB:-postmanxodja}")"

# Check if database exists, create if not
sudo -u postgres psql -lqt | cut -d \| -f 1 | grep -qw "$POSTGRES_DB" || {
    log_info "Creating database: $POSTGRES_DB"
    sudo -u postgres psql -c "CREATE DATABASE $POSTGRES_DB;"
}

# Create user if it doesn't exist and set password
if [ "$POSTGRES_USER" != "postgres" ]; then
    sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='$POSTGRES_USER'" | grep -q 1 || {
        log_info "Creating PostgreSQL user: $POSTGRES_USER"
        sudo -u postgres psql -c "CREATE USER $POSTGRES_USER WITH PASSWORD '$POSTGRES_PASSWORD';"
    }
    # Always update password in case it changed
    log_info "Updating PostgreSQL user password..."
    sudo -u postgres psql -c "ALTER USER $POSTGRES_USER WITH PASSWORD '$POSTGRES_PASSWORD';"

    # Grant privileges
    log_info "Granting privileges..."
    sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $POSTGRES_DB TO $POSTGRES_USER;"
else
    # If using default postgres user, set the password
    log_info "Setting password for postgres user..."
    sudo -u postgres psql -c "ALTER USER postgres WITH PASSWORD '$POSTGRES_PASSWORD';"
fi

log_info "PostgreSQL configured successfully"

#################################################
# Install and Configure Grafana
#################################################
if ! command -v grafana-server &> /dev/null; then
    log_info "Installing Grafana..."
    apt-get install -y apt-transport-https software-properties-common wget
    wget -q -O /usr/share/keyrings/grafana.key https://apt.grafana.com/gpg.key
    echo "deb [signed-by=/usr/share/keyrings/grafana.key] https://apt.grafana.com stable main" > /etc/apt/sources.list.d/grafana.list
    apt-get update
    apt-get install -y grafana
else
    log_info "Grafana already installed"
fi

log_info "Configuring Grafana..."
cat > /etc/grafana/grafana.ini << 'GRAFANA_EOF'
[server]
http_port = 3001
root_url = %(protocol)s://%(domain)s/grafana
serve_from_sub_path = true

[security]
allow_embedding = true

[auth.anonymous]
enabled = true
org_role = Viewer

[users]
allow_sign_up = false
GRAFANA_EOF

systemctl daemon-reload
systemctl enable grafana-server
systemctl restart grafana-server
log_info "Grafana running on port 3001"

#################################################
# Install InfluxDB v1 (k6 metrics storage)
#################################################
if ! command -v influxd &> /dev/null; then
    log_info "Installing InfluxDB v1..."
    wget -q https://dl.influxdata.com/influxdb/releases/influxdb_1.8.10_amd64.deb
    dpkg -i influxdb_1.8.10_amd64.deb
    rm -f influxdb_1.8.10_amd64.deb
else
    log_info "InfluxDB already installed"
fi

systemctl enable influxdb
systemctl start influxdb
sleep 3

# Create k6 database in InfluxDB
influx -execute "CREATE DATABASE k6" 2>/dev/null || true
log_info "InfluxDB ready with k6 database"

#################################################
# Install k6 with browser support
#################################################
if ! command -v k6 &> /dev/null; then
    log_info "Installing k6..."
    gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg \
        --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69 2>/dev/null || true
    echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" > /etc/apt/sources.list.d/k6.list
    apt-get update
    apt-get install -y k6
    # Install Chromium for k6 browser module
    apt-get install -y chromium-browser 2>/dev/null || apt-get install -y chromium 2>/dev/null || true
else
    log_info "k6 already installed"
fi

#################################################
# Provision Grafana datasource + k6 dashboard
#################################################
log_info "Provisioning Grafana datasources and dashboards..."

mkdir -p /etc/grafana/provisioning/datasources
cat > /etc/grafana/provisioning/datasources/influxdb.yml << 'PROV_EOF'
apiVersion: 1
datasources:
  - name: InfluxDB
    type: influxdb
    access: proxy
    url: http://localhost:8086
    database: k6
    isDefault: true
    editable: true
PROV_EOF

mkdir -p /etc/grafana/provisioning/dashboards
cat > /etc/grafana/provisioning/dashboards/k6.yml << 'PROV_EOF'
apiVersion: 1
providers:
  - name: k6
    folder: Performance
    type: file
    options:
      path: /var/lib/grafana/dashboards
PROV_EOF

mkdir -p /var/lib/grafana/dashboards

# Download official k6 Load Testing Results dashboard (2587) — raw JSON for file provisioning
curl -sf "https://grafana.com/api/dashboards/2587/revisions/latest/download" \
    -o /var/lib/grafana/dashboards/k6.json 2>/dev/null && \
    log_info "k6 dashboard downloaded" || \
    log_warn "Could not download k6 dashboard — import manually from grafana.com/dashboards/2587"

chown -R grafana:grafana /var/lib/grafana/dashboards 2>/dev/null || true

systemctl restart grafana-server
log_info "Grafana provisioned with InfluxDB datasource and k6 dashboard"

#################################################
# Create application directory
#################################################
log_info "Setting up application directory..."
mkdir -p $APP_DIR
cd $APP_DIR

#################################################
# Copy files from /tmp
#################################################
log_info "Copying application files..."
if [ -d "/tmp/postmanxodja" ]; then
    cp -r /tmp/postmanxodja/* $APP_DIR/ 2>/dev/null || true
    cp -r /tmp/postmanxodja/.* $APP_DIR/ 2>/dev/null || true
fi

#################################################
# Create/Update .env file
#################################################
log_info "Configuring environment variables..."

# Trim function to remove whitespace and newlines
trim() {
    echo "$1" | tr -d '\n\r' | xargs
}

# Set default values if not provided and trim whitespace
_POSTGRES_USER="$(trim "${POSTGRES_USER:-postgres}")"
_POSTGRES_PASSWORD="$(trim "${POSTGRES_PASSWORD}")"
_POSTGRES_DB="$(trim "${POSTGRES_DB:-postmanxodja}")"
_POSTGRES_HOST="$(trim "${POSTGRES_HOST:-localhost}")"
_SMTP_PORT="$(trim "${SMTP_PORT:-587}")"
_SMTP_FROM="$(trim "${SMTP_FROM:-PostmanXodja <noreply@$DOMAIN>}")"
GOOGLE_CLIENT_ID="$(trim "${GOOGLE_CLIENT_ID}")"
GOOGLE_CLIENT_SECRET="$(trim "${GOOGLE_CLIENT_SECRET}")"
SMTP_HOST="$(trim "${SMTP_HOST}")"
SMTP_USERNAME="$(trim "${SMTP_USERNAME}")"
SMTP_PASSWORD="$(trim "${SMTP_PASSWORD}")"

# Build DATABASE_URL with actual values
_DATABASE_URL="host=${_POSTGRES_HOST} user=${_POSTGRES_USER} password=${_POSTGRES_PASSWORD} dbname=${_POSTGRES_DB} port=5432 sslmode=disable"

cat > $APP_DIR/.env << EOF
# Application Configuration
NODE_ENV=production

# Database Configuration
POSTGRES_USER=${_POSTGRES_USER}
POSTGRES_PASSWORD=${_POSTGRES_PASSWORD}
POSTGRES_DB=${_POSTGRES_DB}
POSTGRES_HOST=${_POSTGRES_HOST}
POSTGRES_PORT=5432

# Constructed DATABASE_URL (used by backend)
DATABASE_URL=${_DATABASE_URL}

# Frontend Configuration
VITE_API_URL=https://$DOMAIN/api

# Google OAuth
GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}
GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET}
GOOGLE_REDIRECT_URL=https://$DOMAIN/api/auth/google/callback

# Application URLs
FRONTEND_URL=https://$DOMAIN

# Email Configuration
SMTP_HOST=${SMTP_HOST}
SMTP_PORT=${_SMTP_PORT}
SMTP_FROM=${_SMTP_FROM}
SMTP_USERNAME=${SMTP_USERNAME}
SMTP_PASSWORD=${SMTP_PASSWORD}
EOF

log_info ".env file configured"
log_info "Verifying environment variables (sanitized)..."
log_info "  POSTGRES_USER: ${_POSTGRES_USER}"
log_info "  POSTGRES_DB: ${_POSTGRES_DB}"
log_info "  POSTGRES_HOST: ${_POSTGRES_HOST}"
log_info "  POSTGRES_PASSWORD: $([ -n "$_POSTGRES_PASSWORD" ] && echo "***SET***" || echo "NOT_SET")"
log_info "  GOOGLE_CLIENT_ID: $([ -n "$GOOGLE_CLIENT_ID" ] && echo "***SET***" || echo "NOT_SET")"
log_info "  SMTP_HOST: $([ -n "$SMTP_HOST" ] && echo "${SMTP_HOST}" || echo "NOT_SET")"

#################################################
# Copy k6 scripts
#################################################
log_info "Setting up k6 scripts..."
mkdir -p $APP_DIR/k6
if [ -d "$APP_DIR/k6" ]; then
    chmod +x $APP_DIR/k6/*.js 2>/dev/null || true
fi

#################################################
# Build Frontend
#################################################
log_info "Building frontend..."
cd $APP_DIR/frontend

# Create/overwrite frontend .env with production values
log_info "Creating frontend .env with production API URL..."
cat > $APP_DIR/frontend/.env << EOF
VITE_API_URL=https://$DOMAIN/api
EOF

log_info "Building with VITE_API_URL=https://$DOMAIN/api"
npm install --legacy-peer-deps
npm run build

#################################################
# Build Backend (if Go backend exists)
#################################################
if [ -f "$APP_DIR/backend/main.go" ]; then
    log_info "Building backend..."
    cd $APP_DIR/backend
    export PATH=$PATH:/usr/local/go/bin
    go mod download
    go build -o postmanxodja main.go
    chmod +x postmanxodja
fi

#################################################
# Create systemd service for backend
#################################################
if [ -f "$APP_DIR/backend/postmanxodja" ]; then
    log_info "Creating systemd service..."

    cat > /etc/systemd/system/postmanxodja-backend.service << EOF
[Unit]
Description=PostmanXodja Backend Service
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=$APP_DIR/backend
EnvironmentFile=$APP_DIR/.env
ExecStart=$APP_DIR/backend/postmanxodja
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

    # Set proper permissions
    chown -R www-data:www-data $APP_DIR
    chmod 600 $APP_DIR/.env 2>/dev/null || true

    # Reload and restart backend service
    systemctl daemon-reload
    systemctl enable postmanxodja-backend
    systemctl restart postmanxodja-backend
fi

#################################################
# Configure Nginx
#################################################
log_info "Configuring Nginx..."

# Check if SSL certificate exists to determine which config to write
if [ -d "/etc/letsencrypt/live/$DOMAIN" ]; then
    log_info "SSL certificate exists, writing HTTPS nginx config..."

    cat > /etc/nginx/sites-available/postmanxodja << 'EOF'
server {
    listen 80;
    server_name postbaby.uz www.postbaby.uz;

    # Redirect all HTTP to HTTPS
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name postbaby.uz www.postbaby.uz;

    ssl_certificate /etc/letsencrypt/live/postbaby.uz/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/postbaby.uz/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    # Increase client body size for file uploads
    client_max_body_size 50M;

    # Frontend - serve static files
    location / {
        root /opt/postmanxodja/frontend/dist;
        try_files $uri $uri/ /index.html;

        # Cache static assets
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }

    # Backend API
    location /api {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # MCP server — streamable HTTP + SSE, must be before the / catch-all
    location /mcp {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 86400s;
    }

    # Grafana dashboard
    location /grafana/ {
        proxy_pass http://localhost:3001/grafana/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /grafana {
        return 301 /grafana/;
    }
}
EOF
else
    log_info "No SSL certificate yet, writing HTTP-only nginx config..."

    cat > /etc/nginx/sites-available/postmanxodja << 'EOF'
server {
    listen 80;
    server_name postbaby.uz www.postbaby.uz;

    # Increase client body size for file uploads
    client_max_body_size 50M;

    # Frontend - serve static files
    location / {
        root /opt/postmanxodja/frontend/dist;
        try_files $uri $uri/ /index.html;

        # Cache static assets
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }

    # Backend API
    location /api {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # MCP server — streamable HTTP + SSE, must be before the / catch-all
    location /mcp {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 86400s;
    }

    # Grafana dashboard
    location /grafana/ {
        proxy_pass http://localhost:3001/grafana/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /grafana {
        return 301 /grafana/;
    }
}
EOF
fi

# Enable site
ln -sf /etc/nginx/sites-available/postmanxodja /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Test nginx configuration
nginx -t

# Reload nginx
systemctl reload nginx

#################################################
# Setup SSL with Certbot
#################################################
log_info "Setting up SSL certificates..."

# Check if certificate already exists
if [ ! -d "/etc/letsencrypt/live/$DOMAIN" ]; then
    log_info "Obtaining SSL certificate for $DOMAIN..."

    # Get email for certificate notifications (from env or use a default)
    # Trim whitespace and newlines from CERT_EMAIL
    CERT_EMAIL="$(echo "${CERT_EMAIL:-admin@$DOMAIN}" | tr -d '\n\r' | xargs)"

    log_info "Using email for SSL: $CERT_EMAIL"

    # Obtain certificate
    certbot --nginx -d "$DOMAIN" -d "www.$DOMAIN" \
        --non-interactive \
        --agree-tos \
        --email "$CERT_EMAIL" \
        --redirect

    if [ $? -eq 0 ]; then
        log_info "✓ SSL certificate obtained successfully"
    else
        log_warn "⚠ Failed to obtain SSL certificate. Site will work on HTTP only."
        log_warn "  You can run 'sudo certbot --nginx -d $DOMAIN' manually later."
    fi
else
    log_info "SSL certificate already exists, checking renewal..."
    certbot renew --quiet || log_warn "Certificate renewal check failed"
fi

#################################################
# Final checks
#################################################
log_info "Running final checks..."

# Check nginx status
if systemctl is-active --quiet nginx; then
    log_info "✓ Nginx is running"
else
    log_error "✗ Nginx is not running"
fi

# Check if frontend is built
if [ -d "$APP_DIR/frontend/dist" ]; then
    log_info "✓ Frontend is built"
else
    log_error "✗ Frontend build not found"
fi

# Check backend status if exists
if [ -f "/etc/systemd/system/postmanxodja-backend.service" ]; then
    if systemctl is-active --quiet postmanxodja-backend; then
        log_info "✓ Backend service is running"
    else
        log_error "✗ Backend service is not running"
    fi
fi

# Check Grafana status
if systemctl is-active --quiet grafana-server; then
    log_info "✓ Grafana is running"
else
    log_error "✗ Grafana is not running"
fi

#################################################
# Display summary
#################################################
echo ""
echo "=========================================="
log_info "Deployment completed successfully!"
echo "=========================================="
echo ""
echo "Application URLs:"
echo "  Frontend: https://$DOMAIN"
echo "  Backend:  https://$DOMAIN/api"
echo ""
echo "Service status:"
echo "  Nginx:   systemctl status nginx"
if [ -f "/etc/systemd/system/postmanxodja-backend.service" ]; then
    echo "  Backend: systemctl status postmanxodja-backend"
fi
echo ""
echo "=========================================="