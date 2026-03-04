export interface ImageGenerationResult {
  success: boolean
  imageUrl?: string
  error?: string
  prompt?: string
}

export async function generateImageFromContent(
  title: string,
  description: string,
  platform: string
): Promise<ImageGenerationResult> {
  try {
    const prompt = await createImagePrompt(title, description, platform)
    
    const response = await fetch('https://subnp.com/api/txt2img', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: prompt,
        negative_prompt: 'blurry, low quality, distorted, text, watermark, logo, banner, extra limbs',
        steps: 30,
        width: platform === 'instagram' ? 1080 : platform === 'tiktok' ? 1080 : 1200,
        height: platform === 'instagram' ? 1080 : platform === 'tiktok' ? 1920 : 628,
        cfg_scale: 7,
        sampler: 'Euler a'
      })
    })

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    
    if (data.image) {
      return {
        success: true,
        imageUrl: data.image,
        prompt: prompt
      }
    } else {
      throw new Error('No image returned from API')
    }
  } catch (error) {
    console.error('Image generation error:', error)
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
  const promptRequest = window.spark.llmPrompt`You are an expert at creating prompts for AI image generation (Stable Diffusion). 

Create a detailed, vivid image generation prompt based on this social media content:

Title: ${title}
Description: ${description}
Platform: ${platform}

Requirements:
- Create a visually compelling prompt that captures the essence of the content
- Focus on visual elements: composition, lighting, style, mood, colors
- Be specific and descriptive
- Avoid text or words in the image
- Make it suitable for ${platform} content
- Keep it under 200 words
- Use comma-separated descriptive phrases

Return ONLY the prompt text, nothing else.`

  const prompt = await window.spark.llm(promptRequest, 'gpt-4o-mini')
  return prompt.trim()
}

export async function generateImageWithCustomPrompt(
  customPrompt: string,
  width: number = 1024,
  height: number = 1024
): Promise<ImageGenerationResult> {
  try {
    const response = await fetch('https://subnp.com/api/txt2img', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: customPrompt,
        negative_prompt: 'blurry, low quality, distorted, text, watermark, logo, banner, extra limbs',
        steps: 30,
        width: width,
        height: height,
        cfg_scale: 7,
        sampler: 'Euler a'
      })
    })

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    
    if (data.image) {
      return {
        success: true,
        imageUrl: data.image,
        prompt: customPrompt
      }
    } else {
      throw new Error('No image returned from API')
    }
  } catch (error) {
    console.error('Image generation error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }
  }
}
