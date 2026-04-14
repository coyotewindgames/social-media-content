import {
  Platform,
  SocialAccount,
  AccountAnalytics,
  AccountMetrics,
  PostMetrics,
  HistoricalMetric,
  GrowthMetrics,
} from './types'
import { llmPrompt, callLLM } from './llm'

export class AnalyticsAPI {
  static async fetchAccountAnalytics(account: SocialAccount): Promise<AccountAnalytics> {
    const prompt = llmPrompt`Generate realistic analytics data for a ${account.platform} account named @${account.username}. Return valid JSON with these exact fields:
{
  "accountId": "${account.id}",
  "platform": "${account.platform}",
  "username": "${account.username}",
  "metrics": {
    "followers": (random 500-50000),
    "following": (random 100-1000),
    "totalPosts": (random 50-500),
    "totalLikes": (random 5000-100000),
    "totalComments": (random 200-5000),
    "totalShares": (random 100-2000),
    "totalViews": (random 10000-500000),
    "totalReach": (random 20000-1000000),
    "engagementRate": (calculate as: (totalLikes + totalComments + totalShares) / (totalPosts * followers) * 100, round to 2 decimals),
    "averageLikes": (totalLikes / totalPosts, round to integer),
    "averageComments": (totalComments / totalPosts, round to integer),
    "growthMetrics": {
      "followersGained7d": (random 10-500),
      "followersGained30d": (random 50-2000),
      "followersGainedAllTime": (should be less than followers count),
      "followersLost7d": (random 5-100),
      "followersLost30d": (random 20-400),
      "postsPublished7d": (random 1-14),
      "postsPublished30d": (random 5-60),
      "engagementGrowth7d": (random -5 to 25, round to 2 decimals),
      "engagementGrowth30d": (random -10 to 50, round to 2 decimals)
    }
  },
  "posts": [],
  "historicalData": [],
  "lastUpdated": "${new Date().toISOString()}"
}
Return ONLY valid JSON.`

    const response = await callLLM(prompt, 'gpt-4o-mini', true)
    return JSON.parse(response)
  }

  static async fetchPostAnalytics(
    account: SocialAccount,
    postId: string,
    contentId: string,
    postUrl: string,
    publishedAt: string,
    caption: string
  ): Promise<PostMetrics> {
    const prompt = llmPrompt`Generate realistic post analytics for a ${account.platform} post. Return valid JSON with these exact fields:
{
  "postId": "${postId}",
  "contentId": "${contentId}",
  "postUrl": "${postUrl}",
  "publishedAt": "${publishedAt}",
  "caption": "${caption.substring(0, 100)}",
  "likes": (random 10-5000),
  "comments": (random 0-300),
  "shares": (random 0-100),
  "views": (random 100-50000),
  "reach": (random 200-100000),
  "engagementRate": (calculate as: (likes + comments + shares) / reach * 100, round to 2 decimals),
  "saves": (random 5-500, optional for instagram),
  "clicks": (random 10-1000, optional)
}
Return ONLY valid JSON.`

    const response = await callLLM(prompt, 'gpt-4o-mini', true)
    return JSON.parse(response)
  }

  static async fetchHistoricalData(
    account: SocialAccount,
    days: number = 30
  ): Promise<HistoricalMetric[]> {
    const prompt = llmPrompt`Generate ${days} days of historical analytics data for a ${account.platform} account. Create a realistic growth trend showing gradual increases. Return valid JSON object with a single property "data" containing an array of ${days} objects, each with:
{
  "data": [
    {
      "date": "YYYY-MM-DD" (start from ${days} days ago),
      "followers": (number, start around 5000 and gradually increase),
      "following": (number, relatively stable around 300-500),
      "posts": (number, increase by 1-2 occasionally),
      "likes": (cumulative number, gradually increasing),
      "comments": (cumulative number, gradually increasing),
      "shares": (cumulative number, gradually increasing),
      "views": (cumulative number, gradually increasing),
      "reach": (cumulative number, gradually increasing),
      "engagementRate": (percentage 2-8%, slight fluctuations)
    },
    ...more entries for each day
  ]
}
Make the data show realistic growth patterns. Return ONLY valid JSON.`

    const response = await callLLM(prompt, 'gpt-4o-mini', true)
    const parsed = JSON.parse(response)
    return parsed.data || []
  }

  static async syncAccountAnalytics(accountId: string): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }

  static calculateEngagementRate(
    likes: number,
    comments: number,
    shares: number,
    reach: number
  ): number {
    if (reach === 0) return 0
    return parseFloat(((likes + comments + shares) / reach * 100).toFixed(2))
  }

  static calculateGrowthPercentage(current: number, previous: number): number {
    if (previous === 0) return 0
    return parseFloat(((current - previous) / previous * 100).toFixed(2))
  }

  static formatNumber(num: number): string {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M'
    }
    if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K'
    }
    return num.toString()
  }

  static getTimeRangeLabel(days: number): string {
    if (days === 7) return 'Last 7 days'
    if (days === 30) return 'Last 30 days'
    if (days === 90) return 'Last 90 days'
    return `Last ${days} days`
  }

  static getBestPostingTime(historicalData: HistoricalMetric[]): string {
    const times = ['9:00 AM', '12:00 PM', '3:00 PM', '6:00 PM', '9:00 PM']
    return times[Math.floor(Math.random() * times.length)]
  }

  static getTopPerformingContent(posts: PostMetrics[], metric: 'likes' | 'comments' | 'views' | 'engagementRate' = 'likes', limit: number = 5): PostMetrics[] {
    return [...posts].sort((a, b) => b[metric] - a[metric]).slice(0, limit)
  }

  static getAudienceInsights(): {
    topCountries: string[]
    topCities: string[]
    ageGroups: { range: string; percentage: number }[]
    genderSplit: { male: number; female: number; other: number }
  } {
    return {
      topCountries: ['United States', 'United Kingdom', 'Canada', 'Australia', 'Germany'],
      topCities: ['New York', 'Los Angeles', 'London', 'Toronto', 'Sydney'],
      ageGroups: [
        { range: '13-17', percentage: 8 },
        { range: '18-24', percentage: 32 },
        { range: '25-34', percentage: 38 },
        { range: '35-44', percentage: 15 },
        { range: '45+', percentage: 7 },
      ],
      genderSplit: {
        male: 48,
        female: 50,
        other: 2,
      },
    }
  }
}
