# News API Integration Guide

This document explains the `/news` backend endpoint implementation and real news API integration for the Content Planner application.

## Overview

The news API integration fetches real-time trending topics from multiple sources to automatically generate relevant, timely social media content. The system uses a cascade approach, trying multiple news sources with automatic fallback.

## Architecture

### News Sources (in priority order)

1. **NewsAPI.org** - Comprehensive news aggregator
2. **GNews** - Alternative news API
3. **Hacker News** - Tech-focused trending stories
4. **Reddit** - Community-driven trending content

### Cascade Strategy

The system attempts each news source in order, automatically falling back to the next if one fails. If all external sources fail, it uses intelligent day-based fallback topics.

## API Integration Details

### 1. NewsAPI.org Integration

**File**: `src/lib/news-api.ts` → `fetchFromNewsAPI()`

**Features**:
- Top headlines by country
- Category filtering
- Real-time news articles
- Source attribution

**Configuration**:
```typescript
{
  newsApiKey: 'your-api-key-here',
  newsCountry: 'us',  // Country code
  newsCategories: ['technology', 'business', 'entertainment']
}
```

**API Endpoint**: `https://newsapi.org/v2/top-headlines`

**Get Your API Key**: https://newsapi.org/register

### 2. GNews Integration

**File**: `src/lib/news-api.ts` → `fetchFromGNews()`

**Features**:
- Global news coverage
- Multi-language support
- Fast response times
- High reliability

**Configuration**:
```typescript
{
  gNewsApiKey: 'your-api-key-here',
  newsLanguage: 'en',
  newsCountry: 'us'
}
```

**API Endpoint**: `https://gnews.io/api/v4/top-headlines`

**Get Your API Key**: https://gnews.io

### 3. Hacker News Integration

**File**: `src/lib/news-api.ts` → `fetchFromHackerNews()`

**Features**:
- No API key required
- Tech-focused content
- High-quality tech stories
- Real-time scores and comments

**API Endpoint**: `https://hacker-news.firebaseio.com/v0/topstories.json`

**Documentation**: https://github.com/HackerNews/API

### 4. Reddit Integration

**File**: `src/lib/news-api.ts` → `fetchFromRedditAPI()`

**Features**:
- No API key required
- Community-driven trends
- Multiple subreddit support
- Upvote/comment metrics

**API Endpoint**: `https://www.reddit.com/r/{subreddit}/hot.json`

**Subreddits Used**: technology, science, worldnews, business, futurology

## Data Flow

```
User requests daily content
        ↓
Daily Content Generator (daily-content-generator.ts)
        ↓
News API (news-api.ts) - Cascade through sources
        ↓
[NewsAPI → GNews → Hacker News → Reddit → Fallback]
        ↓
Trending Topics extracted and categorized
        ↓
Ollama generates captions
        ↓
Grok generates images (optional)
        ↓
Complete content ideas returned to user
```

## Configuration

### Auto-Discovery Settings

Add news API keys to Auto-Discovery settings:

```typescript
interface AutoDiscoverySettings {
  // Existing settings...
  newsApiKey?: string
  gNewsApiKey?: string
  newsLanguage?: string  // 'en', 'es', 'fr', etc.
  newsCountry?: string   // 'us', 'uk', 'ca', etc.
}
```

### Setting API Keys

1. Open the Content Planner app
2. Click "Auto-Discovery" button
3. Scroll to "News API Configuration"
4. Enter your API keys:
   - NewsAPI Key (optional)
   - GNews API Key (optional)
5. Configure language and country preferences
6. Save settings

**Note**: API keys are optional. The system will automatically use free sources (Hacker News, Reddit) if paid API keys are not provided.

## Content Generation Process

### 1. Fetch Trending News

```typescript
const topics = await fetchTrendingNews({
  newsApiKey,
  gNewsApiKey,
  categories: ['technology', 'business'],
  language: 'en',
  country: 'us'
})
```

### 2. Generate Content from News

For each trending topic:
1. Extract article details (title, description, source)
2. Categorize content (Technology, Health, Business, etc.)
3. Generate content angle
4. Create Ollama prompt with news context
5. Generate caption with news hooks
6. Generate image with Grok (if enabled)

### 3. Result Structure

```typescript
{
  topic: "Specific News Event",
  category: "Technology",
  relevance: "Breaking news with 50k mentions",
  articles: [{
    title: "News Article Title",
    description: "Article summary",
    url: "https://...",
    source: "News Source",
    publishedAt: "2024-01-15T10:00:00Z"
  }],
  suggestedContentAngle: "How this impacts daily life"
}
```

## Intelligent Features

### 1. Topic Extraction

Extracts key phrases from headlines using NLP techniques:
- Removes stop words
- Identifies significant terms
- Groups related articles

### 2. Content Categorization

Automatically categorizes topics:
- Technology
- Health & Wellness
- Business
- Entertainment
- Science
- Lifestyle
- Food
- Travel

### 3. Day-Based Fallbacks

If all APIs fail, uses contextual fallback topics based on day of week:
- **Monday**: Motivation & Productivity
- **Tuesday**: Tech Trends
- **Wednesday**: Midweek Energy Boosters
- **Thursday**: #ThrowbackThursday
- **Friday**: Weekend Plans
- **Saturday**: Adventure Ideas
- **Sunday**: Self-Care Routines

### 4. Content Angle Generation

Generates unique angles based on category:
- Technology: "How this impacts daily life"
- Health: "Practical tips you can start today"
- Business: "Lessons entrepreneurs can learn"
- Entertainment: "Behind the scenes insights"

## API Rate Limits

### NewsAPI.org (Free Tier)
- 100 requests per day
- 500 requests per day (Developer plan)
- Rate: 1 request per second

### GNews (Free Tier)
- 100 requests per day
- 10,000 requests per month (Pro plan)

### Hacker News
- No rate limit
- Free to use

### Reddit
- 60 requests per minute (unauthenticated)
- Free to use

## Best Practices

### 1. API Key Management
- Store API keys in Auto-Discovery settings
- Keys are persisted in browser localStorage
- Never commit API keys to version control

### 2. Caching Strategy
- Daily content is cached by date
- Cache key: `daily-content-{YYYY-MM-DD}`
- Reduces API calls
- Improves performance

### 3. Error Handling
- Graceful degradation through cascade
- Automatic fallback to free sources
- Day-based intelligent fallbacks
- User-friendly error messages

### 4. Content Freshness
- Cache expires daily at midnight
- "Refresh" button forces new API calls
- Auto-discovery runs on schedule

## Testing

### Test Without API Keys

The system works without any API keys:

```typescript
const topics = await fetchTrendingNews()
// Uses Hacker News → Reddit → Fallback
```

### Test With Specific Source

```typescript
// Test NewsAPI
const topics = await fetchFromNewsAPI({ 
  newsApiKey: 'test-key',
  country: 'us'
})

// Test GNews
const topics = await fetchFromGNews({
  gNewsApiKey: 'test-key',
  language: 'en'
})

// Test Hacker News (no key needed)
const topics = await fetchFromHackerNews()

// Test Reddit (no key needed)
const topics = await fetchFromRedditAPI()
```

## Troubleshooting

### Issue: No news content generated

**Solutions**:
1. Check browser console for errors
2. Verify API keys are correct
3. Check API rate limits
4. Try refreshing to force new fetch
5. System should fallback to free sources automatically

### Issue: Generic content instead of news

**Cause**: All API sources failed, using fallback topics

**Solutions**:
1. Add valid API keys for NewsAPI or GNews
2. Check internet connection
3. Verify APIs are not down (check status pages)

### Issue: Old/stale content

**Solutions**:
1. Click "Refresh" button to generate new content
2. Clear cache: Open DevTools → Application → Local Storage → Delete cache keys
3. Wait until next day (cache expires at midnight)

## Advanced Configuration

### Custom News Categories

```typescript
const settings = {
  newsApiKey: 'your-key',
  newsCategories: ['technology', 'science', 'health'],
  newsCountry: 'us',
  newsLanguage: 'en'
}
```

### Multi-Language Support

```typescript
const settings = {
  gNewsApiKey: 'your-key',
  newsLanguage: 'es',  // Spanish
  newsCountry: 'mx'    // Mexico
}
```

### Subreddit Customization

Edit `src/lib/news-api.ts` → `fetchFromRedditAPI()`:

```typescript
const subreddits = [
  'technology',
  'programming',
  'startups',
  'webdev'
]
```

## Performance Optimization

### 1. Parallel Fetching
When generating multiple content pieces, articles are fetched in parallel.

### 2. Smart Caching
- Daily cache reduces redundant API calls
- Cache invalidation at midnight
- Per-item regeneration doesn't affect cache

### 3. Cascade Efficiency
- Fast sources tried first
- Immediate fallback on failure
- No waiting for timeouts

## Security Considerations

1. **API Keys**: Stored in browser localStorage (secure for client-side apps)
2. **CORS**: All APIs support cross-origin requests
3. **Rate Limiting**: Respect API rate limits to avoid blocking
4. **Data Privacy**: No user data sent to news APIs

## Future Enhancements

Potential improvements:
1. **More News Sources**: Add MediaStack, Currents API
2. **Backend Proxy**: Server-side API key management
3. **Webhook Integration**: Real-time news updates
4. **Sentiment Analysis**: Filter news by sentiment
5. **Personalization**: Learn user preferences over time
6. **Trending Hashtags**: Extract trending hashtags from news
7. **Multi-Topic Mixing**: Combine multiple topics in one post

## Support

For issues or questions:
1. Check this documentation
2. Review code comments in `src/lib/news-api.ts`
3. Check browser console for error messages
4. Test with free sources (Hacker News, Reddit) first

## API Documentation Links

- **NewsAPI**: https://newsapi.org/docs
- **GNews**: https://gnews.io/docs/v4
- **Hacker News**: https://github.com/HackerNews/API
- **Reddit JSON**: https://github.com/reddit-archive/reddit/wiki/JSON

---

**Last Updated**: January 2024
**Version**: 1.0.0
