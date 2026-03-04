# Automated Content Generation with News API & Ollama

This Content Planner now automatically generates social media content based on trending news topics and uses Ollama (running locally) for intelligent caption generation.

## Architecture Overview

The system consists of three main components that work together:

### 1. News API (`/news` endpoint)
- **Purpose**: Fetches real-time trending news and topics
- **Expected Response Format**:
```json
{
  "topics": [
    {
      "topic": "String - Main topic title",
      "category": "String - Category (Technology, Entertainment, etc.)",
      "relevance": "String - Why this topic is trending",
      "articles": [
        {
          "title": "String - Article headline",
          "description": "String - Article summary",
          "url": "String - Link to full article",
          "publishedAt": "ISO date string",
          "source": "String - News source name",
          "category": "String - Article category",
          "imageUrl": "String (optional) - Article image"
        }
      ],
      "suggestedContentAngle": "String - Recommended approach for social content"
    }
  ]
}
```

### 2. Ollama Backend (Local AI Model)
- **Purpose**: Generates platform-specific, tone-matched captions automatically
- **Default Endpoint**: `http://localhost:11434`
- **Model Used**: llama2 (configurable)
- **Features**:
  - Tone-aware caption generation (casual, professional, playful, inspirational)
  - Platform-optimized content (Instagram, TikTok, Facebook, Twitter, YouTube)
  - Automatic hashtag and emoji integration
  - Smart fallbacks if Ollama is unavailable

### 3. GROK Image Generation (Optional)
- Generates relevant images for each content piece
- Requires GROK API key configuration
- Platform-specific image dimensions

## Setup Instructions

### 1. Install Ollama

**macOS:**
```bash
curl https://ollama.ai/install.sh | sh
```

**Linux:**
```bash
curl https://ollama.ai/install.sh | sh
```

**Windows:**
Download from [ollama.ai](https://ollama.ai)

### 2. Download the AI Model

```bash
ollama pull llama2
```

For better performance, you can use larger models:
```bash
ollama pull llama2:13b
# or
ollama pull mistral
```

### 3. Start Ollama Server

```bash
ollama serve
```

The server will start on `http://localhost:11434` by default.

### 4. Configure the News API Backend

You need to set up a backend server that serves trending news at the `/news` endpoint. This can be:

- A Node.js/Express server
- A Python Flask/FastAPI server  
- Any other backend that can aggregate news from APIs like:
  - NewsAPI.org
  - Google News API
  - Twitter Trends API
  - Reddit API
  - Custom news aggregation service

**Example Node.js Implementation:**

```javascript
app.get('/news', async (req, res) => {
  try {
    // Fetch from your news aggregation source
    const newsData = await fetchTrendingNews();
    
    res.json({
      topics: newsData.map(item => ({
        topic: item.title,
        category: item.category,
        relevance: item.trendingScore,
        articles: item.relatedArticles,
        suggestedContentAngle: generateContentAngle(item)
      }))
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch news' });
  }
});
```

### 5. Configure Auto-Discovery Settings

In the app:
1. Click "Auto-Discovery" button in the header
2. Configure:
   - **Ollama Endpoint**: Default is `http://localhost:11434` (change if running Ollama elsewhere)
   - **GROK API Key**: Optional, for AI image generation
   - **Platform**: Choose target platform (Instagram, TikTok, etc.)
   - **Tone**: Select caption tone (casual, professional, playful, inspirational)

## How It Works

### Daily Content Generation Flow

1. **Fetch Trending Topics**
   ```
   App → /news endpoint → Returns 5-10 trending topics
   ```

2. **Generate Captions with Ollama**
   ```
   For each topic:
     - Extract topic title and description
     - Send to Ollama with platform/tone context
     - Ollama generates custom caption with hashtags/emojis
   ```

3. **Generate Images (Optional)**
   ```
   If GROK API key configured:
     - Create image prompt based on topic
     - Generate platform-optimized image
     - Attach to content idea
   ```

4. **Cache Results**
   ```
   Store generated content for 24 hours
   Next day: automatically regenerates with fresh news
   ```

### Manual Regeneration

Users can click the "Refresh" button to:
- Fetch latest trending topics
- Generate new captions via Ollama
- Create fresh content ideas instantly

## Key Features

✅ **Fully Automated**: No manual input needed - content generates automatically from news
✅ **News-Driven**: Always relevant and timely based on what's trending
✅ **AI-Powered Captions**: Ollama creates engaging, platform-specific copy
✅ **Tone Matching**: Captions match your brand voice (casual, professional, etc.)
✅ **Platform Optimized**: Content tailored for Instagram, TikTok, Facebook, Twitter, YouTube
✅ **Local AI**: Ollama runs on your machine - no external API costs for captions
✅ **Smart Caching**: Generates once per day, stores results for performance
✅ **Fallback Support**: Works even if Ollama is offline (uses basic templates)

## Troubleshooting

### Ollama Connection Issues

**Problem**: "Failed to generate caption" errors

**Solutions**:
1. Check Ollama is running: `curl http://localhost:11434/api/tags`
2. Verify model is installed: `ollama list`
3. Check endpoint configuration in Auto-Discovery settings
4. Review Ollama logs: `ollama logs`

### News API Not Responding

**Problem**: Generic/fallback topics appearing

**Solutions**:
1. Verify `/news` endpoint is accessible
2. Check backend server logs
3. Confirm API response format matches expected structure
4. Test endpoint directly: `curl http://yourserver.com/news`

### Content Quality Issues

**Problem**: Captions feel generic or off-brand

**Solutions**:
1. Try a different Ollama model (mistral, llama2:13b)
2. Adjust tone settings in Auto-Discovery
3. Modify prompt templates in `ollama-api.ts`
4. Add brand-specific keywords to prompts

## Customization

### Change Ollama Model

Edit `/src/lib/ollama-api.ts`:
```typescript
model: 'mistral' // or 'llama2:13b', 'codellama', etc.
```

### Adjust Caption Style

Modify `buildCaptionPrompt()` function in `/src/lib/ollama-api.ts` to customize:
- Tone descriptions
- Output format
- Hashtag strategy
- Emoji usage

### Add More News Sources

Extend `/news` backend to aggregate from multiple APIs:
- NewsAPI.org
- Google News
- Twitter Trends
- Reddit Popular
- RSS feeds

## Performance Considerations

- **Ollama Response Time**: 2-5 seconds per caption (depends on model size)
- **Concurrent Generation**: Processes 5 topics in parallel by default
- **Caching**: 24-hour cache reduces API calls
- **Fallback Mode**: Instant response if Ollama unavailable

## API Reference

### News API Endpoint

**GET** `/news`

**Response**:
```json
{
  "topics": TrendingTopic[]
}
```

### Ollama API

**POST** `http://localhost:11434/api/generate`

**Request**:
```json
{
  "model": "llama2",
  "prompt": "string",
  "stream": false,
  "options": {
    "temperature": 0.7,
    "top_p": 0.9,
    "max_tokens": 500
  }
}
```

**Response**:
```json
{
  "model": "llama2",
  "created_at": "timestamp",
  "response": "generated caption text",
  "done": true
}
```

## Files Modified

- `/src/lib/news-api.ts` - News API integration
- `/src/lib/ollama-api.ts` - Ollama caption generation
- `/src/lib/daily-content-generator.ts` - Orchestrates news → captions → content
- `/src/lib/auto-discovery.ts` - Added ollamaEndpoint setting
- `/src/App.tsx` - Passes Ollama endpoint to generation functions

## Next Steps

1. Set up your `/news` backend endpoint
2. Install and configure Ollama
3. Test with "Refresh" button on Daily Trending tab
4. Configure auto-discovery for hands-free operation
5. Customize prompts and models for your brand voice
