# Social Media Content Orchestrator

A production-ready Python system for automated social media content generation and publishing using specialized AI agents.

## Overview

The orchestrator manages 4 specialized agents that work in sequence:

1. **News Agent** - Fetches latest news and trending topics from multiple APIs (NewsAPI, Reddit, Hacker News, Twitter/X)
2. **Content Agent** - Uses LLMs (OpenAI GPT-4 or Anthropic Claude) to generate platform-optimized social media posts
3. **Image Agent** - Generates images using DALL-E 3 or Stable Diffusion
4. **Publishing Agent** - Posts content to multiple social media platforms via their APIs

## Features

- ✅ **Async/await** for parallel operations
- ✅ **SQLite database** for pipeline state persistence
- ✅ **Comprehensive logging** with rotation
- ✅ **Retry logic** with exponential backoff (max 3 attempts)
- ✅ **Rate limiting** for all external APIs
- ✅ **Dry-run mode** for testing without posting
- ✅ **Content approval queue** for human review
- ✅ **Analytics tracking** for post performance
- ✅ **Graceful shutdown** handling
- ✅ **Scheduling** with APScheduler for optimal posting times
- ✅ **Unit tests** for each agent

## Quick Start

### 1. Install Dependencies

```bash
cd orchestrator
pip install -r requirements.txt
```

### 2. Configure API Keys

Copy the environment template and fill in your API keys:

```bash
cp .env.template .env
# Edit .env with your API keys
```

Required for full functionality:
- **NewsAPI** - For news retrieval (free tier: 100 requests/day)
- **OpenAI** - For content generation (GPT-4) and images (DALL-E 3)
- **Twitter/X** - For posting to Twitter
- **LinkedIn** - For posting to LinkedIn
- **Instagram** - Via Facebook Graph API
- **Facebook** - For posting to Facebook Pages

### 3. Run the Orchestrator

```bash
# Dry-run mode (no actual posting)
python -m orchestrator --dry-run

# Run once with specific keywords
python -m orchestrator --keywords "AI" "technology" --dry-run

# Run with scheduler at optimal posting times
python -m orchestrator --schedule

# Run in interactive mode
python -m orchestrator --interactive
```

## Usage Examples

### Basic Usage

```python
import asyncio
from orchestrator import Orchestrator
from orchestrator.config import Config
from orchestrator.models import Platform, Tone

async def main():
    # Create orchestrator with default config
    orchestrator = Orchestrator()
    
    # Run pipeline in dry-run mode
    result = await orchestrator.run_pipeline(
        keywords=["AI", "technology"],
        platforms=[Platform.TWITTER, Platform.LINKEDIN],
        tone=Tone.PROFESSIONAL,
        dry_run=True,
    )
    
    print(f"Generated {len(result.posts)} posts")
    print(f"Published {len(result.publish_results)} results")

asyncio.run(main())
```

### With Content Approval

```python
async def main_with_approval():
    orchestrator = Orchestrator()
    
    # Queue posts for approval
    result = await orchestrator.run_pipeline(
        require_approval=True,
    )
    
    # Review pending posts
    queue = orchestrator.get_approval_queue()
    for item in queue:
        print(f"Post: {item.post.content[:100]}...")
        
        # Approve or reject
        await orchestrator.approve_post(item.post_id, approved=True)
```

### Scheduled Execution

```bash
# Schedule runs at optimal posting times (from config)
python -m orchestrator --schedule

# Or configure custom times in config.json:
{
    "optimal_posting_times": ["09:00", "12:00", "17:00", "20:00"],
    "schedule_interval_hours": 6
}
```

## CLI Commands

```bash
# Run pipeline once
python -m orchestrator --dry-run

# Run with specific platforms
python -m orchestrator --platforms twitter linkedin --dry-run

# Run with specific tone
python -m orchestrator --tone casual --dry-run

# Enable approval mode
python -m orchestrator --approval-mode

# Show approval queue
python -m orchestrator --show-queue

# Approve a post
python -m orchestrator --approve-post POST_ID

# Reject a post
python -m orchestrator --reject-post POST_ID

# Show pipeline history
python -m orchestrator --history
```

## Configuration

### Environment Variables

See `.env.template` for all available options.

### JSON Config File

Create `config.json` for adjustable parameters:

```json
{
    "posts_per_news_item": 1,
    "images_per_post": 1,
    "max_posts_per_run": 10,
    "enabled_platforms": ["twitter", "linkedin", "instagram", "facebook"],
    "default_tone": "professional",
    "schedule_enabled": true,
    "optimal_posting_times": ["09:00", "12:00", "17:00", "20:00"],
    "blocked_keywords": ["spam", "inappropriate"],
    "required_keywords": [],
    "dry_run_mode": false,
    "require_approval": false
}
```

## File Structure

```
/orchestrator
    /agents
        __init__.py
        base_agent.py          # Base class for all agents
        news_agent.py          # News retrieval (NewsAPI, Reddit, HN, Twitter)
        content_agent.py       # Content generation (OpenAI, Anthropic)
        image_agent.py         # Image generation (DALL-E, Stable Diffusion)
        publish_agent.py       # Publishing (Twitter, LinkedIn, Instagram, FB)
    /models
        __init__.py
        data_models.py         # Pydantic models for data validation
    /utils
        __init__.py
        api_helpers.py         # Rate limiting, caching, retry logic
        logger.py              # Logging with rotation
    /tests
        __init__.py
        test_news_agent.py
        test_content_agent.py
        test_image_agent.py
        test_publish_agent.py
        test_orchestrator.py
    __init__.py
    config.py                  # Configuration management
    config.json                # Sample configuration
    orchestrator.py            # Core orchestrator class
    main.py                    # CLI entry point
    requirements.txt           # Python dependencies
    .env.template              # Environment variable template
```

## Data Models

### NewsItem
```python
NewsItem(
    topic: str,              # Main topic or headline
    source: str,             # Source (NewsAPI, Reddit, etc.)
    url: HttpUrl,            # Original URL
    summary: str,            # Brief summary
    keywords: List[str],     # Extracted keywords
    timestamp: datetime,     # When retrieved
    relevance_score: float,  # 0-1 relevance score
)
```

### SocialPost
```python
SocialPost(
    post_id: str,            # Unique identifier
    content: str,            # Post text with hashtags
    platform: Platform,      # twitter, linkedin, instagram, facebook, tiktok
    hashtags: List[str],     # Hashtags
    image_prompt: str,       # Prompt for image generation
    tone: Tone,              # casual, professional, playful, inspirational
    call_to_action: str,     # Optional CTA
)
```

### PublishResult
```python
PublishResult(
    post_id: str,            # Internal post ID
    platform: Platform,      # Target platform
    status: PublishStatus,   # queued, published, failed, pending_review
    post_url: HttpUrl,       # URL of published post
    error_message: str,      # Error if failed
    retry_count: int,        # Number of retries
)
```

## Error Handling

The orchestrator implements graceful fallbacks:

| Agent | Failure Mode | Fallback |
|-------|-------------|----------|
| News Agent | API error | Retry after 30s delay |
| Content Agent | LLM unavailable | Template-based posts |
| Image Agent | Generation fails | Stock images from Unsplash |
| Publishing Agent | Max retries | Queue for manual review |

## Running Tests

```bash
cd orchestrator
pip install pytest pytest-asyncio pytest-cov

# Run all tests
pytest tests/ -v

# Run with coverage
pytest tests/ --cov=. --cov-report=html

# Run specific test file
pytest tests/test_news_agent.py -v
```

## Platform-Specific Limits

| Platform | Max Characters | Max Hashtags | Image Required |
|----------|---------------|--------------|----------------|
| Twitter | 280 | 5 | No |
| LinkedIn | 3000 | 5 | No |
| Instagram | 2200 | 30 | Yes |
| Facebook | 63206 | 10 | No |
| TikTok | 2200 | 10 | Yes |

## Image Dimensions by Platform

| Platform | Dimensions |
|----------|------------|
| Twitter | 1200x675, 1200x1200 |
| LinkedIn | 1200x627, 1200x1200 |
| Instagram | 1080x1080, 1080x1350, 1080x1920 |
| Facebook | 1200x630, 1200x1200 |
| TikTok | 1080x1920 |

## License

This project is part of the social-media-content repository. See the main LICENSE file for details.

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request
