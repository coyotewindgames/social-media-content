export type Platform = 'instagram' | 'tiktok' | 'facebook' | 'twitter' | 'youtube'

export type ContentStatus = 'draft' | 'scheduled' | 'idea'

export type CaptionTone = 'casual' | 'professional' | 'playful' | 'inspirational'

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
}
