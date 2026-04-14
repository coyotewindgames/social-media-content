import { Platform, SocialAccount, PostingResult } from './types'
import { llmPrompt, callLLM } from './llm'
import { kvStorage } from '@/hooks/use-local-storage'

export interface PostData {
  caption: string
  imageUrl?: string
  videoUrl?: string
  scheduledTime?: Date
}

export interface PlatformConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string[]
  authUrl: string
  tokenUrl: string
  userInfoUrl: string
}

const PLATFORM_CONFIGS: Record<Platform, PlatformConfig> = {
  instagram: {
    clientId: import.meta.env.VITE_INSTAGRAM_CLIENT_ID || 'demo_instagram_client',
    clientSecret: import.meta.env.VITE_INSTAGRAM_CLIENT_SECRET || '',
    redirectUri: `${window.location.origin}/auth/callback`,
    scopes: ['instagram_basic', 'instagram_content_publish', 'pages_read_engagement'],
    authUrl: 'https://api.instagram.com/oauth/authorize',
    tokenUrl: 'https://api.instagram.com/oauth/access_token',
    userInfoUrl: 'https://graph.instagram.com/me',
  },
  facebook: {
    clientId: import.meta.env.VITE_FACEBOOK_CLIENT_ID || 'demo_facebook_client',
    clientSecret: import.meta.env.VITE_FACEBOOK_CLIENT_SECRET || '',
    redirectUri: `${window.location.origin}/auth/callback`,
    scopes: ['pages_manage_posts', 'pages_read_engagement', 'pages_show_list', 'public_profile'],
    authUrl: 'https://www.facebook.com/v18.0/dialog/oauth',
    tokenUrl: 'https://graph.facebook.com/v18.0/oauth/access_token',
    userInfoUrl: 'https://graph.facebook.com/me',
  },
  twitter: {
    clientId: import.meta.env.VITE_TWITTER_CLIENT_ID || 'demo_twitter_client',
    clientSecret: import.meta.env.VITE_TWITTER_CLIENT_SECRET || '',
    redirectUri: `${window.location.origin}/auth/callback`,
    scopes: ['tweet.read', 'tweet.write', 'users.read', 'offline.access'],
    authUrl: 'https://twitter.com/i/oauth2/authorize',
    tokenUrl: 'https://api.twitter.com/2/oauth2/token',
    userInfoUrl: 'https://api.twitter.com/2/users/me',
  },
  tiktok: {
    clientId: import.meta.env.VITE_TIKTOK_CLIENT_ID || 'demo_tiktok_client',
    clientSecret: import.meta.env.VITE_TIKTOK_CLIENT_SECRET || '',
    redirectUri: `${window.location.origin}/auth/callback`,
    scopes: ['video.publish', 'user.info.basic', 'user.info.profile'],
    authUrl: 'https://www.tiktok.com/v2/auth/authorize',
    tokenUrl: 'https://open.tiktokapis.com/v2/oauth/token',
    userInfoUrl: 'https://open.tiktokapis.com/v2/user/info',
  },
  youtube: {
    clientId: import.meta.env.VITE_YOUTUBE_CLIENT_ID || 'demo_youtube_client',
    clientSecret: import.meta.env.VITE_YOUTUBE_CLIENT_SECRET || '',
    redirectUri: `${window.location.origin}/auth/callback`,
    scopes: [
      'https://www.googleapis.com/auth/youtube.upload',
      'https://www.googleapis.com/auth/youtube',
      'https://www.googleapis.com/auth/userinfo.profile',
    ],
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userInfoUrl: 'https://www.googleapis.com/youtube/v3/channels',
  },
}

function generateCodeVerifier(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(verifier)
  const hash = await crypto.subtle.digest('SHA-256', data)
  const base64 = btoa(String.fromCharCode(...new Uint8Array(hash)))
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function generateState(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
}

export class SocialMediaAPI {
  static async initiateOAuth(platform: Platform): Promise<void> {
    const config = PLATFORM_CONFIGS[platform]
    const state = generateState()
    const codeVerifier = generateCodeVerifier()
    
    await kvStorage.set(`oauth_state_${state}`, { platform, codeVerifier, timestamp: Date.now() })
    
    let authUrl = ''
    
    switch (platform) {
      case 'instagram':
      case 'facebook': {
        const params = new URLSearchParams({
          client_id: config.clientId,
          redirect_uri: config.redirectUri,
          scope: config.scopes.join(','),
          response_type: 'code',
          state: state,
        })
        authUrl = `${config.authUrl}?${params.toString()}`
        break
      }
      
      case 'twitter': {
        const codeChallenge = await generateCodeChallenge(codeVerifier)
        const params = new URLSearchParams({
          response_type: 'code',
          client_id: config.clientId,
          redirect_uri: config.redirectUri,
          scope: config.scopes.join(' '),
          state: state,
          code_challenge: codeChallenge,
          code_challenge_method: 'S256',
        })
        authUrl = `${config.authUrl}?${params.toString()}`
        break
      }
      
      case 'tiktok': {
        const params = new URLSearchParams({
          client_key: config.clientId,
          scope: config.scopes.join(','),
          response_type: 'code',
          redirect_uri: config.redirectUri,
          state: state,
        })
        authUrl = `${config.authUrl}?${params.toString()}`
        break
      }
      
      case 'youtube': {
        const params = new URLSearchParams({
          client_id: config.clientId,
          redirect_uri: config.redirectUri,
          response_type: 'code',
          scope: config.scopes.join(' '),
          access_type: 'offline',
          prompt: 'consent',
          state: state,
        })
        authUrl = `${config.authUrl}?${params.toString()}`
        break
      }
      
      default:
        throw new Error(`Unsupported platform: ${platform}`)
    }
    
    window.open(authUrl, '_blank', 'width=600,height=700')
  }

  static async handleCallback(code: string, state: string): Promise<{
    platform: Platform
    accessToken: string
    refreshToken?: string
    expiresIn?: number
  }> {
    const stateData = await kvStorage.get<{ platform: Platform; codeVerifier: string; timestamp: number }>(`oauth_state_${state}`)
    
    if (!stateData) {
      throw new Error('Invalid OAuth state')
    }
    
    await kvStorage.delete(`oauth_state_${state}`)
    
    if (Date.now() - stateData.timestamp > 600000) {
      throw new Error('OAuth state expired')
    }
    
    const tokenData = await this.exchangeCodeForToken(stateData.platform, code, stateData.codeVerifier)
    
    return {
      platform: stateData.platform,
      ...tokenData,
    }
  }

  static async exchangeCodeForToken(
    platform: Platform,
    code: string,
    codeVerifier?: string
  ): Promise<{ accessToken: string; refreshToken?: string; expiresIn?: number }> {
    const timestamp = Date.now()
    const prompt = llmPrompt`Generate a mock OAuth token response for ${platform}. Return a JSON object with these fields: accessToken (string starting with "mock_${platform}_"), refreshToken (string starting with "refresh_${platform}_"), expiresIn (number 3600). Make the tokens look realistic with random alphanumeric characters. Return ONLY valid JSON.`

    const response = await callLLM(prompt, 'gpt-4o-mini', true)
    return JSON.parse(response)
  }

  static async getUserProfile(platform: Platform, accessToken: string): Promise<{
    username: string
    displayName: string
    profileImageUrl?: string
  }> {
    const timestamp = Date.now()
    const seed = Math.floor(Math.random() * 10000)
    const prompt = llmPrompt`Generate a realistic mock user profile for ${platform}. Return a JSON object with: username (string, lowercase, no spaces, like "${platform}user${seed}"), displayName (string, a real-sounding name), profileImageUrl (string, use "https://api.dicebear.com/7.x/avataaars/svg?seed=${seed}"). Return ONLY valid JSON.`

    const response = await callLLM(prompt, 'gpt-4o-mini', true)
    return JSON.parse(response)
  }

  static async postContent(
    platform: Platform,
    account: SocialAccount,
    postData: PostData
  ): Promise<PostingResult> {
    try {
      const prompt = llmPrompt`You are simulating a social media posting API response for ${platform}. The content being posted - Caption: ${postData.caption}, Has Image: ${!!postData.imageUrl}, Has Video: ${!!postData.videoUrl}. Simulate a successful post and return JSON with: success (true), postUrl (string like "https://${platform}.com/${account.username}/post/${Date.now()}"), platformPostId (string like "post_${Date.now()}"). Return ONLY valid JSON.`

      const response = await callLLM(prompt, 'gpt-4o-mini', true)
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
      const prompt = llmPrompt`You are simulating a social media scheduling API response for ${platform}. The content being scheduled - Caption: ${postData.caption}, Scheduled Time: ${scheduledTime.toISOString()}. Simulate a successful schedule and return JSON with: success (true), postUrl (string like "https://${platform}.com/${account.username}/scheduled/${Date.now()}"), platformPostId (string like "scheduled_${Date.now()}"). Return ONLY valid JSON.`

      const response = await callLLM(prompt, 'gpt-4o-mini', true)
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
    const prompt = llmPrompt`Simulate an OAuth token refresh for ${platform}. Return JSON with: accessToken (string like "refreshed_token_${Date.now()}"), expiresIn (number 3600). Return ONLY valid JSON.`

    const response = await callLLM(prompt, 'gpt-4o-mini', true)
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
    const prompt = llmPrompt`Simulate analytics data for a ${platform} post with ID: ${postId}. Generate realistic engagement metrics and return JSON with: likes (random 10-1000), comments (random 0-100), shares (random 0-50), views (random 100-10000), reach (random 200-15000). Return ONLY valid JSON.`

    const response = await callLLM(prompt, 'gpt-4o-mini', true)
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
