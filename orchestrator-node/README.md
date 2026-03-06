# Social Media Content Orchestrator (Node.js/TypeScript)

A production-ready Node.js/TypeScript system for automated social media content generation and publishing using specialized AI agents with Supabase for data persistence.

## Overview

The orchestrator manages 4 specialized agents that work in sequence:

1. **NewsAgent** - Fetches latest news and trending topics from NewsAPI, Reddit, Hacker News, and Twitter/X
2. **ContentAgent** - Uses LLMs (OpenAI GPT-4 or Anthropic Claude) to generate platform-optimized social media posts
3. **ImageAgent** - Generates images using DALL-E 3 or Stability AI (Stable Diffusion)
4. **PublishAgent** - Posts content to Twitter, LinkedIn, Instagram, Facebook, and TikTok

## Features

- ✅ **Async/await** throughout using native Node.js promises
- ✅ **Supabase database** for pipeline state persistence and analytics
- ✅ **Comprehensive logging** with rotation
- ✅ **Retry logic** with exponential backoff (max 3 attempts)
- ✅ **Rate limiting** for all external APIs
- ✅ **Response caching** to avoid duplicate API calls
- ✅ **Dry-run mode** for testing without posting
- ✅ **Content approval queue** for human review
- ✅ **Analytics tracking** for post performance
- ✅ **Graceful shutdown** handling (SIGINT/SIGTERM)
- ✅ **Scheduling** with node-cron for optimal posting times
- ✅ **TypeScript** with full type safety

## Quick Start

### 1. Set Up Supabase

Create a new Supabase project at [supabase.com](https://supabase.com) and run the schema:

```bash
# Copy the SQL from supabase-schema.sql to your Supabase SQL Editor
# This creates: pipeline_runs, approval_queue, analytics tables
```

### 2. Install Dependencies

```bash
cd orchestrator-node
npm install
```

### 3. Configure Environment Variables

```bash
cp .env.template .env
# Edit .env with your Supabase URL, keys, and API credentials
```

Required Supabase variables:
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
```

### 4. Build and Run

```bash
# Build TypeScript
npm run build

# Run in dry-run mode
npm start -- --dry-run

# Or run directly with ts-node
npm run dev -- --dry-run
```

## Usage

### CLI Commands

```bash
# Run pipeline once in dry-run mode
npm start -- --dry-run

# Run with specific keywords
npm start -- --keywords "AI" "technology" --dry-run

# Run with specific platforms
npm start -- --platforms twitter linkedin --dry-run

# Run with specific tone
npm start -- --tone casual --dry-run

# Run with scheduler at optimal times
npm start -- --schedule

# Enable approval mode
npm start -- --approval-mode

# Show approval queue
npm start -- --show-queue

# Approve a post
npm start -- --approve-post POST_ID

# Reject a post
npm start -- --reject-post POST_ID

# Show pipeline history
npm start -- --history
```

### Programmatic Usage

```typescript
import { Orchestrator, Platform, Tone } from './src';

async function main() {
  // Create orchestrator with default config
  const orchestrator = new Orchestrator();

  // Run pipeline in dry-run mode
  const result = await orchestrator.runPipeline({
    keywords: ['AI', 'technology'],
    platforms: [Platform.TWITTER, Platform.LINKEDIN],
    tone: Tone.PROFESSIONAL,
    dryRun: true,
  });

  console.log(`Generated ${result.posts.length} posts`);
  console.log(`Published ${result.publishResults.length} results`);

  // Clean up
  orchestrator.close();
}

main();
```

### With Content Approval

```typescript
async function mainWithApproval() {
  const orchestrator = new Orchestrator();

  // Queue posts for approval
  await orchestrator.runPipeline({
    requireApproval: true,
  });

  // Review pending posts
  const queue = orchestrator.getApprovalQueue();
  for (const item of queue) {
    console.log(`Post: ${item.post.content.slice(0, 100)}...`);

    // Approve or reject
    await orchestrator.approvePost(item.postId, true);
  }

  orchestrator.close();
}
```

## Configuration

### Environment Variables

See `.env.template` for all available options:

| Variable | Description |
|----------|-------------|
| `NEWSAPI_KEY` | NewsAPI key for news retrieval |
| `OPENAI_API_KEY` | OpenAI key for GPT-4 and DALL-E 3 |
| `ANTHROPIC_API_KEY` | Anthropic key for Claude |
| `STABILITY_API_KEY` | Stability AI key for Stable Diffusion |
| `TWITTER_*` | Twitter/X API credentials |
| `LINKEDIN_*` | LinkedIn API credentials |
| `INSTAGRAM_*` | Instagram API credentials |
| `FACEBOOK_*` | Facebook API credentials |

### JSON Config File

Create `config.json` for adjustable parameters:

```json
{
  "postsPerNewsItem": 1,
  "imagesPerPost": 1,
  "maxPostsPerRun": 10,
  "enabledPlatforms": ["twitter", "linkedin", "instagram", "facebook"],
  "defaultTone": "professional",
  "scheduleEnabled": true,
  "optimalPostingTimes": ["09:00", "12:00", "17:00", "20:00"],
  "dryRunMode": false,
  "requireApproval": false
}
```

## File Structure

```
/orchestrator-node
    /src
        /agents
            baseAgent.ts        # Base class for all agents
            newsAgent.ts        # News retrieval agent
            contentAgent.ts     # Content generation agent
            imageAgent.ts       # Image generation agent
            publishAgent.ts     # Publishing agent
            index.ts
        /models
            types.ts            # TypeScript types and interfaces
            index.ts
        /utils
            logger.ts           # Logging with rotation
            apiHelpers.ts       # Rate limiting, caching, retry logic
            index.ts
        config.ts               # Configuration management
        orchestrator.ts         # Core orchestrator class
        main.ts                 # CLI entry point
        index.ts                # Module exports
    /tests
        # Unit tests
    package.json
    tsconfig.json
    config.json                 # Sample configuration
    .env.template               # Environment variable template
    README.md
```

## Data Models

### NewsItem
```typescript
interface NewsItem {
  topic: string;           // Main topic or headline
  source: string;          // Source (NewsAPI, Reddit, etc.)
  url: string;             // Original URL
  summary: string;         // Brief summary
  keywords: string[];      // Extracted keywords
  timestamp: Date;         // When retrieved
  relevanceScore: number;  // 0-1 relevance score
}
```

### SocialPost
```typescript
interface SocialPost {
  postId: string;          // Unique identifier
  content: string;         // Post text with hashtags
  platform: Platform;      // twitter, linkedin, instagram, facebook, tiktok
  hashtags: string[];      // Hashtags
  imagePrompt?: string;    // Prompt for image generation
  tone: Tone;              // casual, professional, playful, inspirational
  callToAction?: string;   // Optional CTA
}
```

### PublishResult
```typescript
interface PublishResult {
  postId: string;          // Internal post ID
  platform: Platform;      // Target platform
  status: PublishStatus;   // queued, published, failed, pending_review
  postUrl?: string;        // URL of published post
  errorMessage?: string;   // Error if failed
  retryCount: number;      // Number of retries
}
```

## Error Handling

The orchestrator implements graceful fallbacks:

| Agent | Failure Mode | Fallback |
|-------|-------------|----------|
| NewsAgent | API error | Retry after 30s delay |
| ContentAgent | LLM unavailable | Template-based posts |
| ImageAgent | Generation fails | Stock images from Unsplash |
| PublishAgent | Max retries | Queue for manual review |

## Running Tests

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

## Platform Limits

| Platform | Max Characters | Max Hashtags | Image Required |
|----------|---------------|--------------|----------------|
| Twitter | 280 | 5 | No |
| LinkedIn | 3000 | 5 | No |
| Instagram | 2200 | 30 | Yes |
| Facebook | 63206 | 10 | No |
| TikTok | 2200 | 10 | Yes |

## Development

```bash
# Type check
npm run typecheck

# Lint
npm run lint

# Clean build
npm run clean && npm run build
```

## License

MIT
