# Backend Deployment Guide

This guide explains how to deploy the backend API for the Social Media Content Orchestrator.

## Architecture Overview

```
┌─────────────────┐     ┌─────────────────┐
│  Netlify        │     │  Backend Host   │
│  (Frontend)     │────▶│  (API Server)   │
│  dist/          │     │  :3001          │
└─────────────────┘     └────────┬────────┘
                                 │
                        ┌────────▼────────┐
                        │  Supabase       │
                        │  (Database)     │
                        └─────────────────┘
```

## Quick Start

### Option A: Docker Deployment (Recommended)

The repository includes a `Dockerfile` that builds both frontend and backend into a single image.

1. **Build the Docker image:**
   ```bash
   docker build -t social-media-orchestrator .
   ```

2. **Run the container:**
   ```bash
   docker run -d \
     -p 3001:3001 \
     --env-file .env \
     --name orchestrator \
     social-media-orchestrator
   ```

3. **Test the health endpoint:**
   ```bash
   curl http://localhost:3001/api/health
   ```

### Option B: GitHub Container Registry (GHCR)

The repository includes a GitHub Actions workflow that automatically builds and pushes the Docker image to GHCR on every push to `main`.

1. **Pull the image:**
   ```bash
   docker pull ghcr.io/coyotewindgames/social-media-content:latest
   ```

2. **Run the container:**
   ```bash
   docker run -d \
     -p 3001:3001 \
     --env-file .env \
     --name orchestrator \
     ghcr.io/coyotewindgames/social-media-content:latest
   ```

### Option C: Manual Node.js Deployment

1. **Build the backend:**
   ```bash
   cd orchestrator-node
   npm ci
   npm run build
   ```

2. **Run the server:**
   ```bash
   NODE_ENV=production node dist/server.js
   ```

3. **Using PM2 (recommended for production):**
   ```bash
   npm install -g pm2
   pm2 start dist/server.js --name orchestrator
   pm2 save
   pm2 startup
   ```

## Deployment Platforms

### Railway

1. Create a new project on [Railway](https://railway.app)
2. Connect your GitHub repository
3. Add environment variables from `.env.example`
4. Railway will auto-detect the Dockerfile and deploy

**Set the start command:**
```
cd orchestrator-node && node dist/server.js
```

### Render

1. Create a new Web Service on [Render](https://render.com)
2. Connect your GitHub repository
3. Use the following settings:
   - **Build Command:** (leave empty, uses Dockerfile)
   - **Dockerfile Path:** `Dockerfile`
4. Add environment variables from `.env.example`

### Fly.io

1. Install the Fly CLI and authenticate
2. Initialize the app:
   ```bash
   fly launch
   ```
3. Deploy:
   ```bash
   fly deploy
   ```
4. Set secrets:
   ```bash
   fly secrets set SUPABASE_URL=your-url SUPABASE_ANON_KEY=your-key ...
   ```

### DigitalOcean App Platform

1. Create a new App on DigitalOcean
2. Connect your GitHub repository
3. Select "Dockerfile" as the build method
4. Add environment variables from `.env.example`

## Connecting Frontend to Backend

Once the backend is deployed, update the frontend to use the backend's public URL.

### Option 1: Environment Variable (Netlify)

1. Go to your Netlify site settings
2. Navigate to **Site settings** → **Build & deploy** → **Environment**
3. Add the variable:
   ```
   VITE_API_URL=https://your-backend-url.railway.app/api
   ```
4. Trigger a redeploy

### Option 2: Local .env File

For local development with a remote backend:
```bash
# .env.local
VITE_API_URL=https://your-backend-url.railway.app/api
```

## Environment Variables

Required environment variables for the backend:

| Variable | Description | Required |
|----------|-------------|----------|
| `SUPABASE_URL` | Supabase project URL | Yes |
| `SUPABASE_ANON_KEY` | Supabase anon key | Yes |
| `API_PORT` | Port to run the server on (default: 3001) | No |
| `NODE_ENV` | Environment (`production` or `development`) | No |
| `OLLAMA_ENDPOINT` | Ollama API endpoint for local LLM | No |
| `OPENAI_API_KEY` | OpenAI API key for GPT models | No |
| `ANTHROPIC_API_KEY` | Anthropic API key for Claude | No |

See `.env.example` for the full list of available environment variables.

## Testing the Deployment

1. **Health check:**
   ```bash
   curl https://your-backend-url/api/health
   # Expected: {"status":"ok","timestamp":"..."}
   ```

2. **Config status:**
   ```bash
   curl https://your-backend-url/api/config/status
   # Returns which services are configured
   ```

3. **Test frontend connection:**
   - Open your frontend URL
   - Check browser console for API errors
   - The dashboard should show "Backend Connected"

## Troubleshooting

### CORS Issues

The backend is configured to allow CORS from any origin. If you still see CORS errors:

1. Check that your frontend is using the correct API URL
2. Verify the backend is running and accessible
3. Check the CSP headers in `netlify.toml`

### Connection Refused

1. Verify the backend container is running:
   ```bash
   docker ps
   ```
2. Check container logs:
   ```bash
   docker logs orchestrator
   ```
3. Ensure port 3001 is exposed and mapped correctly

### Missing Environment Variables

If the backend starts but features don't work:

1. Check the `/api/config/status` endpoint
2. Verify all required environment variables are set
3. Restart the container after adding new variables

## Full Docker Compose Setup

For a complete deployment with Caddy (HTTPS) and Ollama (local LLM):

```bash
# 1. Copy and configure environment
cp .env.example .env
nano .env  # Fill in your values

# 2. Set your domain
export DOMAIN=your-domain.com

# 3. Start all services
docker compose up -d

# 4. Check status
docker compose ps
docker compose logs -f app
```

This starts:
- **app**: Backend API server on port 3001
- **ollama**: Local LLM server
- **caddy**: Reverse proxy with auto-HTTPS
