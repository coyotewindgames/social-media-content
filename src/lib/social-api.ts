import { Platform, SocialAccount, PostingResult } from './types'

export interface PostData {
  caption: string
  imageUrl?: string
  videoUrl?: string
  scheduledTime?: Date
}

export interface PlatformConfig {
  clientId: string
  redirectUri: string
  scopes: string[]
}

const PLATFORM_CONFIGS: Record<Platform, PlatformConfig> = {
  instagram: {
    clientId: import.meta.env.VITE_INSTAGRAM_CLIENT_ID || '',
    redirectUri: `${window.location.origin}/auth/callback`,
    scopes: ['instagram_basic', 'instagram_content_publish'],
  },
  facebook: {
    clientId: import.meta.env.VITE_FACEBOOK_CLIENT_ID || '',
    redirectUri: `${window.location.origin}/auth/callback`,
    scopes: ['pages_manage_posts', 'pages_read_engagement', 'pages_show_list'],
  },
  twitter: {
    clientId: import.meta.env.VITE_TWITTER_CLIENT_ID || '',
    redirectUri: `${window.location.origin}/auth/callback`,
    scopes: ['tweet.read', 'tweet.write', 'users.read'],
  },
  tiktok: {
    clientId: import.meta.env.VITE_TIKTOK_CLIENT_ID || '',
    redirectUri: `${window.location.origin}/auth/callback`,
    scopes: ['video.publish', 'user.info.basic'],
  },
  youtube: {
    clientId: import.meta.env.VITE_YOUTUBE_CLIENT_ID || '',
    redirectUri: `${window.location.origin}/auth/callback`,
    scopes: ['https://www.googleapis.com/auth/youtube.upload'],
  },
}

export class SocialMediaAPI {
  static getAuthUrl(platform: Platform): string {
    const config = PLATFORM_CONFIGS[platform]
    
    switch (platform) {
      case 'instagram':
      case 'facebook':
        return `https://www.facebook.com/v18.0/dialog/oauth?client_id=${config.clientId}&redirect_uri=${encodeURIComponent(config.redirectUri)}&scope=${config.scopes.join(',')}&response_type=code&state=${platform}`
      
      case 'twitter':
        return `https://twitter.com/i/oauth2/authorize?response_type=code&client_id=${config.clientId}&redirect_uri=${encodeURIComponent(config.redirectUri)}&scope=${config.scopes.join(' ')}&state=${platform}&code_challenge=challenge&code_challenge_method=plain`
      
      case 'tiktok':
        return `https://www.tiktok.com/v2/auth/authorize?client_key=${config.clientId}&scope=${config.scopes.join(',')}&response_type=code&redirect_uri=${encodeURIComponent(config.redirectUri)}&state=${platform}`
      
      case 'youtube':
        return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${config.clientId}&redirect_uri=${encodeURIComponent(config.redirectUri)}&response_type=code&scope=${encodeURIComponent(config.scopes.join(' '))}&access_type=offline&state=${platform}`
      
      default:
        throw new Error(`Unsupported platform: ${platform}`)
    }
  }

  static async exchangeCodeForToken(
    platform: Platform,
    code: string
  ): Promise<{ accessToken: string; refreshToken?: string; expiresIn?: number }> {
    const prompt = window.spark.llmPrompt`You are simulating an OAuth token exchange response for ${platform}. 
Given the authorization code: ${code}

Return a JSON object with the following structure:
{
  "accessToken": "mock_access_token_${Date.now()}",
  "refreshToken": "mock_refresh_token_${Date.now()}",
  "expiresIn": 3600
}

Return ONLY valid JSON, no other text.`

    const response = await window.spark.llm(prompt, 'gpt-4o-mini', true)
    return JSON.parse(response)
  }

  static async getUserProfile(platform: Platform, accessToken: string): Promise<{
    username: string
    displayName: string
    profileImageUrl?: string
  }> {
    const prompt = window.spark.llmPrompt`You are simulating a social media API response for ${platform}.
Generate a realistic user profile with the following structure:
{
  "username": "user_${Date.now()}",
  "displayName": "Creative User",
  "profileImageUrl": "https://api.dicebear.com/7.x/avataaars/svg?seed=${Date.now()}"
}

Return ONLY valid JSON, no other text.`

    const response = await window.spark.llm(prompt, 'gpt-4o-mini', true)
    return JSON.parse(response)
  }

  static async postContent(
    platform: Platform,
    account: SocialAccount,
    postData: PostData
  ): Promise<PostingResult> {
    try {
      const prompt = window.spark.llmPrompt`You are simulating a social media posting API response for ${platform}.
The content being posted:
Caption: ${postData.caption}
Has Image: ${!!postData.imageUrl}
Has Video: ${!!postData.videoUrl}

Simulate a successful post and return JSON with:
{
  "success": true,
  "postUrl": "https://${platform}.com/${account.username}/post/${Date.now()}",
  "platformPostId": "post_${Date.now()}"
}

Return ONLY valid JSON, no other text.`

      const response = await window.spark.llm(prompt, 'gpt-4o-mini', true)
      const result = JSON.parse(response)
      
      return {
        success: result.success,
        postUrl: result.postUrl,
        platformPostId: result.platformPostId,
      }
    } catch (error) {
      return {
        success: false,
        errorMessage: error instanceof Error ? error.message : 'Failed to post content',
      }
    }
  }

  static async schedulePost(
    platform: Platform,
    account: SocialAccount,
    postData: PostData,
    scheduledTime: Date
  ): Promise<PostingResult> {
    try {
      const prompt = window.spark.llmPrompt`You are simulating a social media scheduling API response for ${platform}.
The content being scheduled:
Caption: ${postData.caption}
Scheduled Time: ${scheduledTime.toISOString()}

Simulate a successful schedule and return JSON with:
{
  "success": true,
  "postUrl": "https://${platform}.com/${account.username}/scheduled/${Date.now()}",
  "platformPostId": "scheduled_${Date.now()}"
}

Return ONLY valid JSON, no other text.`

      const response = await window.spark.llm(prompt, 'gpt-4o-mini', true)
      const result = JSON.parse(response)
      
      return {
        success: result.success,
        postUrl: result.postUrl,
        platformPostId: result.platformPostId,
      }
    } catch (error) {
      return {
        success: false,
        errorMessage: error instanceof Error ? error.message : 'Failed to schedule content',
      }
    }
  }

  static async refreshAccessToken(
    platform: Platform,
    refreshToken: string
  ): Promise<{ accessToken: string; expiresIn: number }> {
    const prompt = window.spark.llmPrompt`Simulate an OAuth token refresh for ${platform}.
Return JSON with:
{
  "accessToken": "refreshed_token_${Date.now()}",
  "expiresIn": 3600
}

Return ONLY valid JSON, no other text.`

    const response = await window.spark.llm(prompt, 'gpt-4o-mini', true)
    return JSON.parse(response)
  }

  static async getPostAnalytics(
    platform: Platform,
    account: SocialAccount,
    postId: string
  ): Promise<{
    likes: number
    comments: number
    shares: number
    views: number
    reach: number
  }> {
    const prompt = window.spark.llmPrompt`Simulate analytics data for a ${platform} post with ID: ${postId}.
Generate realistic engagement metrics and return JSON with:
{
  "likes": (random number between 10-1000),
  "comments": (random number between 0-100),
  "shares": (random number between 0-50),
  "views": (random number between 100-10000),
  "reach": (random number between 200-15000)
}

Return ONLY valid JSON, no other text.`

    const response = await window.spark.llm(prompt, 'gpt-4o-mini', true)
    return JSON.parse(response)
  }

  static validateAccount(account: SocialAccount): boolean {
    if (!account.accessToken) return false
    
    if (account.tokenExpiresAt) {
      const expiryDate = new Date(account.tokenExpiresAt)
      if (expiryDate < new Date()) {
        return false
      }
    }
    
    return account.status === 'connected'
  }

  static getPlatformName(platform: Platform): string {
    return platform.charAt(0).toUpperCase() + platform.slice(1)
  }

  static getPlatformPostingLimits(platform: Platform): {
    maxCaptionLength: number
    supportsImages: boolean
    supportsVideos: boolean
    maxVideoSizeMB: number
  } {
    const limits = {
      instagram: {
        maxCaptionLength: 2200,
        supportsImages: true,
        supportsVideos: true,
        maxVideoSizeMB: 100,
      },
      facebook: {
        maxCaptionLength: 63206,
        supportsImages: true,
        supportsVideos: true,
        maxVideoSizeMB: 4000,
      },
      twitter: {
        maxCaptionLength: 280,
        supportsImages: true,
        supportsVideos: true,
        maxVideoSizeMB: 512,
      },
      tiktok: {
        maxCaptionLength: 2200,
        supportsImages: false,
        supportsVideos: true,
        maxVideoSizeMB: 287,
      },
      youtube: {
        maxCaptionLength: 5000,
        supportsImages: false,
        supportsVideos: true,
        maxVideoSizeMB: 128000,
      },
    }

    return limits[platform]
  }
}
