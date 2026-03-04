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
  generatedImageUrl?: string
  imagePrompt?: string
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

export interface AccountAnalytics {
  accountId: string
  platform: Platform
  username: string
  metrics: AccountMetrics
  posts: PostMetrics[]
  historicalData: HistoricalMetric[]
  lastUpdated: string
}

export interface AccountMetrics {
  followers: number
  following: number
  totalPosts: number
  totalLikes: number
  totalComments: number
  totalShares: number
  totalViews: number
  totalReach: number
  engagementRate: number
  averageLikes: number
  averageComments: number
  growthMetrics: GrowthMetrics
}

export interface GrowthMetrics {
  followersGained7d: number
  followersGained30d: number
  followersGainedAllTime: number
  followersLost7d: number
  followersLost30d: number
  postsPublished7d: number
  postsPublished30d: number
  engagementGrowth7d: number
  engagementGrowth30d: number
}

export interface PostMetrics {
  postId: string
  contentId: string
  postUrl: string
  publishedAt: string
  caption: string
  likes: number
  comments: number
  shares: number
  views: number
  reach: number
  engagementRate: number
  saves?: number
  clicks?: number
}

export interface HistoricalMetric {
  date: string
  followers: number
  following: number
  posts: number
  likes: number
  comments: number
  shares: number
  views: number
  reach: number
  engagementRate: number
}
