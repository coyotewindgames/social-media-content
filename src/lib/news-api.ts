export interface NewsArticle {
  title: string
  description: string
  url: string
  publishedAt: string
  source: string
  category?: string
  imageUrl?: string
}

export interface TrendingTopic {
  topic: string
  category: string
  relevance: string
  articles: NewsArticle[]
  suggestedContentAngle: string
}

export interface NewsAPISettings {
  newsApiKey?: string
  gNewsApiKey?: string
  categories?: string[]
  language?: string
  country?: string
}

export async function fetchTrendingNews(settings?: NewsAPISettings): Promise<TrendingTopic[]> {
  const sources = [
    () => fetchFromNewsAPI(settings),
    () => fetchFromGNews(settings),
    () => fetchFromHackerNews(),
    () => fetchFromRedditAPI(),
  ]

  for (const source of sources) {
    try {
      const topics = await source()
      if (topics && topics.length > 0) {
        return topics
      }
    } catch (error) {
      console.warn('News source failed, trying next:', error)
      continue
    }
  }

  console.warn('All news sources failed, using fallback topics')
  return getFallbackTrendingTopics()
}

async function fetchFromNewsAPI(settings?: NewsAPISettings): Promise<TrendingTopic[]> {
  const apiKey = settings?.newsApiKey || ''
  
  if (!apiKey) {
    throw new Error('NewsAPI key not configured')
  }

  const country = settings?.country || 'us'
  const category = settings?.categories?.[0] || ''
  const endpoint = category 
    ? `https://newsapi.org/v2/top-headlines?country=${country}&category=${category}&apiKey=${apiKey}`
    : `https://newsapi.org/v2/top-headlines?country=${country}&apiKey=${apiKey}`

  const response = await fetch(endpoint)
  
  if (!response.ok) {
    throw new Error(`NewsAPI error: ${response.status}`)
  }

  const data = await response.json()
  
  if (data.status !== 'ok' || !data.articles) {
    throw new Error('Invalid NewsAPI response')
  }

  return convertNewsAPIToTopics(data.articles)
}

async function fetchFromGNews(settings?: NewsAPISettings): Promise<TrendingTopic[]> {
  const apiKey = settings?.gNewsApiKey || ''
  
  if (!apiKey) {
    throw new Error('GNews API key not configured')
  }

  const lang = settings?.language || 'en'
  const country = settings?.country || 'us'
  const endpoint = `https://gnews.io/api/v4/top-headlines?lang=${lang}&country=${country}&token=${apiKey}&max=10`

  const response = await fetch(endpoint)
  
  if (!response.ok) {
    throw new Error(`GNews error: ${response.status}`)
  }

  const data = await response.json()
  
  if (!data.articles) {
    throw new Error('Invalid GNews response')
  }

  return convertGNewsToTopics(data.articles)
}

async function fetchFromHackerNews(): Promise<TrendingTopic[]> {
  const response = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json')
  
  if (!response.ok) {
    throw new Error(`Hacker News error: ${response.status}`)
  }

  const storyIds = await response.json()
  const topStoryIds = storyIds.slice(0, 15)
  
  const storyPromises = topStoryIds.map(async (id: number) => {
    const storyResponse = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`)
    return storyResponse.json()
  })

  const stories = await Promise.all(storyPromises)
  
  return convertHackerNewsToTopics(stories.filter(s => s && s.title))
}

async function fetchFromRedditAPI(): Promise<TrendingTopic[]> {
  const subreddits = ['technology', 'science', 'worldnews', 'business', 'futurology']
  const randomSubreddit = subreddits[Math.floor(Math.random() * subreddits.length)]
  
  const response = await fetch(`https://www.reddit.com/r/${randomSubreddit}/hot.json?limit=15`)
  
  if (!response.ok) {
    throw new Error(`Reddit API error: ${response.status}`)
  }

  const data = await response.json()
  
  if (!data.data || !data.data.children) {
    throw new Error('Invalid Reddit response')
  }

  return convertRedditToTopics(data.data.children)
}

function convertNewsAPIToTopics(articles: any[]): TrendingTopic[] {
  const grouped = groupArticlesByTopic(articles.slice(0, 10))
  
  return Object.entries(grouped).map(([topic, articles]) => {
    const firstArticle = articles[0]
    return {
      topic: topic,
      category: categorizeContent(topic + ' ' + firstArticle.description),
      relevance: `Trending now with ${articles.length} related article${articles.length > 1 ? 's' : ''}`,
      articles: articles.map((a: any) => ({
        title: a.title,
        description: a.description || a.content || 'No description available',
        url: a.url,
        publishedAt: a.publishedAt,
        source: a.source?.name || 'Unknown',
        imageUrl: a.urlToImage,
      })),
      suggestedContentAngle: generateContentAngle(topic, firstArticle.description),
    }
  }).slice(0, 8)
}

function convertGNewsToTopics(articles: any[]): TrendingTopic[] {
  const grouped = groupArticlesByTopic(articles)
  
  return Object.entries(grouped).map(([topic, articles]) => {
    const firstArticle = articles[0]
    return {
      topic: topic,
      category: categorizeContent(topic + ' ' + firstArticle.description),
      relevance: `Top story with high engagement potential`,
      articles: articles.map((a: any) => ({
        title: a.title,
        description: a.description || 'No description available',
        url: a.url,
        publishedAt: a.publishedAt,
        source: a.source?.name || 'Unknown',
        imageUrl: a.image,
      })),
      suggestedContentAngle: generateContentAngle(topic, firstArticle.description),
    }
  }).slice(0, 8)
}

function convertHackerNewsToTopics(stories: any[]): TrendingTopic[] {
  const topics = stories.slice(0, 10).map((story) => {
    const topic = extractKeyPhrase(story.title)
    return {
      topic: topic || story.title,
      category: 'Technology',
      relevance: `${story.score || 0} points on Hacker News with ${story.descendants || 0} comments`,
      articles: [{
        title: story.title,
        description: story.text || story.title,
        url: story.url || `https://news.ycombinator.com/item?id=${story.id}`,
        publishedAt: new Date(story.time * 1000).toISOString(),
        source: 'Hacker News',
      }],
      suggestedContentAngle: generateContentAngle(story.title, story.text || story.title),
    }
  })

  return topics
}

function convertRedditToTopics(posts: any[]): TrendingTopic[] {
  return posts
    .filter((post: any) => post.data && !post.data.stickied && !post.data.is_self)
    .slice(0, 10)
    .map((post: any) => {
      const data = post.data
      const topic = extractKeyPhrase(data.title)
      return {
        topic: topic || data.title,
        category: categorizeContent(data.title + ' ' + (data.selftext || '')),
        relevance: `${data.ups || 0} upvotes on Reddit with ${data.num_comments || 0} comments`,
        articles: [{
          title: data.title,
          description: data.selftext || data.title,
          url: data.url,
          publishedAt: new Date(data.created_utc * 1000).toISOString(),
          source: `r/${data.subreddit}`,
          imageUrl: data.thumbnail && data.thumbnail.startsWith('http') ? data.thumbnail : undefined,
        }],
        suggestedContentAngle: generateContentAngle(data.title, data.selftext || data.title),
      }
    })
}

function groupArticlesByTopic(articles: any[]): Record<string, any[]> {
  const grouped: Record<string, any[]> = {}
  
  articles.forEach((article) => {
    const topic = extractKeyPhrase(article.title)
    if (topic) {
      if (!grouped[topic]) {
        grouped[topic] = []
      }
      grouped[topic].push(article)
    }
  })

  return grouped
}

function extractKeyPhrase(text: string): string {
  const cleaned = text.replace(/[^\w\s]/g, ' ').trim()
  const words = cleaned.split(/\s+/)
  
  const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been', 'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those', 'how', 'why', 'what', 'when', 'where', 'who'])
  
  const significantWords = words
    .filter(w => w.length > 3 && !stopWords.has(w.toLowerCase()))
    .slice(0, 4)
  
  return significantWords.join(' ')
}

function categorizeContent(text: string): string {
  const lower = text.toLowerCase()
  
  if (lower.match(/tech|ai|software|digital|crypto|blockchain|app|device|innovation/)) return 'Technology'
  if (lower.match(/health|fitness|wellness|medical|mental|exercise|nutrition/)) return 'Health & Wellness'
  if (lower.match(/business|economy|market|finance|startup|entrepreneur|company/)) return 'Business'
  if (lower.match(/entertainment|movie|music|celebrity|show|game|sports/)) return 'Entertainment'
  if (lower.match(/science|research|study|discover|space|climate|environment/)) return 'Science'
  if (lower.match(/fashion|style|beauty|design|art|creative/)) return 'Lifestyle'
  if (lower.match(/food|recipe|cooking|restaurant|culinary/)) return 'Food'
  if (lower.match(/travel|destination|vacation|tourism|adventure/)) return 'Travel'
  
  return 'General'
}

function generateContentAngle(topic: string, description: string): string {
  const category = categorizeContent(topic + ' ' + description)
  
  const angles: Record<string, string[]> = {
    'Technology': [
      'How this tech innovation will change your daily life',
      'The future implications of this breakthrough',
      'Simple explanation of complex technology',
      'What this means for everyday users',
    ],
    'Health & Wellness': [
      'Quick tips you can start using today',
      'The science behind wellness trends',
      'Personal transformation stories',
      'Practical advice for busy lifestyles',
    ],
    'Business': [
      'Lessons entrepreneurs can learn from this',
      'Impact on small businesses and startups',
      'What this means for your career',
      'Behind-the-scenes industry insights',
    ],
    'Entertainment': [
      'Behind the scenes and exclusive details',
      'Fan theories and predictions',
      'Cultural impact and significance',
      'Must-see moments and highlights',
    ],
    'Science': [
      'Breaking down complex concepts simply',
      'Real-world applications and benefits',
      'What researchers discovered and why it matters',
      'Future possibilities and predictions',
    ],
    'Lifestyle': [
      'Easy ways to incorporate this into your life',
      'Style tips and inspiration',
      'Personal stories and experiences',
      'Trends worth following',
    ],
    'General': [
      'Key takeaways and important points',
      'Why this matters to you',
      'Quick summary and analysis',
      'What you need to know',
    ],
  }

  const categoryAngles = angles[category] || angles['General']
  return categoryAngles[Math.floor(Math.random() * categoryAngles.length)]
}

function getFallbackTrendingTopics(): TrendingTopic[] {
  const today = new Date()
  const dayOfWeek = today.getDay()
  
  const topicsByDay: Record<number, TrendingTopic[]> = {
    0: [
      {
        topic: 'Sunday Self-Care Routines',
        category: 'Health & Wellness',
        relevance: 'High engagement on Sundays when people focus on self-care',
        articles: [{
          title: 'Transform Your Sunday with These Self-Care Rituals',
          description: 'Start your week right with mindful practices',
          url: '#',
          publishedAt: today.toISOString(),
          source: 'Wellness Hub',
        }],
        suggestedContentAngle: 'Share your favorite Sunday reset routine',
      },
    ],
    1: [
      {
        topic: 'Monday Motivation and Productivity',
        category: 'Lifestyle',
        relevance: 'People seek motivation at the start of the work week',
        articles: [{
          title: 'Kickstart Your Week with These Productivity Hacks',
          description: 'Turn Monday into your most productive day',
          url: '#',
          publishedAt: today.toISOString(),
          source: 'Productivity Pro',
        }],
        suggestedContentAngle: 'Inspiring tips to conquer Monday blues',
      },
    ],
    2: [
      {
        topic: 'Tech Trends and Innovation',
        category: 'Technology',
        relevance: 'Mid-week tech content performs well',
        articles: [{
          title: 'Latest Tech Breakthrough Changing How We Work',
          description: 'AI and automation reshaping daily tasks',
          url: '#',
          publishedAt: today.toISOString(),
          source: 'Tech Today',
        }],
        suggestedContentAngle: 'How technology is simplifying modern life',
      },
    ],
    3: [
      {
        topic: 'Midweek Energy Boosters',
        category: 'Health & Wellness',
        relevance: 'Midweek slump makes wellness content timely',
        articles: [{
          title: 'Beat the Midweek Slump Naturally',
          description: 'Energy-boosting tips for Wednesday',
          url: '#',
          publishedAt: today.toISOString(),
          source: 'Health First',
        }],
        suggestedContentAngle: 'Quick wellness hacks to power through the week',
      },
    ],
    4: [
      {
        topic: 'Throwback Thursday Trends',
        category: 'Entertainment',
        relevance: '#ThrowbackThursday is a popular social trend',
        articles: [{
          title: 'Nostalgia Content That Resonates Today',
          description: 'Why throwback content drives engagement',
          url: '#',
          publishedAt: today.toISOString(),
          source: 'Social Trends',
        }],
        suggestedContentAngle: 'Share memorable moments with a modern twist',
      },
    ],
    5: [
      {
        topic: 'Friday Favorites and Weekend Plans',
        category: 'Lifestyle',
        relevance: 'People engage heavily with weekend content on Fridays',
        articles: [{
          title: 'Make the Most of Your Weekend',
          description: 'Ideas for an amazing weekend ahead',
          url: '#',
          publishedAt: today.toISOString(),
          source: 'Weekend Vibes',
        }],
        suggestedContentAngle: 'Exciting weekend ideas and recommendations',
      },
    ],
    6: [
      {
        topic: 'Saturday Adventure Ideas',
        category: 'Travel',
        relevance: 'Weekend exploration content is highly shareable',
        articles: [{
          title: 'Local Adventures Worth Exploring',
          description: 'Hidden gems in your area',
          url: '#',
          publishedAt: today.toISOString(),
          source: 'Adventure Guide',
        }],
        suggestedContentAngle: 'Inspiring local experiences and day trips',
      },
    ],
  }

  const basicsTopics: TrendingTopic[] = [
    {
      topic: 'AI and Machine Learning Advances',
      category: 'Technology',
      relevance: 'Consistently high engagement topic across all platforms',
      articles: [{
        title: 'How AI is Transforming Everyday Life',
        description: 'From smart assistants to creative tools, AI is everywhere',
        url: '#',
        publishedAt: today.toISOString(),
        source: 'Tech Insights',
      }],
      suggestedContentAngle: 'Practical ways AI tools can boost your productivity',
    },
    {
      topic: 'Sustainable Living Tips',
      category: 'Lifestyle',
      relevance: 'Eco-conscious content builds engaged communities',
      articles: [{
        title: 'Small Changes That Make a Big Environmental Impact',
        description: 'Easy swaps for a more sustainable lifestyle',
        url: '#',
        publishedAt: today.toISOString(),
        source: 'Green Living',
      }],
      suggestedContentAngle: 'Actionable eco-friendly habits anyone can adopt',
    },
    {
      topic: 'Mental Health Awareness',
      category: 'Health & Wellness',
      relevance: 'Mental health content shows consistent engagement',
      articles: [{
        title: 'Breaking the Stigma Around Mental Health',
        description: 'Open conversations about wellbeing',
        url: '#',
        publishedAt: today.toISOString(),
        source: 'Wellness Today',
      }],
      suggestedContentAngle: 'Personal strategies for maintaining mental wellness',
    },
  ]

  const daySpecific = topicsByDay[dayOfWeek] || []
  return [...daySpecific, ...basicsTopics].slice(0, 8)
}

export async function extractTopicsFromNews(news: TrendingTopic[]): Promise<string[]> {
  return news.map((item) => {
    const articleContext = item.articles.length > 0 
      ? ` (${item.articles[0].title}: ${item.articles[0].description})`
      : ''
    return `${item.topic} - ${item.relevance}${articleContext}`
  })
}
