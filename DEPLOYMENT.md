# PostmanXodja Deployment Guide

## 🔒 Security Setup

All sensitive configuration is stored in `.env` file which is **NOT committed to Git**.

## Local Development Setup

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd postmanxodja
   ```

2. **Create your `.env` file**
   ```bash
   cp .env.example .env
   ```

3. **Edit `.env` and fill in your values**
   ```bash
   nano .env  # or vim, vscode, etc.
   ```

4. **Start development environment**
   ```bash
   docker-compose -f docker-compose.dev.yml up
   ```

## Production Deployment

### Prerequisites
- Docker and Docker Compose installed
- Domain name configured (for production URLs)
- SSL certificate (Let's Encrypt recommended)

### Step 1: Clone on Server

```bash
# SSH into your server
ssh user@your-server.com

# Clone repository
git clone <your-repo-url>
cd postmanxodja
```

### Step 2: Create Production `.env`

```bash
cp .env.example .env
nano .env
```

**Important Production Settings:**

```env
# Strong database password!
POSTGRES_PASSWORD=use_a_very_strong_password_here

# Your production domain
FRONTEND_URL=https://yourdomain.com
GOOGLE_REDIRECT_URL=https://yourdomain.com/api/auth/google/callback
VITE_API_URL=https://yourdomain.com/api

# Email settings (Namecheap Private Email example)
SMTP_HOST=mail.privateemail.com
SMTP_PORT=465
SMTP_FROM=PostmanXodja <noreply@yourdomain.com>
SMTP_USERNAME=noreply@yourdomain.com
SMTP_PASSWORD=your_email_password
```

### Step 3: Build and Run

```bash
# Build and start all services
docker-compose up -d

# Check logs
docker-compose logs -f

# Check status
docker-compose ps
```

### Step 4: Setup Nginx Reverse Proxy (Recommended)

Create `/etc/nginx/sites-available/postmanxodja`:

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    # Redirect to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    # Frontend
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Backend API
    location /api {
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # MCP server (streamable HTTP + SSE — must come before the / catch-all)
    location /mcp {
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 86400s;
    }
}
```

Enable and restart:
```bash
sudo ln -s /etc/nginx/sites-available/postmanxodja /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### Step 5: Setup SSL with Let's Encrypt

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

## Updating the Application

When you make changes and push to GitHub:

```bash
# On server
cd postmanxodja
git pull

# Rebuild and restart
docker-compose down
docker-compose up -d --build

# Or for zero-downtime:
docker-compose up -d --build --no-deps backend
docker-compose up -d --build --no-deps frontend
```

## Environment Variables Reference

| Variable | Description | Example |
|----------|-------------|---------|
| `POSTGRES_USER` | Database username | `postgres` |
| `POSTGRES_PASSWORD` | Database password (use strong password!) | `secure_random_password_123` |
| `POSTGRES_DB` | Database name | `postmanxodja` |
| `POSTGRES_HOST` | Database host (use `postgres` for Docker) | `postgres` or `localhost` |
| `POSTGRES_PORT` | Database port | `5432` |
| `DATABASE_URL` | Full database connection string | `host=postgres user=postgres password=...` |
| `VITE_API_URL` | Frontend API URL | `https://yourdomain.com/api` |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID | From Google Console |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret | From Google Console |
| `GOOGLE_REDIRECT_URL` | OAuth callback URL | `https://yourdomain.com/api/auth/google/callback` |
| `FRONTEND_URL` | Frontend URL for emails | `https://yourdomain.com` |
| `SMTP_HOST` | Email server hostname | `mail.privateemail.com` |
| `SMTP_PORT` | Email server port | `465` (SSL) or `587` (TLS) |
| `SMTP_FROM` | From address for emails | `App <noreply@domain.com>` |
| `SMTP_USERNAME` | SMTP username | `noreply@domain.com` |
| `SMTP_PASSWORD` | SMTP password | From email provider |

## Security Checklist

- [ ] `.env` file is in `.gitignore`
- [ ] Strong database password set
- [ ] HTTPS enabled in production
- [ ] Firewall configured (only ports 80, 443, 22 open)
- [ ] Google OAuth redirect URL matches production domain
- [ ] Email SMTP credentials are correct
- [ ] Regular backups of database configured
- [ ] Update DMARC record to `p=quarantine` for email deliverability

## Backup Database

```bash
# Backup
docker exec postmanxodja-db pg_dump -U postgres postmanxodja > backup_$(date +%Y%m%d).sql

# Restore
docker exec -i postmanxodja-db psql -U postgres postmanxodja < backup.sql
```

## Troubleshooting

### Check logs
```bash
docker-compose logs backend
docker-compose logs frontend
docker-compose logs postgres
```

### Restart services
```bash
docker-compose restart backend
docker-compose restart frontend
```

### Clean rebuild
```bash
docker-compose down -v
docker-compose up -d --build
```

### Database connection issues
- Verify `DATABASE_URL` matches postgres credentials
- Check postgres is running: `docker-compose ps`
- Check postgres logs: `docker-compose logs postgres`

## Support

For issues, check the logs first, then refer to the main README.md or create an issue on GitHub.
