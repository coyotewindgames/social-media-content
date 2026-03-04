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

export async function fetchTrendingNews(): Promise<TrendingTopic[]> {
  try {
    const response = await fetch('/news', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      throw new Error(`News API error: ${response.status}`)
    }

    const data = await response.json()
    
    if (!data.topics || !Array.isArray(data.topics)) {
      throw new Error('Invalid news API response format')
    }

    return data.topics as TrendingTopic[]
  } catch (error) {
    console.error('Failed to fetch trending news:', error)
    return getFallbackTrendingTopics()
  }
}

function getFallbackTrendingTopics(): TrendingTopic[] {
  return [
    {
      topic: 'Technology Innovation',
      category: 'Technology',
      relevance: 'High engagement topic with tech-savvy audiences',
      articles: [
        {
          title: 'Latest Tech Breakthrough',
          description: 'Exciting developments in artificial intelligence',
          url: '#',
          publishedAt: new Date().toISOString(),
          source: 'Tech News',
          category: 'Technology',
        },
      ],
      suggestedContentAngle: 'How this technology impacts daily life',
    },
    {
      topic: 'Wellness and Self-Care',
      category: 'Lifestyle',
      relevance: 'Evergreen topic with consistent engagement',
      articles: [
        {
          title: 'Mental Health Awareness',
          description: 'Tips for maintaining wellness in modern life',
          url: '#',
          publishedAt: new Date().toISOString(),
          source: 'Wellness Weekly',
          category: 'Lifestyle',
        },
      ],
      suggestedContentAngle: 'Practical self-care tips for busy people',
    },
    {
      topic: 'Environmental Sustainability',
      category: 'Environment',
      relevance: 'Growing concern with engaged communities',
      articles: [
        {
          title: 'Sustainable Living Tips',
          description: 'Small changes that make a big impact',
          url: '#',
          publishedAt: new Date().toISOString(),
          source: 'Green Living',
          category: 'Environment',
        },
      ],
      suggestedContentAngle: 'Easy eco-friendly swaps anyone can make',
    },
  ]
}

export async function extractTopicsFromNews(news: TrendingTopic[]): Promise<string[]> {
  return news.map((item) => {
    const articleContext = item.articles.length > 0 
      ? ` (${item.articles[0].title}: ${item.articles[0].description})`
      : ''
    return `${item.topic} - ${item.relevance}${articleContext}`
  })
}
