export interface GrokImageGenerationResult {
  success: boolean
  imageDataUrl?: string
  imageUrl?: string
  error?: string
  prompt?: string
}

export async function generateImageWithGrok(
  title: string,
  description: string,
  platform: string,
  grokApiKey?: string
): Promise<GrokImageGenerationResult> {
  try {
    const imagePrompt = await createImagePrompt(title, description, platform)
    
    const apiKey = grokApiKey || await getGrokApiKey()
    
    if (!apiKey) {
      return {
        success: false,
        error: 'Grok API key not configured. Please add your API key in settings.'
      }
    }

    const response = await fetch('https://api.x.ai/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        prompt: imagePrompt,
        model: 'grok-vision-beta',
        n: 1,
        size: getPlatformImageSize(platform),
        response_format: 'b64_json'
      })
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error?.message || `Grok API request failed: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    
    if (data.data && data.data[0]) {
      const imageData = data.data[0]
      const imageDataUrl = imageData.b64_json 
        ? `data:image/png;base64,${imageData.b64_json}`
        : imageData.url
      
      return {
        success: true,
        imageDataUrl: imageDataUrl,
        imageUrl: imageData.url,
        prompt: imagePrompt
      }
    } else {
      throw new Error('No image data returned from Grok API')
    }
  } catch (error) {
    console.error('Grok image generation error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }
  }
}

async function createImagePrompt(
  title: string,
  description: string,
  platform: string
): Promise<string> {
  const promptRequest = window.spark.llmPrompt`You are an expert at creating prompts for AI image generation. 

Create a detailed, vivid image generation prompt based on this social media content:

Title: ${title}
Description: ${description}
Platform: ${platform}

Requirements:
- Create a visually compelling prompt that captures the essence of the content
- Focus on visual elements: composition, lighting, style, mood, colors
- Be specific and descriptive
- Avoid text or words in the image
- Make it suitable for ${platform} social media content
- Keep it under 150 words
- Use comma-separated descriptive phrases
- Make it photorealistic and engaging

Return ONLY the prompt text, nothing else.`

  const prompt = await window.spark.llm(promptRequest, 'gpt-4o-mini')
  return prompt.trim()
}

function getPlatformImageSize(platform: string): string {
  const sizes: Record<string, string> = {
    instagram: '1024x1024',
    tiktok: '1024x1792',
    facebook: '1200x630',
    twitter: '1200x675',
    youtube: '1280x720'
  }
  return sizes[platform] || '1024x1024'
}

export async function getGrokApiKey(): Promise<string | undefined> {
  return await window.spark.kv.get<string>('grok-api-key')
}

export async function setGrokApiKey(apiKey: string): Promise<void> {
  await window.spark.kv.set('grok-api-key', apiKey)
}

export async function deleteGrokApiKey(): Promise<void> {
  await window.spark.kv.delete('grok-api-key')
}

export async function hasGrokApiKey(): Promise<boolean> {
  const key = await getGrokApiKey()
  return !!key && key.length > 0
}
