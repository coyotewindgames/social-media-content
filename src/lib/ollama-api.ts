export interface OllamaGenerationRequest {
  model: string
  prompt: string
  stream?: boolean
  options?: {
    temperature?: number
    top_p?: number
    max_tokens?: number
  }
}

export interface OllamaGenerationResponse {
  model: string
  created_at: string
  response: string
  done: boolean
}

export interface OllamaCaptionOptions {
  topic: string
  description: string
  tone: 'casual' | 'professional' | 'playful' | 'inspirational'
  platform: string
  maxLength?: number
  includeHashtags?: boolean
  includeEmojis?: boolean
}

export async function generateCaptionWithOllama(
  options: OllamaCaptionOptions,
  ollamaEndpoint: string = 'http://localhost:11434'
): Promise<string> {
  const {
    topic,
    description,
    tone,
    platform,
    maxLength = 2200,
    includeHashtags = true,
    includeEmojis = true,
  } = options

  const prompt = buildCaptionPrompt(options)

  try {
    const response = await fetch(`${ollamaEndpoint}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama2',
        prompt,
        stream: false,
        options: {
          temperature: tone === 'playful' ? 0.9 : tone === 'professional' ? 0.5 : 0.7,
          top_p: 0.9,
          max_tokens: 500,
        },
      } as OllamaGenerationRequest),
    })

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status}`)
    }

    const data = (await response.json()) as OllamaGenerationResponse
    const caption = cleanupCaption(data.response, maxLength)

    return caption
  } catch (error) {
    console.error('Failed to generate caption with Ollama:', error)
    return generateFallbackCaption(options)
  }
}

function buildCaptionPrompt(options: OllamaCaptionOptions): string {
  const { topic, description, tone, platform, includeHashtags, includeEmojis } = options

  let toneDescription = ''
  switch (tone) {
    case 'casual':
      toneDescription = 'friendly, conversational, and relatable'
      break
    case 'professional':
      toneDescription = 'polished, authoritative, and informative'
      break
    case 'playful':
      toneDescription = 'fun, energetic, and entertaining'
      break
    case 'inspirational':
      toneDescription = 'motivating, uplifting, and encouraging'
      break
  }

  const emojiInstruction = includeEmojis
    ? 'Include relevant emojis naturally throughout the caption.'
    : 'Do not include emojis.'

  const hashtagInstruction = includeHashtags
    ? 'End with 5-8 relevant hashtags on a new line.'
    : 'Do not include hashtags.'

  return `You are a professional social media content creator specializing in ${platform} content.

Write an engaging caption for a post about: ${topic}

Context: ${description}

Requirements:
- Tone should be ${toneDescription}
- ${emojiInstruction}
- ${hashtagInstruction}
- Keep it authentic and engaging for ${platform} audience
- Make it attention-grabbing from the first line
- Include a call-to-action or question to encourage engagement

Write ONLY the caption text, nothing else. Do not include any prefixes like "Caption:" or explanations.`
}

function cleanupCaption(rawCaption: string, maxLength: number): string {
  let caption = rawCaption.trim()

  caption = caption.replace(/^(Caption:|Here's the caption:|Here is a caption:)/i, '').trim()
  caption = caption.replace(/^["']|["']$/g, '').trim()

  if (caption.length > maxLength) {
    caption = caption.substring(0, maxLength - 3) + '...'
  }

  return caption
}

function generateFallbackCaption(options: OllamaCaptionOptions): string {
  const { topic, tone, includeHashtags, includeEmojis } = options

  let caption = ''
  const emoji = includeEmojis ? '✨ ' : ''

  switch (tone) {
    case 'casual':
      caption = `${emoji}Just discovered something interesting about ${topic}! Can't wait to share more about this with you all. What do you think?`
      break
    case 'professional':
      caption = `${emoji}Insights on ${topic}: A comprehensive look at what's trending and why it matters. Stay informed with the latest developments.`
      break
    case 'playful':
      caption = `${emoji}OMG! ${topic} is absolutely amazing! 🎉 Who else is excited about this? Let me know in the comments! 👇`
      break
    case 'inspirational':
      caption = `${emoji}${topic} reminds us that great things are always within reach. Keep pushing forward and stay inspired! 💪`
      break
  }

  if (includeHashtags) {
    const baseTag = topic.replace(/\s+/g, '')
    caption += `\n\n#${baseTag} #Trending #ContentCreator #SocialMedia #DailyInspiration`
  }

  return caption
}

export async function testOllamaConnection(
  endpoint: string = 'http://localhost:11434'
): Promise<boolean> {
  try {
    const response = await fetch(`${endpoint}/api/tags`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    return response.ok
  } catch (error) {
    console.error('Failed to connect to Ollama:', error)
    return false
  }
}

export async function getAvailableOllamaModels(
  endpoint: string = 'http://localhost:11434'
): Promise<string[]> {
  try {
    const response = await fetch(`${endpoint}/api/tags`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      throw new Error('Failed to fetch models')
    }

    const data = await response.json()
    return data.models?.map((m: { name: string }) => m.name) || []
  } catch (error) {
    console.error('Failed to get Ollama models:', error)
    return []
  }
}
