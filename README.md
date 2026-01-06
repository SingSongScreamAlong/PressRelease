# ReadAllAboutIt

A headless, automated SEO content engine that discovers search demand, generates high-quality informational articles with AI, and publishes to WordPress.

## Features

- **Keyword Discovery**: Automatic query discovery using Google Autocomplete
- **Smart Scoring**: Intent, evergreen, and YMYL risk scoring
- **AI Content Generation**: OpenAI-powered article generation with safety guardrails
- **Quality Gates**: Structure, duplication, and citation checks
- **WordPress Publishing**: REST API integration with category/tag management
- **Content Refresh**: Automated updates to keep content fresh
- **Throttling**: Configurable daily publishing limits

## Quick Start

### Prerequisites

- Docker and Docker Compose
- OpenAI API key
- (Optional) Existing WordPress site with Application Password

### 1. Clone and Configure

```bash
git clone https://github.com/your-org/PressRelease.git
cd PressRelease

# Copy environment template
cp .env.example .env
```

### 2. Edit `.env` File

```bash
# Required
OPENAI_API_KEY=sk-your-key-here
WP_USERNAME=admin
WP_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx-xxxx-xxxx

# Optional (defaults shown)
PUBLISH_MODE=draft           # 'draft' or 'publish'
DAILY_PUBLISH_LIMIT=10       # Max posts per day
SAFE_TOPICS_ONLY=true        # Block YMYL topics
```

### 3. Start Services

```bash
# Start all containers
docker compose up -d

# Wait for WordPress to initialize (first run takes ~60 seconds)
docker compose logs -f wordpress

# Access WordPress at http://localhost:8080
```

### 4. Create WordPress Application Password

1. Go to `http://localhost:8080/wp-admin`
2. Login with admin credentials
3. Navigate to **Users → Your Profile**
4. Scroll to **Application Passwords**
5. Enter a name (e.g., "ReadAllAboutIt") and click **Add New**
6. Copy the generated password to your `.env` file

### 5. Seed Keywords and Run

```bash
# Enter the engine container
docker compose exec engine sh

# Seed keywords from CSV
npm run seed -- --file ./seeds.csv

# Run a single pipeline cycle
npm run run:once

# Or start the continuous worker
npm run worker
```

## Project Structure

```
/
├── docker-compose.yml       # Multi-service Docker setup
├── .env.example             # Environment template
├── README.md
│
├── /apps
│   └── /engine              # Node.js/TypeScript automation engine
│       ├── package.json
│       ├── tsconfig.json
│       ├── Dockerfile
│       ├── seeds.csv        # Sample keywords
│       └── /src
│           ├── index.ts           # Worker entry point
│           ├── config.ts          # Configuration
│           ├── db.ts              # PostgreSQL connection
│           ├── logger.ts          # Structured logging
│           ├── /scheduler         # Cron scheduling
│           ├── /providers
│           │   ├── /ai            # OpenAI integration
│           │   ├── /demand        # Google Autocomplete
│           │   └── /publishing    # WordPress REST API
│           ├── /pipeline          # Content pipeline
│           ├── /storage           # Database repository
│           └── /cli               # CLI commands
│
└── /infra
    ├── /wordpress           # WordPress config
    └── /db
        └── init.sql         # PostgreSQL schema
```

## CLI Commands

Run from the engine container or with `docker compose exec engine`:

| Command | Description |
|---------|-------------|
| `npm run seed -- --file ./seeds.csv` | Import keywords from CSV |
| `npm run run:once` | Run single pipeline cycle |
| `npm run worker` | Start continuous scheduler |
| `npm run backfill -- --action stats` | Show engine statistics |
| `npm run backfill -- --action discover` | Run discovery only |
| `npm run backfill -- --action refresh` | Refresh old posts |
| `npm test` | Run tests |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENAI_API_KEY` | (required) | OpenAI API key |
| `OPENAI_MODEL` | `gpt-4o-mini` | OpenAI model to use |
| `WP_URL` | `http://wordpress` | WordPress URL |
| `WP_USERNAME` | (required) | WordPress username |
| `WP_APP_PASSWORD` | (required) | WordPress Application Password |
| `PUBLISH_MODE` | `draft` | `draft` or `publish` |
| `DAILY_PUBLISH_LIMIT` | `10` | Max posts per day |
| `SAFE_TOPICS_ONLY` | `true` | Block YMYL topics |
| `CRON_SCHEDULE` | `0 */4 * * *` | Cron schedule (default: every 4 hours) |
| `LOG_LEVEL` | `info` | Logging level |

## Pipeline Flow

```
1. Discovery
   └── Fetch Google Autocomplete suggestions for each keyword
   └── Normalize and deduplicate queries
   └── Score: intent, evergreen, YMYL risk
   └── Store in database

2. Generation
   └── Select top-scoring pending queries
   └── Generate article outline with AI
   └── Generate full article content
   └── Run quality gate checks
   └── Add internal links

3. Publishing
   └── Create/assign WordPress categories
   └── Publish via REST API
   └── Log to database

4. Refresh (runs if no new content)
   └── Find posts due for refresh
   └── Regenerate content
   └── Update WordPress post
```

## Safety Guardrails

The engine includes multiple safety mechanisms:

- **YMYL Detection**: Flags health, finance, legal, and safety topics
- **SAFE_TOPICS_ONLY Mode**: Completely blocks YMYL content
- **Banned Phrases**: Rejects content with "as an expert", "guaranteed", etc.
- **Mandatory Sections**: All articles include disclaimers and source references
- **Quality Gate**: Validates structure, word count, and content requirements

## Deployment to DigitalOcean

### Create Droplet

```bash
# 1. Create droplet (Ubuntu 22.04, 2GB RAM minimum)
# 2. SSH into droplet
ssh root@your-droplet-ip

# 3. Install Docker
curl -fsSL https://get.docker.com | sh
apt install docker-compose-plugin

# 4. Clone repository
git clone https://github.com/your-org/PressRelease.git
cd PressRelease

# 5. Configure environment
cp .env.example .env
nano .env  # Edit with production values

# 6. Start services
docker compose up -d
```

### Point to External WordPress

To use an existing WordPress site instead of the local container:

```bash
# In .env
WP_URL=https://your-wordpress-site.com
WP_USERNAME=your-user
WP_APP_PASSWORD=your-app-password

# Disable local WordPress in docker-compose.yml
# Comment out the wordpress and wordpress-db services
```

### Running 24/7

The engine runs continuously with the built-in cron scheduler. To customize:

```bash
# Change schedule in .env
CRON_SCHEDULE=0 6 * * *  # Run daily at 6 AM

# Restart engine
docker compose restart engine
```

### Moving to External Scheduler

For production, consider using:

1. **DigitalOcean Functions** - Serverless cron
2. **GitHub Actions** - Scheduled workflows
3. **Kubernetes CronJob** - For K8s deployments

## Sample Generated Article

```html
<h1>How to Renew Your Passport: A Complete Guide</h1>

<p>Renewing your passport typically takes 6-8 weeks through 
standard processing. You can apply by mail if your passport 
is undamaged and was issued within the last 15 years.</p>

<div class="table-of-contents">
  <h2>Table of Contents</h2>
  <ul>
    <li><a href="#eligibility-requirements">Eligibility Requirements</a></li>
    <li><a href="#required-documents">Required Documents</a></li>
    <li><a href="#step-by-step-process">Step-by-Step Process</a></li>
  </ul>
</div>

<h2 id="eligibility-requirements">Eligibility Requirements</h2>
<p>To renew by mail, you generally need to meet these criteria...</p>

<!-- More sections... -->

<h2>Frequently Asked Questions</h2>
<h3>How long does passport renewal take?</h3>
<p>Standard processing typically takes 6-8 weeks...</p>

<div class="disclaimer">
<h2>Disclaimer</h2>
<p>This article is for informational purposes only. 
Always verify requirements with official sources.</p>
</div>

<div class="sources">
<h2>Sources</h2>
<p>Information based on publicly available resources.</p>
</div>
```

## Troubleshooting

### WordPress Connection Failed

```bash
# Check WordPress is running
docker compose ps

# Test REST API
curl http://localhost:8080/wp-json/wp/v2/posts

# Verify credentials
docker compose exec engine sh
curl -u "admin:your-app-password" http://wordpress/wp-json/wp/v2/users/me
```

### Database Connection Failed

```bash
# Check PostgreSQL
docker compose logs postgres

# Connect manually
docker compose exec postgres psql -U engine -d readallaboutit
```

### OpenAI API Errors

```bash
# Check API key is set
docker compose exec engine printenv | grep OPENAI

# Test connection
docker compose exec engine node -e "
  const OpenAI = require('openai');
  const client = new OpenAI();
  client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{role: 'user', content: 'Hello'}]
  }).then(r => console.log('OK')).catch(e => console.error(e));
"
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests: `npm test`
5. Submit a pull request

## License

MIT
