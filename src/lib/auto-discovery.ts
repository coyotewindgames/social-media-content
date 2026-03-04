import { ContentIdea, Platform, CaptionTone } from './types'
import { generateImageWithGrok, hasGrokApiKey } from './grok-image-generation'

export interface TrendingTopic {
  topic: string
  category: string
  relevance: string
  suggestedPlatforms: Platform[]
  contentAngle: string
}

export interface AutoDiscoverySettings {
  enabled: boolean
  frequency: 'daily' | 'weekly'
  lastRunAt?: string
  nextRunAt?: string
  autoGenerate: boolean
  autoGenerateImages: boolean
  defaultPlatform: Platform
  defaultTone: CaptionTone
  maxTopicsPerRun: number
  categories: string[]
  grokApiKey?: string
}

export const DEFAULT_AUTO_DISCOVERY_SETTINGS: AutoDiscoverySettings = {
  enabled: false,
  frequency: 'daily',
  autoGenerate: false,
  autoGenerateImages: true,
  defaultPlatform: 'instagram',
  defaultTone: 'casual',
  maxTopicsPerRun: 5,
  categories: ['Technology', 'Entertainment', 'Lifestyle', 'Health', 'Business', 'Culture'],
}

export async function fetchTrendingTopics(
  timeFrame: 'today' | 'week' = 'today',
  maxTopics: number = 8,
  categories?: string[]
): Promise<TrendingTopic[]> {
  const timeFrameText = timeFrame === 'today' ? 'today' : 'this week'
  const categoryFilter = categories && categories.length > 0 
    ? `Focus on these categories: ${categories.join(', ')}.` 
    : ''

  const prompt = window.spark.llmPrompt`You are a social media trends analyst. Identify ${maxTopics} trending topics for ${timeFrameText} that would be perfect for social media content creation.

For each topic, provide:
- The topic name (concise)
- Category (e.g., Technology, Entertainment, Sports, Politics, Lifestyle, Health, Business, Culture)
- Why it's relevant right now (one sentence)
- Which platforms it would work best on (choose from: instagram, tiktok, facebook, twitter, youtube)
- A unique content angle or approach

${categoryFilter}

Return ONLY valid JSON with the following structure:
{
  "topics": [
    {
      "topic": "Topic Name",
      "category": "Category",
      "relevance": "Why it's trending",
      "suggestedPlatforms": ["platform1", "platform2"],
      "contentAngle": "Suggested approach"
    }
  ]
}

Make topics diverse across categories and genuinely reflect current events and cultural moments.`

  const response = await window.spark.llm(prompt, 'gpt-4o-mini', true)
  const data = JSON.parse(response)

  if (data.topics && Array.isArray(data.topics)) {
    return data.topics
  }

  throw new Error('Invalid response format from LLM')
}

export async function generateContentFromTopic(
  topic: TrendingTopic,
  platform: Platform,
  tone: CaptionTone,
  generateImage: boolean = false,
  grokApiKey?: string
): Promise<Omit<ContentIdea, 'id' | 'createdAt' | 'updatedAt'>> {
  const prompt = window.spark.llmPrompt`You are a social media content strategist. Create a compelling content idea for ${platform} based on this trending topic:

Topic: ${topic.topic}
Category: ${topic.category}
Why it's trending: ${topic.relevance}
Content angle: ${topic.contentAngle}
Tone: ${tone}

Generate:
1. A catchy title (5-10 words)
2. A brief description (2-3 sentences) of what the content would show
3. An engaging ${tone} caption with emojis and relevant hashtags

Return ONLY valid JSON:
{
  "title": "Title here",
  "description": "Description here",
  "caption": "Caption here"
}`

  const response = await window.spark.llm(prompt, 'gpt-4o-mini', true)
  const data = JSON.parse(response)

  const contentIdea: Omit<ContentIdea, 'id' | 'createdAt' | 'updatedAt'> = {
    title: data.title || topic.topic,
    description: data.description || topic.contentAngle,
    caption: data.caption || '',
    platform,
    status: 'idea',
    notes: `Auto-discovered from trending topic: ${topic.topic}\n\nRelevance: ${topic.relevance}\n\nDiscovered at: ${new Date().toLocaleString()}`,
    generatedByAutoDiscovery: true,
  }

  if (generateImage) {
    const hasKey = await hasGrokApiKey()
    if (hasKey || grokApiKey) {
      const imageResult = await generateImageWithGrok(
        contentIdea.title,
        contentIdea.description,
        platform,
        grokApiKey
      )
      
      if (imageResult.success) {
        contentIdea.imageDataUrl = imageResult.imageDataUrl
        contentIdea.generatedImageUrl = imageResult.imageUrl
        contentIdea.imagePrompt = imageResult.prompt
      }
    }
  }

  return contentIdea
}

export function calculateNextRunTime(frequency: 'daily' | 'weekly', fromDate: Date = new Date()): Date {
  const nextRun = new Date(fromDate)
  
  if (frequency === 'daily') {
    nextRun.setDate(nextRun.getDate() + 1)
    nextRun.setHours(9, 0, 0, 0)
  } else {
    nextRun.setDate(nextRun.getDate() + 7)
    nextRun.setHours(9, 0, 0, 0)
  }
  
  return nextRun
}

export function shouldRunAutoDiscovery(settings: AutoDiscoverySettings): boolean {
  if (!settings.enabled) return false
  
  if (!settings.nextRunAt) {
    return true
  }
  
  const nextRunDate = new Date(settings.nextRunAt)
  const now = new Date()
  
  return now >= nextRunDate
}
