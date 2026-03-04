import { ContentIdea, Platform, CaptionTone } from './types'
import { fetchTrendingNews, TrendingTopic, NewsAPISettings } from './news-api'
import { generateCaptionWithOllama } from './ollama-api'
import { generateImageWithGrok } from './grok-image-generation'

export interface DailyContentGenerationOptions {
  count?: number
  platform?: Platform
  tone?: CaptionTone
  generateImages?: boolean
  grokApiKey?: string
  ollamaEndpoint?: string
  newsApiKey?: string
  gNewsApiKey?: string
  newsCategories?: string[]
  newsLanguage?: string
  newsCountry?: string
}

export async function generateDailyContent(
  options: DailyContentGenerationOptions = {}
): Promise<ContentIdea[]> {
  const {
    count = 5,
    platform = 'instagram',
    tone = 'casual',
    generateImages = true,
    grokApiKey,
    ollamaEndpoint = 'http://localhost:11434',
    newsApiKey,
    gNewsApiKey,
    newsCategories,
    newsLanguage,
    newsCountry
  } = options

  const newsSettings: NewsAPISettings = {
    newsApiKey,
    gNewsApiKey,
    categories: newsCategories,
    language: newsLanguage,
    country: newsCountry
  }

  const trendingTopics = await fetchTrendingNews(newsSettings)
  
  const selectedTopics = trendingTopics.slice(0, count)

  const contentPromises = selectedTopics.map(async (topic) => {
    const content = await generateContentFromNews(
      topic,
      platform,
      tone,
      generateImages,
      grokApiKey,
      ollamaEndpoint
    )

    return content
  })

  const contents = await Promise.all(contentPromises)
  return contents
}

async function generateContentFromNews(
  newsItem: TrendingTopic,
  platform: Platform,
  tone: CaptionTone,
  generateImages: boolean,
  grokApiKey?: string,
  ollamaEndpoint?: string
): Promise<ContentIdea> {
  const article = newsItem.articles[0]
  const title = newsItem.topic
  const description = newsItem.suggestedContentAngle || article?.description || newsItem.relevance

  const caption = await generateCaptionWithOllama(
    {
      topic: title,
      description: description,
      tone,
      platform,
      maxLength: platform === 'twitter' ? 280 : 2200,
      includeHashtags: true,
      includeEmojis: tone === 'playful' || tone === 'casual',
    },
    ollamaEndpoint
  )

  let generatedImageUrl: string | undefined
  let imagePrompt: string | undefined

  if (generateImages && grokApiKey) {
    try {
      const imageResult = await generateImageWithGrok(title, description.substring(0, 200), platform, grokApiKey)
      if (imageResult.success) {
        generatedImageUrl = imageResult.imageUrl || imageResult.imageDataUrl
        imagePrompt = imageResult.prompt
      }
    } catch (error) {
      console.error('Failed to generate image for daily content:', error)
    }
  }

  const content: ContentIdea = {
    id: `daily-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    title,
    description,
    caption,
    platform,
    status: 'idea',
    notes: `Auto-generated from trending news: ${article?.source || 'News Source'}\nCategory: ${newsItem.category}\n\n${article?.title || ''}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    generatedImageUrl,
    imagePrompt,
    generatedByAutoDiscovery: true,
  }

  return content
}

export function getDailyContentCacheKey(): string {
  const today = new Date()
  const dateStr = today.toISOString().split('T')[0]
  return `daily-content-${dateStr}`
}

export async function getCachedDailyContent(): Promise<ContentIdea[] | null> {
  const cacheKey = getDailyContentCacheKey()
  const cached = await window.spark.kv.get<ContentIdea[]>(cacheKey)
  return cached || null
}

export async function cacheDailyContent(contents: ContentIdea[]): Promise<void> {
  const cacheKey = getDailyContentCacheKey()
  await window.spark.kv.set(cacheKey, contents)
}

export async function getOrGenerateDailyContent(
  options: DailyContentGenerationOptions = {}
): Promise<{ contents: ContentIdea[]; fromCache: boolean }> {
  const cached = await getCachedDailyContent()
  
  if (cached && cached.length > 0) {
    return { contents: cached, fromCache: true }
  }

  const contents = await generateDailyContent(options)
  await cacheDailyContent(contents)
  
  return { contents, fromCache: false }
}

export async function regenerateDailyContent(
  index: number,
  options: DailyContentGenerationOptions = {}
): Promise<ContentIdea> {
  const {
    platform = 'instagram',
    tone = 'casual',
    generateImages = true,
    grokApiKey,
    ollamaEndpoint = 'http://localhost:11434',
    newsApiKey,
    gNewsApiKey,
    newsCategories,
    newsLanguage,
    newsCountry
  } = options

  const newsSettings: NewsAPISettings = {
    newsApiKey,
    gNewsApiKey,
    categories: newsCategories,
    language: newsLanguage,
    country: newsCountry
  }

  const trendingTopics = await fetchTrendingNews(newsSettings)
  const randomTopic = trendingTopics[Math.floor(Math.random() * trendingTopics.length)]

  const content = await generateContentFromNews(
    randomTopic,
    platform,
    tone,
    generateImages,
    grokApiKey,
    ollamaEndpoint
  )

  const cached = await getCachedDailyContent()
  if (cached) {
    const updated = [...cached]
    updated[index] = content
    await cacheDailyContent(updated)
  }

  return content
}
