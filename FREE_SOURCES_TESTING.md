# Free Sources Testing Guide

## Overview

The Content Planner now includes a comprehensive testing interface for free news and content sources, specifically **Hacker News** and **Reddit**. These sources provide trending topics without requiring API keys, making them ideal for development and testing purposes.

## Features

### 1. **Free Source Test Dialog**
Access the testing interface by clicking the "Test Sources" button in the header (green button with test tube icon).

### 2. **Supported Sources**

#### Hacker News API
- **Endpoint**: `https://hacker-news.firebaseio.com/v0/`
- **Cost**: Completely free, no API key required
- **Rate Limits**: Very generous, suitable for production use
- **Content Type**: Technology news, programming, startups, innovation
- **Data Provided**:
  - Top stories with scores and comment counts
  - Links to original articles
  - Discussion URLs on Hacker News
  - Timestamps for when stories were posted

#### Reddit API
- **Endpoint**: `https://www.reddit.com/r/{subreddit}/hot.json`
- **Cost**: Free for basic usage (no authentication required for public data)
- **Rate Limits**: 60 requests per minute per IP for unauthenticated requests
- **Content Type**: Varied based on subreddit (technology, science, business, etc.)
- **Subreddits Used**:
  - `r/technology` - Tech news and discussions
  - `r/programming` - Programming topics
  - `r/artificial` - AI and machine learning
  - `r/science` - Scientific discoveries
  - `r/futurology` - Future technology and trends
- **Data Provided**:
  - Post titles and descriptions
  - Upvote counts and comment counts
  - Links to original content
  - Thumbnail images when available

## How It Works

### Daily Content Generation Flow

1. **Fetch Trending News** (`fetchTrendingNews` in `news-api.ts`)
   - Attempts to fetch from multiple sources in priority order:
     1. NewsAPI (if API key configured)
     2. GNews API (if API key configured)
     3. **Hacker News** (always available - free)
     4. **Reddit** (always available - free)
   - Falls back to next source if current one fails
   - Uses fallback trending topics if all sources fail

2. **Process and Convert Data**
   - Extracts key phrases from titles
   - Categorizes content (Technology, Science, Business, etc.)
   - Generates relevance descriptions (score/upvotes, comment counts)
   - Suggests content angles for social media

3. **Generate Social Content**
   - Creates engaging captions using Ollama or OpenAI
   - Generates images using Grok (if configured)
   - Formats content for specific platforms (Instagram, TikTok, etc.)

### Testing Interface Features

#### Real-Time Status Monitoring
- **Testing State**: Shows animated indicator while fetching data
- **Success State**: Displays green checkmark with metrics
  - Number of topics found
  - Response time in milliseconds
- **Error State**: Shows red X with error message

#### Detailed Topic View
- Click on a source card to see all fetched topics
- Each topic displays:
  - Title and description
  - Category badge
  - Relevance metrics (scores, comments)
  - Link to original source
  - Content angle suggestion

#### Performance Metrics
- Response time tracking for each source
- Success/failure rates
- Data quality indicators

## Integration with Daily Trending Content

The free sources are automatically integrated into the "Daily Trending" tab:

1. **On Page Load**: Automatically fetches trending content from available sources
2. **Refresh Button**: Manually trigger new content generation
3. **Regenerate Per-Item**: Regenerate individual content cards
4. **Source Priority**: Prefers paid APIs (NewsAPI, GNews) but falls back to free sources seamlessly

## API Details

### Hacker News Implementation

```typescript
async function fetchFromHackerNews(): Promise<TrendingTopic[]> {
  // 1. Get top 500 story IDs
  const response = await fetch(
    'https://hacker-news.firebaseio.com/v0/topstories.json'
  )
  const storyIds = await response.json()
  
  // 2. Fetch details for top 15 stories
  const topStoryIds = storyIds.slice(0, 15)
  const storyPromises = topStoryIds.map(id =>
    fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`)
      .then(r => r.json())
  )
  const stories = await Promise.all(storyPromises)
  
  // 3. Convert to our TrendingTopic format
  return convertHackerNewsToTopics(stories)
}
```

### Reddit Implementation

```typescript
async function fetchFromReddit(): Promise<TrendingTopic[]> {
  // 1. Select subreddit
  const subreddits = ['technology', 'programming', 'artificial', 'science']
  const subreddit = subreddits[0] // Or random selection
  
  // 2. Fetch hot posts
  const response = await fetch(
    `https://www.reddit.com/r/${subreddit}/hot.json?limit=15`,
    {
      headers: {
        'User-Agent': 'ContentPlanner/1.0'
      }
    }
  )
  const data = await response.json()
  
  // 3. Filter and convert
  const posts = data.data.children
    .filter(post => !post.data.stickied) // Remove pinned posts
    .slice(0, 10)
    
  return convertRedditToTopics(posts)
}
```

## Best Practices

### For Development
1. **Use Free Sources First**: Test with Hacker News and Reddit before adding API keys
2. **Monitor Response Times**: Free APIs are usually fast but can vary
3. **Handle Errors Gracefully**: Sources may occasionally be unavailable
4. **Cache Results**: Use the daily content caching feature to reduce API calls

### For Production
1. **Implement Rate Limiting**: Respect Reddit's 60 req/min limit
2. **Use Multiple Sources**: Don't rely on a single source
3. **Add Monitoring**: Track success rates and response times
4. **Consider Paid APIs**: For higher volume needs, add NewsAPI or GNews keys

### Content Quality
1. **Filter Content**: Remove low-quality or inappropriate topics
2. **Verify Links**: Check that article URLs are accessible
3. **Add Context**: Enhance AI-generated content with source citations
4. **Diversify Categories**: Mix content from different subreddits/topics

## Troubleshooting

### Common Issues

#### Hacker News Not Loading
- **Symptom**: "HTTP 503" or timeout errors
- **Cause**: Firebase backend occasionally has issues
- **Solution**: Implement retry logic with exponential backoff

#### Reddit Blocked
- **Symptom**: "HTTP 429" or "HTTP 403"
- **Cause**: Rate limiting or missing User-Agent header
- **Solution**:
  - Add proper User-Agent header
  - Implement request throttling
  - Wait before retrying

#### No Topics Returned
- **Symptom**: Empty array but no error
- **Cause**: All stories filtered out or API format changed
- **Solution**:
  - Check filtering logic
  - Verify API response structure hasn't changed
  - Update parsing code if needed

### Debug Mode

Enable console logging to see detailed source attempts:

```typescript
// In news-api.ts
export async function fetchTrendingNews(settings?: NewsAPISettings): Promise<TrendingTopic[]> {
  const sources = [
    () => fetchFromNewsAPI(settings),
    () => fetchFromGNews(settings),
    () => fetchFromHackerNews(),
    () => fetchFromRedditAPI(),
  ]

  for (const source of sources) {
    try {
      console.log(`Attempting source: ${source.name}`) // Add this
      const topics = await source()
      if (topics && topics.length > 0) {
        console.log(`Success! Got ${topics.length} topics`) // Add this
        return topics
      }
    } catch (error) {
      console.warn('Source failed:', error) // Already present
      continue
    }
  }
  
  return getFallbackTrendingTopics()
}
```

## Future Enhancements

### Planned Features
1. **More Free Sources**:
   - GitHub Trending (trending repositories)
   - Product Hunt (new products)
   - Dev.to (developer content)
   - Medium (top stories)

2. **Advanced Filtering**:
   - Keyword filtering
   - Score thresholds
   - Time-based relevance
   - Category preferences

3. **Source Mixing**:
   - Combine topics from multiple sources
   - Deduplication of similar topics
   - Weighted selection based on source quality

4. **Analytics**:
   - Track which sources generate best engagement
   - A/B test content from different sources
   - Historical performance data

## API Reference

### Key Functions

#### `fetchTrendingNews(settings?: NewsAPISettings): Promise<TrendingTopic[]>`
Main entry point for fetching trending topics from all sources.

**Parameters:**
- `settings` (optional): Configuration for paid APIs (NewsAPI, GNews)

**Returns:**
- Array of `TrendingTopic` objects

**Behavior:**
- Tries sources in order: NewsAPI → GNews → Hacker News → Reddit
- Returns first successful result
- Falls back to generic topics if all sources fail

#### `fetchFromHackerNews(): Promise<TrendingTopic[]>`
Fetches top stories from Hacker News.

**Returns:**
- Array of technology-focused trending topics with scores and comment counts

#### `fetchFromRedditAPI(): Promise<TrendingTopic[]>`
Fetches hot posts from technology-related subreddits.

**Returns:**
- Array of trending topics with upvote counts and comments

### Data Structures

```typescript
interface TrendingTopic {
  topic: string
  category: string
  relevance: string
  articles: NewsArticle[]
  suggestedContentAngle: string
}

interface NewsArticle {
  title: string
  description: string
  url: string
  publishedAt: string
  source: string
  imageUrl?: string
}
```

## Conclusion

The free sources testing feature provides a robust foundation for generating trending content without requiring any paid API subscriptions. By leveraging Hacker News and Reddit, you can:

- **Test the platform** without setup overhead
- **Generate tech-focused content** automatically
- **Scale to production** with confidence
- **Add paid sources** when needed for more variety

The testing interface makes it easy to verify that sources are working correctly and to understand the quality and type of content each source provides.

For questions or issues, check the console logs in the browser developer tools or review the implementation in `src/lib/news-api.ts` and `src/components/FreeSourcesTestDialog.tsx`.
