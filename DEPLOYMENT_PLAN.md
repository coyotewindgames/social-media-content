# Deployment Plan — Hetzner CX22

## Infrastructure

| Item | Spec |
|------|------|
| Provider | Hetzner Cloud |
| Plan | CX22 |
| Resources | 2 vCPU, 4 GB RAM, 40 GB SSD |
| OS | Ubuntu 24.04 LTS |
| Cost | ~$5.50/mo |
| Region | Falkenstein (fsn1) or Nuremberg (nbg1) |

## Architecture

```
Internet
  │
  ▼
┌───────────────┐
│  Caddy :80/443│  ← auto-HTTPS via Let's Encrypt
└──────┬────────┘
       │ reverse_proxy
       ▼
┌───────────────┐
│  App :3001    │  ← Express serves API + Vite frontend
└──────┬────────┘
       │ http://ollama:11434
       ▼
┌───────────────┐
│  Ollama       │  ← local LLM (llama3.2)
└───────────────┘
```

All three services run via **Docker Compose**.

## Files Created

| File | Purpose |
|------|---------|
| `Dockerfile` | Multi-stage build: frontend (Vite) → backend (tsc) → slim Node 20 Alpine runtime |
| `docker-compose.yml` | 3 services: `app`, `ollama`, `caddy` with named volumes |
| `Caddyfile` | Reverse proxy config with auto-HTTPS |
| `.dockerignore` | Excludes node_modules, dist, logs, .env from Docker context |
| `.env.example` | Template for all environment variables |

## Modified Files

| File | Change |
|------|--------|
| `orchestrator-node/src/server.ts` | Added `import path`, production static serving + SPA fallback |

## Deployment Steps

### 1. Provision the Server

1. Create a Hetzner Cloud account at [console.hetzner.cloud](https://console.hetzner.cloud)
2. Create a CX22 server with Ubuntu 24.04
3. Add your SSH key during creation

### 2. Initial Server Setup

```bash
ssh root@YOUR_SERVER_IP

# Update system
apt update && apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sh

# Install Docker Compose plugin
apt install docker-compose-plugin -y

# Create deploy user
adduser deploy
usermod -aG docker deploy

# Set up firewall
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

### 3. Deploy the Application

```bash
# Switch to deploy user
su - deploy

# Clone repo
git clone https://github.com/YOUR_USER/social-media-content.git
cd social-media-content

# Configure environment
cp .env.example .env
nano .env   # Fill in your API keys and set DOMAIN=yourdomain.com

# Build and start
docker compose up -d --build

# Pull the Ollama model (first time only)
docker compose exec ollama ollama pull llama3.2
```

### 4. DNS Setup

Point your domain's A record to the server's IP address. Caddy will automatically obtain a Let's Encrypt certificate once DNS propagates.

### 5. Verify

```bash
# Check all services are running
docker compose ps

# Check logs
docker compose logs -f app

# Test health endpoint
curl https://yourdomain.com/api/health
```

## Updating

```bash
cd social-media-content
git pull
docker compose up -d --build
```

## Monitoring

```bash
# Service status
docker compose ps

# App logs
docker compose logs -f app

# Ollama logs
docker compose logs -f ollama

# Resource usage
docker stats
```

## Cost Breakdown

| Item | Monthly |
|------|---------|
| Hetzner CX22 | $5.50 |
| Domain (optional) | ~$1.00 |
| Supabase (free tier) | $0 |
| **Total** | **~$6.50** |
