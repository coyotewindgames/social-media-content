import { ContentIdea, Platform, CaptionTone } from './types'
import { fetchTrendingTopics, generateContentFromTopic } from './auto-discovery'

export interface DailyContentGenerationOptions {
  count?: number
  platform?: Platform
  tone?: CaptionTone
  generateImages?: boolean
  grokApiKey?: string
}

export async function generateDailyContent(
  options: DailyContentGenerationOptions = {}
): Promise<ContentIdea[]> {
  const {
    count = 5,
    platform = 'instagram',
    tone = 'casual',
    generateImages = true,
    grokApiKey
  } = options

  const topics = await fetchTrendingTopics('today', count * 2)
  
  const selectedTopics = topics
    .filter(topic => topic.suggestedPlatforms.includes(platform))
    .slice(0, count)

  if (selectedTopics.length < count) {
    const remaining = count - selectedTopics.length
    const additionalTopics = topics
      .filter(topic => !selectedTopics.includes(topic))
      .slice(0, remaining)
    selectedTopics.push(...additionalTopics)
  }

  const contentPromises = selectedTopics.slice(0, count).map(async (topic) => {
    const contentBase = await generateContentFromTopic(
      topic,
      platform,
      tone,
      generateImages,
      grokApiKey
    )

    const content: ContentIdea = {
      ...contentBase,
      id: `daily-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    return content
  })

  const contents = await Promise.all(contentPromises)
  return contents
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
    grokApiKey
  } = options

  const topics = await fetchTrendingTopics('today', 10)
  const randomTopic = topics[Math.floor(Math.random() * topics.length)]

  const contentBase = await generateContentFromTopic(
    randomTopic,
    platform,
    tone,
    generateImages,
    grokApiKey
  )

  const content: ContentIdea = {
    ...contentBase,
    id: `daily-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  const cached = await getCachedDailyContent()
  if (cached) {
    const updated = [...cached]
    updated[index] = content
    await cacheDailyContent(updated)
  }

  return content
}
