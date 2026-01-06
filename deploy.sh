#!/bin/bash
# ReadAllAboutIt - DigitalOcean Deployment Script
# Run this on a fresh Docker Droplet

set -e

echo "🚀 ReadAllAboutIt Deployment Script"
echo "===================================="

# Check if running as root
if [ "$EUID" -ne 0 ]; then
  echo "Please run as root (sudo ./deploy.sh)"
  exit 1
fi

# Get configuration from user
read -p "Enter your domain name (e.g., example.com): " DOMAIN
read -p "Enter your email for SSL certificates: " EMAIL
read -p "Enter your OpenAI API key: " OPENAI_KEY
read -p "Enter WordPress admin password: " WP_ADMIN_PASS

# Validate inputs
if [ -z "$DOMAIN" ] || [ -z "$EMAIL" ] || [ -z "$OPENAI_KEY" ]; then
  echo "❌ All fields are required"
  exit 1
fi

echo ""
echo "📦 Installing dependencies..."
apt-get update
apt-get install -y git

echo ""
echo "📁 Setting up application directory..."
mkdir -p /opt/readallaboutit
cd /opt/readallaboutit

# Clone or update repository
if [ -d ".git" ]; then
  echo "Updating existing installation..."
  git pull
else
  echo "Cloning repository..."
  # If no git repo, copy files from current directory
  cp -r /root/PressRelease/* . 2>/dev/null || echo "Using local files"
fi

echo ""
echo "🔧 Creating production environment file..."
cat > .env << EOF
# Production Environment - ReadAllAboutIt
NODE_ENV=production

# Database
POSTGRES_USER=engine
POSTGRES_PASSWORD=$(openssl rand -base64 32 | tr -dc 'a-zA-Z0-9' | head -c 32)
POSTGRES_DB=readallaboutit

# WordPress Database
WORDPRESS_DB_USER=wordpress
WORDPRESS_DB_PASSWORD=$(openssl rand -base64 32 | tr -dc 'a-zA-Z0-9' | head -c 32)
WORDPRESS_DB_NAME=wordpress

# OpenAI
OPENAI_API_KEY=${OPENAI_KEY}
OPENAI_MODEL=gpt-4o-mini
AI_PROVIDER=openai

# WordPress
WP_URL=https://${DOMAIN}
WP_USERNAME=admin
WP_ADMIN_PASSWORD=${WP_ADMIN_PASS}
WP_APP_PASSWORD=WILL_BE_SET_AFTER_INSTALL

# Engine Settings
PUBLISH_MODE=draft
DAILY_PUBLISH_LIMIT=5
SAFE_TOPICS_ONLY=true
CRON_SCHEDULE=0 */4 * * *
LOG_LEVEL=info

# Domain
DOMAIN=${DOMAIN}
EMAIL=${EMAIL}
EOF

echo ""
echo "🐳 Creating production Docker Compose..."
cat > docker-compose.prod.yml << 'EOF'
services:
  # Nginx Proxy with automatic SSL
  nginx-proxy:
    image: nginxproxy/nginx-proxy
    container_name: nginx-proxy
    restart: always
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - /var/run/docker.sock:/tmp/docker.sock:ro
      - certs:/etc/nginx/certs
      - vhost:/etc/nginx/vhost.d
      - html:/usr/share/nginx/html
    networks:
      - webproxy

  # SSL Certificate Manager
  acme-companion:
    image: nginxproxy/acme-companion
    container_name: nginx-proxy-acme
    restart: always
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - certs:/etc/nginx/certs
      - vhost:/etc/nginx/vhost.d
      - html:/usr/share/nginx/html
      - acme:/etc/acme.sh
    environment:
      - DEFAULT_EMAIL=${EMAIL}
    depends_on:
      - nginx-proxy
    networks:
      - webproxy

  # WordPress Database
  wordpress-db:
    image: mariadb:10.6
    container_name: readallaboutit-wordpress-db
    restart: always
    environment:
      MYSQL_ROOT_PASSWORD: ${WORDPRESS_DB_PASSWORD}
      MYSQL_DATABASE: ${WORDPRESS_DB_NAME}
      MYSQL_USER: ${WORDPRESS_DB_USER}
      MYSQL_PASSWORD: ${WORDPRESS_DB_PASSWORD}
    volumes:
      - wordpress_db_data:/var/lib/mysql
    networks:
      - internal

  # WordPress
  wordpress:
    image: wordpress:latest
    container_name: readallaboutit-wordpress
    restart: always
    environment:
      WORDPRESS_DB_HOST: wordpress-db
      WORDPRESS_DB_USER: ${WORDPRESS_DB_USER}
      WORDPRESS_DB_PASSWORD: ${WORDPRESS_DB_PASSWORD}
      WORDPRESS_DB_NAME: ${WORDPRESS_DB_NAME}
      VIRTUAL_HOST: ${DOMAIN}
      LETSENCRYPT_HOST: ${DOMAIN}
    volumes:
      - wordpress_data:/var/www/html
    depends_on:
      - wordpress-db
    networks:
      - internal
      - webproxy

  # PostgreSQL for Engine
  postgres:
    image: postgres:15-alpine
    container_name: readallaboutit-postgres
    restart: always
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - internal

  # Content Engine
  engine:
    build:
      context: ./apps/engine
      dockerfile: Dockerfile
    container_name: readallaboutit-engine
    restart: always
    environment:
      NODE_ENV: production
      DATABASE_URL: postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}
      AI_PROVIDER: ${AI_PROVIDER:-openai}
      OPENAI_API_KEY: ${OPENAI_API_KEY}
      OPENAI_MODEL: ${OPENAI_MODEL:-gpt-4o-mini}
      WP_URL: http://wordpress
      WP_USERNAME: ${WP_USERNAME}
      WP_APP_PASSWORD: ${WP_APP_PASSWORD}
      PUBLISH_MODE: ${PUBLISH_MODE:-draft}
      DAILY_PUBLISH_LIMIT: ${DAILY_PUBLISH_LIMIT:-5}
      SAFE_TOPICS_ONLY: ${SAFE_TOPICS_ONLY:-true}
      CRON_SCHEDULE: ${CRON_SCHEDULE:-0 */4 * * *}
      LOG_LEVEL: ${LOG_LEVEL:-info}
      SCHEDULER_ENABLED: "true"
    depends_on:
      - postgres
      - wordpress
    networks:
      - internal

volumes:
  wordpress_db_data:
  wordpress_data:
  postgres_data:
  certs:
  vhost:
  html:
  acme:

networks:
  internal:
  webproxy:
EOF

echo ""
echo "🚀 Starting services..."
docker compose -f docker-compose.prod.yml up -d

echo ""
echo "⏳ Waiting for WordPress to initialize (60 seconds)..."
sleep 60

echo ""
echo "🔧 Installing WP-CLI and configuring WordPress..."
docker compose -f docker-compose.prod.yml exec -T wordpress bash -c '
  curl -sO https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar
  chmod +x wp-cli.phar
  mv wp-cli.phar /usr/local/bin/wp
'

# Check if WordPress is installed
WP_INSTALLED=$(docker compose -f docker-compose.prod.yml exec -T wordpress wp --allow-root core is-installed 2>&1 && echo "yes" || echo "no")

if [ "$WP_INSTALLED" != "yes" ]; then
  echo "📝 Installing WordPress..."
  docker compose -f docker-compose.prod.yml exec -T wordpress wp --allow-root core install \
    --url="https://${DOMAIN}" \
    --title="ReadAllAboutIt" \
    --admin_user="admin" \
    --admin_password="${WP_ADMIN_PASS}" \
    --admin_email="${EMAIL}"
fi

echo ""
echo "🔌 Installing WordPress plugins..."
docker compose -f docker-compose.prod.yml exec -T wordpress wp --allow-root plugin install ad-inserter google-site-kit --activate

echo ""
echo "🔗 Setting up permalinks..."
docker compose -f docker-compose.prod.yml exec -T wordpress wp --allow-root rewrite structure '/%postname%/'

echo ""
echo "🔑 Creating Application Password..."
APP_PASS=$(docker compose -f docker-compose.prod.yml exec -T wordpress wp --allow-root user application-password create admin ReadAllAboutItEngine --porcelain)
echo "Application Password: $APP_PASS"

# Update .env with app password
sed -i "s/WP_APP_PASSWORD=.*/WP_APP_PASSWORD=${APP_PASS}/" .env

echo ""
echo "🔄 Restarting engine with new credentials..."
docker compose -f docker-compose.prod.yml up -d engine

echo ""
echo "✅ Deployment Complete!"
echo "========================"
echo ""
echo "🌐 Your site: https://${DOMAIN}"
echo "🔐 WordPress Admin: https://${DOMAIN}/wp-admin"
echo "   Username: admin"
echo "   Password: ${WP_ADMIN_PASS}"
echo ""
echo "📊 Next Steps:"
echo "1. Visit https://${DOMAIN}/wp-admin"
echo "2. Go to Site Kit → Connect Google Account"
echo "3. Apply for AdSense at https://www.google.com/adsense"
echo "4. Configure Ad Inserter for ad placements"
echo ""
echo "📝 Useful Commands:"
echo "   View logs: docker compose -f docker-compose.prod.yml logs -f engine"
echo "   Run once:  docker compose -f docker-compose.prod.yml exec engine npm run run:once"
echo "   Stop:      docker compose -f docker-compose.prod.yml down"
