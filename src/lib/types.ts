export type Platform = 'instagram' | 'tiktok' | 'facebook' | 'twitter' | 'youtube'

export type ContentStatus = 'draft' | 'scheduled' | 'published' | 'failed' | 'idea'

export type CaptionTone = 'casual' | 'professional' | 'playful' | 'inspirational'

export type AccountStatus = 'connected' | 'expired' | 'disconnected' | 'pending'

export interface ContentIdea {
  id: string
  title: string
  description: string
  caption: string
  platform: Platform
  scheduledDate?: string
  status: ContentStatus
  notes: string
  createdAt: string
  updatedAt: string
  linkedAccountId?: string
  publishedUrl?: string
  publishedAt?: string
  errorMessage?: string
}

export interface SocialAccount {
  id: string
  platform: Platform
  username: string
  displayName: string
  profileImageUrl?: string
  accessToken: string
  refreshToken?: string
  tokenExpiresAt?: string
  status: AccountStatus
  lastSyncedAt: string
  connectedAt: string
}

export interface PostingResult {
  success: boolean
  postUrl?: string
  errorMessage?: string
  platformPostId?: string
}
