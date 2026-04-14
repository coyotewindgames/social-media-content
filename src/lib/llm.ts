/**
 * LLM utility module
 * 
 * This module provides LLM functionality for the application.
 * Since GitHub Spark integration has been removed, this provides placeholder
 * implementations that can be connected to alternative AI backends.
 * 
 * To integrate with a real LLM provider:
 * 1. Replace the placeholder implementations with actual API calls
 * 2. Consider using OpenAI, Anthropic, or other AI provider APIs
 * 3. Store API keys securely in environment variables
 */

/**
 * Creates a tagged template literal for LLM prompts.
 * This allows for safe interpolation of values into prompts.
 */
export function llmPrompt(
  strings: TemplateStringsArray,
  ...values: unknown[]
): string {
  return strings.reduce((result, str, i) => {
    return result + str + (values[i] !== undefined ? String(values[i]) : '')
  }, '')
}

/**
 * Calls the LLM with a prompt and returns the response.
 * 
 * @param prompt - The prompt to send to the LLM
 * @param model - The model to use (e.g., 'gpt-4o-mini', 'gpt-4o')
 * @param jsonMode - Whether to request JSON output
 * @returns The LLM response as a string
 * 
 * Note: This is a placeholder implementation. In production, connect to a real LLM API.
 */
export async function callLLM(
  prompt: string,
  model: string = 'gpt-4o-mini',
  jsonMode: boolean = false
): Promise<string> {
  // Check if OpenAI API key is configured
  const apiKey = import.meta.env.VITE_OPENAI_API_KEY
  
  if (apiKey) {
    // Use OpenAI API if configured
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
          ...(jsonMode && { response_format: { type: 'json_object' } })
        })
      })

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`)
      }

      const data = await response.json()
      return data.choices[0].message.content
    } catch (error) {
      console.error('OpenAI API call failed:', error)
      throw error
    }
  }

  // Fallback: Return placeholder responses based on what's being requested
  console.warn('LLM API not configured. Using placeholder responses.')
  
  // Generate mock responses for common request types
  if (prompt.includes('trending topics') || prompt.includes('trends analyst')) {
    return JSON.stringify({
      topics: [
        {
          topic: 'AI and Automation',
          category: 'Technology',
          relevance: 'AI tools are revolutionizing content creation',
          suggestedPlatforms: ['instagram', 'twitter', 'youtube'],
          contentAngle: 'Share how AI is changing your workflow'
        },
        {
          topic: 'Sustainable Living',
          category: 'Lifestyle',
          relevance: 'Growing awareness of environmental impact',
          suggestedPlatforms: ['instagram', 'tiktok'],
          contentAngle: 'Tips for eco-friendly daily habits'
        },
        {
          topic: 'Remote Work Evolution',
          category: 'Business',
          relevance: 'Hybrid work models becoming standard',
          suggestedPlatforms: ['twitter', 'facebook'],
          contentAngle: 'Best practices for remote productivity'
        }
      ]
    })
  }

  if (prompt.includes('mock OAuth token') || prompt.includes('token response')) {
    const timestamp = Date.now()
    return JSON.stringify({
      accessToken: `mock_token_${timestamp}_${Math.random().toString(36).substr(2, 9)}`,
      refreshToken: `refresh_token_${timestamp}_${Math.random().toString(36).substr(2, 9)}`,
      expiresIn: 3600
    })
  }

  if (prompt.includes('mock user profile') || prompt.includes('Generate a realistic mock user profile')) {
    const seed = Math.floor(Math.random() * 10000)
    return JSON.stringify({
      username: `user${seed}`,
      displayName: `Demo User ${seed}`,
      profileImageUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${seed}`
    })
  }

  if (prompt.includes('analytics data') || prompt.includes('Generate realistic analytics')) {
    return JSON.stringify({
      accountId: 'demo-account',
      platform: 'instagram',
      username: 'demo_user',
      metrics: {
        followers: Math.floor(Math.random() * 50000) + 500,
        following: Math.floor(Math.random() * 1000) + 100,
        totalPosts: Math.floor(Math.random() * 500) + 50,
        totalLikes: Math.floor(Math.random() * 100000) + 5000,
        totalComments: Math.floor(Math.random() * 5000) + 200,
        totalShares: Math.floor(Math.random() * 2000) + 100,
        totalViews: Math.floor(Math.random() * 500000) + 10000,
        totalReach: Math.floor(Math.random() * 1000000) + 20000,
        engagementRate: (Math.random() * 5 + 1).toFixed(2),
        averageLikes: Math.floor(Math.random() * 1000) + 100,
        averageComments: Math.floor(Math.random() * 50) + 5,
        growthMetrics: {
          followersGained7d: Math.floor(Math.random() * 500) + 10,
          followersGained30d: Math.floor(Math.random() * 2000) + 50,
          followersGainedAllTime: Math.floor(Math.random() * 10000) + 1000,
          followersLost7d: Math.floor(Math.random() * 100) + 5,
          followersLost30d: Math.floor(Math.random() * 400) + 20,
          postsPublished7d: Math.floor(Math.random() * 14) + 1,
          postsPublished30d: Math.floor(Math.random() * 60) + 5,
          engagementGrowth7d: (Math.random() * 30 - 5).toFixed(2),
          engagementGrowth30d: (Math.random() * 60 - 10).toFixed(2)
        }
      },
      posts: [],
      historicalData: [],
      lastUpdated: new Date().toISOString()
    })
  }

  if (prompt.includes('post analytics') || prompt.includes('realistic post analytics')) {
    return JSON.stringify({
      likes: Math.floor(Math.random() * 5000) + 10,
      comments: Math.floor(Math.random() * 300),
      shares: Math.floor(Math.random() * 100),
      views: Math.floor(Math.random() * 50000) + 100,
      reach: Math.floor(Math.random() * 100000) + 200,
      engagementRate: (Math.random() * 10).toFixed(2),
      saves: Math.floor(Math.random() * 500) + 5,
      clicks: Math.floor(Math.random() * 1000) + 10
    })
  }

  if (prompt.includes('historical analytics') || prompt.includes('days of historical')) {
    const days = 30
    const data = []
    let followers = 5000
    let posts = 100
    let likes = 10000
    
    for (let i = days; i >= 0; i--) {
      const date = new Date()
      date.setDate(date.getDate() - i)
      
      followers += Math.floor(Math.random() * 50) - 10
      posts += Math.random() > 0.7 ? 1 : 0
      likes += Math.floor(Math.random() * 500)
      
      data.push({
        date: date.toISOString().split('T')[0],
        followers,
        following: 350 + Math.floor(Math.random() * 20),
        posts,
        likes,
        comments: Math.floor(likes * 0.05),
        shares: Math.floor(likes * 0.02),
        views: likes * 5,
        reach: likes * 10,
        engagementRate: (Math.random() * 6 + 2).toFixed(2)
      })
    }
    return JSON.stringify({ data })
  }

  if (prompt.includes('simulating a social media posting') || prompt.includes('simulating a social media scheduling')) {
    const timestamp = Date.now()
    return JSON.stringify({
      success: true,
      postUrl: `https://example.com/post/${timestamp}`,
      platformPostId: `post_${timestamp}`
    })
  }

  if (prompt.includes('token refresh') || prompt.includes('Simulate an OAuth token refresh')) {
    return JSON.stringify({
      accessToken: `refreshed_token_${Date.now()}`,
      expiresIn: 3600
    })
  }

  if (prompt.includes('Simulate analytics data') || prompt.includes('engagement metrics')) {
    return JSON.stringify({
      likes: Math.floor(Math.random() * 991) + 10,
      comments: Math.floor(Math.random() * 101),
      shares: Math.floor(Math.random() * 51),
      views: Math.floor(Math.random() * 9901) + 100,
      reach: Math.floor(Math.random() * 14801) + 200
    })
  }

  if (prompt.includes('image generation prompt') || prompt.includes('prompts for AI image generation')) {
    return 'A vibrant, eye-catching social media image with modern aesthetics, professional photography style, bright colors, clean composition, engaging visual elements, trending design, high quality, sharp focus'
  }

  if (prompt.includes('viral social media content') || prompt.includes('Create a compelling')) {
    return JSON.stringify({
      title: 'Trending Topic Update',
      description: 'A visually engaging post about current trends',
      caption: '🔥 What\'s trending right now! Check out the latest updates and share your thoughts. #trending #viral #socialmedia'
    })
  }

  // Default fallback
  return jsonMode 
    ? JSON.stringify({ message: 'LLM API not configured. Please set VITE_OPENAI_API_KEY in your environment.' })
    : 'LLM API not configured. Please set VITE_OPENAI_API_KEY in your environment.'
}

// Make llm functions available globally for backward compatibility
declare global {
  interface Window {
    llm: {
      prompt: typeof llmPrompt
      call: typeof callLLM
    }
  }
}

// Initialize global llm object
if (typeof window !== 'undefined') {
  window.llm = {
    prompt: llmPrompt,
    call: callLLM
  }
}
