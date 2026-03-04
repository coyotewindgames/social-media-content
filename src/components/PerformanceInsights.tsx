import { useMemo } from 'react'
import { AccountAnalytics, Platform } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Lightbulb,
  TrendUp,
  TrendDown,
  CheckCircle,
  Warning,
  Clock,
  Target,
  Sparkle,
} from '@phosphor-icons/react'
import { motion } from 'framer-motion'

interface PerformanceInsightsProps {
  analytics: AccountAnalytics
  timeRange: '7' | '30' | '90'
}

interface Insight {
  type: 'success' | 'warning' | 'info' | 'tip'
  category: 'engagement' | 'growth' | 'content' | 'timing' | 'optimization'
  title: string
  description: string
  metric?: string
  icon: React.ReactNode
  priority: number
}

interface Recommendation {
  title: string
  description: string
  impact: 'high' | 'medium' | 'low'
  effort: 'high' | 'medium' | 'low'
  category: 'posting' | 'content' | 'engagement' | 'growth'
}

export function PerformanceInsights({ analytics, timeRange }: PerformanceInsightsProps) {
  const insights = useMemo(() => {
    const results: Insight[] = []
    const metrics = analytics.metrics

    const followerGrowth = timeRange === '7'
      ? metrics.growthMetrics.followersGained7d
      : metrics.growthMetrics.followersGained30d
    const followerLoss = timeRange === '7'
      ? metrics.growthMetrics.followersLost7d
      : metrics.growthMetrics.followersLost30d
    const netGrowth = followerGrowth - followerLoss
    const growthRate = (netGrowth / metrics.followers) * 100

    if (growthRate > 5) {
      results.push({
        type: 'success',
        category: 'growth',
        title: 'Strong Growth Momentum',
        description: `Your account is growing at ${growthRate.toFixed(1)}% rate. You're gaining ${followerGrowth} followers while losing only ${followerLoss}.`,
        metric: `+${growthRate.toFixed(1)}%`,
        icon: <TrendUp size={20} weight="bold" className="text-green-500" />,
        priority: 1,
      })
    } else if (growthRate < 0) {
      results.push({
        type: 'warning',
        category: 'growth',
        title: 'Negative Growth Trend',
        description: `You're losing more followers (${followerLoss}) than gaining (${followerGrowth}). Review your recent content strategy.`,
        metric: `${growthRate.toFixed(1)}%`,
        icon: <TrendDown size={20} weight="bold" className="text-red-500" />,
        priority: 1,
      })
    } else {
      results.push({
        type: 'info',
        category: 'growth',
        title: 'Steady Growth',
        description: `Your account is growing steadily with ${followerGrowth} new followers. Consider increasing posting frequency for faster growth.`,
        metric: `+${followerGrowth}`,
        icon: <CheckCircle size={20} weight="bold" className="text-blue-500" />,
        priority: 2,
      })
    }

    if (metrics.engagementRate > 5) {
      results.push({
        type: 'success',
        category: 'engagement',
        title: 'Excellent Engagement Rate',
        description: `Your ${metrics.engagementRate.toFixed(2)}% engagement rate is above industry average. Your audience is highly engaged!`,
        metric: `${metrics.engagementRate.toFixed(2)}%`,
        icon: <CheckCircle size={20} weight="bold" className="text-green-500" />,
        priority: 1,
      })
    } else if (metrics.engagementRate < 2) {
      results.push({
        type: 'warning',
        category: 'engagement',
        title: 'Low Engagement Rate',
        description: `At ${metrics.engagementRate.toFixed(2)}%, your engagement is below average. Try more interactive content like polls, questions, or trending topics.`,
        metric: `${metrics.engagementRate.toFixed(2)}%`,
        icon: <Warning size={20} weight="bold" className="text-orange-500" />,
        priority: 1,
      })
    } else {
      results.push({
        type: 'info',
        category: 'engagement',
        title: 'Average Engagement',
        description: `Your ${metrics.engagementRate.toFixed(2)}% engagement rate is healthy. Consider experimenting with different content formats to boost it further.`,
        metric: `${metrics.engagementRate.toFixed(2)}%`,
        icon: <Target size={20} weight="bold" className="text-blue-500" />,
        priority: 2,
      })
    }

    const postsPublished = timeRange === '7'
      ? metrics.growthMetrics.postsPublished7d
      : metrics.growthMetrics.postsPublished30d
    const daysInRange = timeRange === '7' ? 7 : 30
    const postsPerDay = postsPublished / daysInRange

    const optimalFrequency = getOptimalPostingFrequency(analytics.platform)
    
    if (postsPerDay < optimalFrequency.min) {
      results.push({
        type: 'warning',
        category: 'content',
        title: 'Low Posting Frequency',
        description: `You're posting ${postsPerDay.toFixed(1)} times per day. ${getPlatformName(analytics.platform)} recommends ${optimalFrequency.min}-${optimalFrequency.max} posts daily for optimal growth.`,
        metric: `${postsPublished} posts`,
        icon: <Clock size={20} weight="bold" className="text-orange-500" />,
        priority: 1,
      })
    } else if (postsPerDay > optimalFrequency.max) {
      results.push({
        type: 'warning',
        category: 'content',
        title: 'High Posting Frequency',
        description: `Posting ${postsPerDay.toFixed(1)} times daily might overwhelm your audience. Quality over quantity leads to better engagement.`,
        metric: `${postsPublished} posts`,
        icon: <Warning size={20} weight="bold" className="text-orange-500" />,
        priority: 2,
      })
    } else {
      results.push({
        type: 'success',
        category: 'content',
        title: 'Optimal Posting Frequency',
        description: `Your ${postsPerDay.toFixed(1)} posts per day is ideal for ${getPlatformName(analytics.platform)}. Keep up the consistency!`,
        metric: `${postsPublished} posts`,
        icon: <CheckCircle size={20} weight="bold" className="text-green-500" />,
        priority: 2,
      })
    }

    const avgLikesPerFollower = metrics.averageLikes / metrics.followers * 100
    if (avgLikesPerFollower > 3) {
      results.push({
        type: 'success',
        category: 'engagement',
        title: 'High Content Resonance',
        description: `Your content gets ${avgLikesPerFollower.toFixed(2)}% like rate from your followers. Your audience loves your content!`,
        icon: <Sparkle size={20} weight="bold" className="text-purple-500" />,
        priority: 2,
      })
    }

    const engagementGrowth = timeRange === '7'
      ? metrics.growthMetrics.engagementGrowth7d
      : metrics.growthMetrics.engagementGrowth30d

    if (engagementGrowth > 10) {
      results.push({
        type: 'success',
        category: 'optimization',
        title: 'Engagement Trending Up',
        description: `Your engagement grew ${engagementGrowth}% in the last ${timeRange === '7' ? 'week' : 'month'}. Your recent strategy is working!`,
        metric: `+${engagementGrowth}%`,
        icon: <TrendUp size={20} weight="bold" className="text-green-500" />,
        priority: 1,
      })
    } else if (engagementGrowth < -5) {
      results.push({
        type: 'warning',
        category: 'optimization',
        title: 'Engagement Declining',
        description: `Engagement dropped ${Math.abs(engagementGrowth)}%. Review your recent content and consider refreshing your approach.`,
        metric: `${engagementGrowth}%`,
        icon: <TrendDown size={20} weight="bold" className="text-red-500" />,
        priority: 1,
      })
    }

    const commentRate = (metrics.averageComments / metrics.averageLikes) * 100
    if (commentRate < 5) {
      results.push({
        type: 'tip',
        category: 'engagement',
        title: 'Boost Comment Engagement',
        description: `Only ${commentRate.toFixed(1)}% of likes convert to comments. Try asking questions or encouraging discussion in your captions.`,
        icon: <Lightbulb size={20} weight="bold" className="text-yellow-500" />,
        priority: 3,
      })
    }

    return results.sort((a, b) => a.priority - b.priority)
  }, [analytics, timeRange])

  const recommendations = useMemo(() => {
    const results: Recommendation[] = []
    const metrics = analytics.metrics

    const postsPublished = timeRange === '7'
      ? metrics.growthMetrics.postsPublished7d
      : metrics.growthMetrics.postsPublished30d
    const daysInRange = timeRange === '7' ? 7 : 30
    const postsPerDay = postsPublished / daysInRange
    const optimalFrequency = getOptimalPostingFrequency(analytics.platform)

    if (postsPerDay < optimalFrequency.min) {
      results.push({
        title: 'Increase Posting Frequency',
        description: `Post at least ${optimalFrequency.min} times daily. Use the Auto-Discovery feature to generate content ideas automatically and maintain consistency.`,
        impact: 'high',
        effort: 'medium',
        category: 'posting',
      })
    }

    if (metrics.engagementRate < 3) {
      results.push({
        title: 'Create More Interactive Content',
        description: 'Use polls, questions, and trending topics to spark conversation. Content that encourages responses gets 2-3x more engagement.',
        impact: 'high',
        effort: 'low',
        category: 'content',
      })
    }

    const commentRate = (metrics.averageComments / metrics.averageLikes) * 100
    if (commentRate < 5) {
      results.push({
        title: 'Improve Call-to-Actions',
        description: 'End posts with questions like "What do you think?" or "Tag someone who needs this!" to increase comment rates.',
        impact: 'medium',
        effort: 'low',
        category: 'engagement',
      })
    }

    const bestTimes = getBestPostingTimes(analytics.platform)
    results.push({
      title: 'Optimize Posting Schedule',
      description: `Schedule posts during peak hours (${bestTimes.join(', ')}) when your audience is most active for maximum visibility.`,
      impact: 'high',
      effort: 'low',
      category: 'posting',
    })

    if (analytics.historicalData.length > 0) {
      const recentData = analytics.historicalData.slice(-7)
      const inconsistent = recentData.some((d, i, arr) => {
        if (i === 0) return false
        return Math.abs(d.engagementRate - arr[i - 1].engagementRate) > 2
      })

      if (inconsistent) {
        results.push({
          title: 'Maintain Content Consistency',
          description: 'Your engagement varies significantly. Develop a content calendar and stick to proven formats that work for your audience.',
          impact: 'medium',
          effort: 'medium',
          category: 'content',
        })
      }
    }

    const followerToFollowingRatio = metrics.followers / metrics.following
    if (followerToFollowingRatio < 1) {
      results.push({
        title: 'Focus on Organic Growth',
        description: 'Your follower-to-following ratio suggests room for improvement. Focus on quality content over follow-for-follow strategies.',
        impact: 'medium',
        effort: 'high',
        category: 'growth',
      })
    }

    results.push({
      title: 'Leverage Trending Topics',
      description: 'Use the Discover Trends feature regularly to create timely, relevant content that rides viral waves and increases discoverability.',
      impact: 'high',
      effort: 'low',
      category: 'content',
    })

    if (metrics.totalShares < metrics.totalLikes * 0.05) {
      results.push({
        title: 'Create More Shareable Content',
        description: 'Your content gets few shares. Try educational tips, inspirational quotes, or relatable memes that people want to share with friends.',
        impact: 'medium',
        effort: 'medium',
        category: 'content',
      })
    }

    return results
  }, [analytics, timeRange])

  const getInsightStyles = (type: Insight['type']) => {
    switch (type) {
      case 'success':
        return 'border-green-500/50 bg-green-500/5'
      case 'warning':
        return 'border-orange-500/50 bg-orange-500/5'
      case 'info':
        return 'border-blue-500/50 bg-blue-500/5'
      case 'tip':
        return 'border-yellow-500/50 bg-yellow-500/5'
      default:
        return 'border-border bg-card'
    }
  }

  const getImpactColor = (impact: string) => {
    switch (impact) {
      case 'high':
        return 'bg-green-500'
      case 'medium':
        return 'bg-yellow-500'
      case 'low':
        return 'bg-blue-500'
      default:
        return 'bg-gray-500'
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lightbulb size={24} weight="duotone" className="text-primary" />
            Performance Insights
          </CardTitle>
          <CardDescription>
            AI-powered analysis of your account performance
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {insights.map((insight, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className={`p-4 rounded-lg border-2 ${getInsightStyles(insight.type)}`}
            >
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-0.5">{insight.icon}</div>
                <div className="flex-1">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h4 className="font-semibold text-sm">{insight.title}</h4>
                    {insight.metric && (
                      <Badge variant="outline" className="font-mono text-xs">
                        {insight.metric}
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">{insight.description}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target size={24} weight="duotone" className="text-accent" />
            Recommendations
          </CardTitle>
          <CardDescription>
            Actionable steps to improve your performance
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {recommendations.map((rec, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-1">
                  <div className={`w-2 h-2 rounded-full ${getImpactColor(rec.impact)}`} />
                </div>
                <div className="flex-1">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h4 className="font-semibold text-sm">{rec.title}</h4>
                    <div className="flex gap-1">
                      <Badge variant="outline" className="text-xs">
                        {rec.impact} impact
                      </Badge>
                      <Badge variant="secondary" className="text-xs">
                        {rec.effort} effort
                      </Badge>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">{rec.description}</p>
                </div>
              </div>
              {index < recommendations.length - 1 && <Separator className="mt-4" />}
            </motion.div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkle size={24} weight="duotone" className="text-purple-500" />
            Quick Wins
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="p-3 bg-accent/5 rounded-lg border border-accent/20">
              <div className="flex items-center gap-2 mb-1">
                <Clock size={16} weight="bold" className="text-accent" />
                <span className="font-semibold text-sm">Best Posting Times</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {getBestPostingTimes(analytics.platform).join(', ')}
              </p>
            </div>
            <div className="p-3 bg-primary/5 rounded-lg border border-primary/20">
              <div className="flex items-center gap-2 mb-1">
                <TrendUp size={16} weight="bold" className="text-primary" />
                <span className="font-semibold text-sm">Growth Goal</span>
              </div>
              <p className="text-xs text-muted-foreground">
                +{Math.round(analytics.metrics.followers * 0.1).toLocaleString()} followers this month
              </p>
            </div>
            <div className="p-3 bg-green-500/5 rounded-lg border border-green-500/20">
              <div className="flex items-center gap-2 mb-1">
                <Target size={16} weight="bold" className="text-green-500" />
                <span className="font-semibold text-sm">Engagement Target</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Aim for {(analytics.metrics.engagementRate + 1).toFixed(1)}% engagement rate
              </p>
            </div>
            <div className="p-3 bg-blue-500/5 rounded-lg border border-blue-500/20">
              <div className="flex items-center gap-2 mb-1">
                <Sparkle size={16} weight="bold" className="text-blue-500" />
                <span className="font-semibold text-sm">Content Mix</span>
              </div>
              <p className="text-xs text-muted-foreground">
                70% value, 20% entertaining, 10% promotional
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function getPlatformName(platform: Platform): string {
  const names: Record<Platform, string> = {
    instagram: 'Instagram',
    tiktok: 'TikTok',
    facebook: 'Facebook',
    twitter: 'Twitter',
    youtube: 'YouTube',
  }
  return names[platform]
}

function getOptimalPostingFrequency(platform: Platform): { min: number; max: number } {
  const frequencies: Record<Platform, { min: number; max: number }> = {
    instagram: { min: 1, max: 3 },
    tiktok: { min: 1, max: 4 },
    facebook: { min: 1, max: 2 },
    twitter: { min: 3, max: 10 },
    youtube: { min: 0.3, max: 1 },
  }
  return frequencies[platform]
}

function getBestPostingTimes(platform: Platform): string[] {
  const times: Record<Platform, string[]> = {
    instagram: ['9 AM', '12 PM', '6 PM'],
    tiktok: ['7 AM', '4 PM', '9 PM'],
    facebook: ['9 AM', '1 PM', '3 PM'],
    twitter: ['8 AM', '12 PM', '5 PM'],
    youtube: ['2 PM', '5 PM', '9 PM'],
  }
  return times[platform]
}
