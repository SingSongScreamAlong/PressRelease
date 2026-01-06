# ReadAllAboutIt - DigitalOcean Deployment Guide

## Quick Start

### 1. Create DigitalOcean Droplet

1. Go to [DigitalOcean](https://cloud.digitalocean.com/droplets/new)
2. Choose **Docker on Ubuntu 22.04** from Marketplace
3. Select **Basic $12/mo** (2GB RAM, 1 vCPU)
4. Choose region closest to your audience
5. Add your SSH key
6. Create Droplet

### 2. Point Domain to Droplet

In your domain registrar (Namecheap, GoDaddy, etc.):
- Add **A Record**: `@` → Your Droplet IP
- Add **A Record**: `www` → Your Droplet IP

Wait 5-10 minutes for DNS propagation.

### 3. Deploy

```bash
# SSH into your Droplet
ssh root@YOUR_DROPLET_IP

# Clone your repository
git clone https://github.com/YOUR_USERNAME/PressRelease.git
cd PressRelease

# Make deploy script executable
chmod +x deploy.sh

# Run deployment
./deploy.sh
```

The script will ask for:
- Your domain name
- Email for SSL certificates
- OpenAI API key
- WordPress admin password

### 4. Configure AdSense

1. Visit `https://yourdomain.com/wp-admin`
2. Go to **Site Kit → Dashboard**
3. Connect your Google account
4. Apply for AdSense at https://www.google.com/adsense
5. Once approved, ads will auto-display

## Useful Commands

```bash
# View engine logs
docker compose -f docker-compose.prod.yml logs -f engine

# Run content generation manually
docker compose -f docker-compose.prod.yml exec engine npm run run:once

# Add keywords
docker compose -f docker-compose.prod.yml exec engine npm run seed -- --file ./seeds.csv

# Stop all services
docker compose -f docker-compose.prod.yml down

# Restart services
docker compose -f docker-compose.prod.yml up -d
```

## Cost Breakdown

| Service | Monthly Cost |
|---------|-------------|
| DigitalOcean Droplet | $12 |
| Domain | ~$1 |
| OpenAI API | ~$5-20 (depends on articles) |
| **Total** | **~$18-33/month** |

## Troubleshooting

### SSL not working
Wait 5 minutes after deployment. Check logs:
```bash
docker logs nginx-proxy-acme
```

### Articles not publishing
Check engine logs and verify WordPress credentials:
```bash
docker compose -f docker-compose.prod.yml logs engine
```

### WordPress 401 errors
Regenerate application password:
```bash
docker compose -f docker-compose.prod.yml exec wordpress wp --allow-root user application-password create admin NewEngine --porcelain
```
Update `.env` with new password and restart engine.
