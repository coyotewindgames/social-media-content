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
  const today = new Date()
  const dayOfWeek = today.toLocaleDateString('en-US', { weekday: 'long' })
  const dateStr = today.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  
  const timeFrameText = timeFrame === 'today' ? 'today' : 'this week'
  const categoryFilter = categories && categories.length > 0 
    ? `Focus on these categories: ${categories.join(', ')}.` 
    : ''

  const prompt = window.spark.llmPrompt`You are a social media trends analyst with access to real-time news and cultural events. Today is ${dayOfWeek}, ${dateStr}.

Identify ${maxTopics} SPECIFIC trending topics, news stories, or cultural moments happening RIGHT NOW (${timeFrameText}) that would be perfect for social media content creation.

IMPORTANT GUIDELINES:
- Reference REAL current events, news, viral moments, or cultural happenings
- Be SPECIFIC with names, events, dates, and details (e.g., "Apple's iPhone 16 Launch Event" not "New Phone Release")
- Include breaking news, viral internet trends, pop culture moments, tech announcements, sports events, etc.
- Mention specific people, brands, shows, or events when relevant
- Make it timely and newsworthy - content creators should feel these topics are HOT right now
- Avoid generic evergreen topics - be current and specific

For each topic, provide:
- The specific topic/event name with key details
- Category (Technology, Entertainment, Sports, Politics, Lifestyle, Health, Business, Culture, Gaming, Fashion, Food)
- Why it's relevant and trending RIGHT NOW (be specific about the news hook)
- Which platforms it would work best on (choose from: instagram, tiktok, facebook, twitter, youtube)
- A unique content angle that ties into the news/trend

${categoryFilter}

Return ONLY valid JSON with the following structure:
{
  "topics": [
    {
      "topic": "Specific Topic/Event Name",
      "category": "Category",
      "relevance": "Specific reason why it's trending right now with details",
      "suggestedPlatforms": ["platform1", "platform2"],
      "contentAngle": "Creative approach tied to the current news/trend"
    }
  ]
}

Examples of GOOD topics (specific & current):
- "OpenAI's GPT-4 Turbo Launch - Developer Community Reactions"
- "Taylor Swift's Eras Tour Box Office Record Breaks $1 Billion"
- "Meta's Threads App Hits 100M Users in 5 Days"

Examples of BAD topics (too generic):
- "AI Technology Trends"
- "Concert Tours"
- "Social Media Apps"`

  const response = await window.spark.llm(prompt, 'gpt-4o', true)
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
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  
  const prompt = window.spark.llmPrompt`You are a viral social media content strategist creating timely, news-driven content. Create a compelling ${platform} post based on this CURRENT trending topic:

Topic: ${topic.topic}
Category: ${topic.category}
Why it's trending NOW: ${topic.relevance}
Content angle: ${topic.contentAngle}
Date: ${today}
Tone: ${tone}

IMPORTANT:
- Reference the specific news/event with details (names, numbers, dates)
- Make it feel CURRENT and timely - this is happening RIGHT NOW
- Include a news hook in the caption that creates urgency
- Use language that shows this is breaking/trending (e.g., "Just announced", "Breaking:", "This week", "Latest")
- Add relevant trending hashtags related to the specific event

Generate:
1. A catchy, news-driven title (5-10 words) - should feel like a headline
2. A brief description (2-3 sentences) of the visual content that ties directly to the news
3. An engaging ${tone} caption that:
   - Opens with the news hook or key detail
   - Explains why it matters or adds context
   - Includes 3-5 specific, relevant hashtags (avoid generic ones)
   - Uses emojis strategically

Return ONLY valid JSON:
{
  "title": "News-style headline here",
  "description": "Visual content description tied to the news",
  "caption": "Opening hook about the news... Context and why it matters. Relevant #hashtags"
}`

  const response = await window.spark.llm(prompt, 'gpt-4o', true)
  const data = JSON.parse(response)

  const contentIdea: Omit<ContentIdea, 'id' | 'createdAt' | 'updatedAt'> = {
    title: data.title || topic.topic,
    description: data.description || topic.contentAngle,
    caption: data.caption || '',
    platform,
    status: 'idea',
    notes: `🔥 Trending Now: ${topic.topic}\n\n📰 News Hook: ${topic.relevance}\n\n💡 Content Angle: ${topic.contentAngle}\n\n📅 Generated: ${new Date().toLocaleString()}`,
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
