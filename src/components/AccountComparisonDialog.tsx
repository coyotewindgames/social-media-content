import { useState, useEffect, useMemo } from 'react'
import { useLocalStorage } from '@/hooks/use-local-storage'
import { SocialAccount, AccountAnalytics, Platform } from '@/lib/types'
import { AnalyticsAPI } from '@/lib/analytics-api'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import {
  TrendUp,
  TrendDown,
  Users,
  Heart,
  ChatCircle,
  Eye,
  Article,
  Scales,
  Crown,
  ArrowClockwise,
} from '@phosphor-icons/react'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'

interface AccountComparisonDialogProps {
  open: boolean
  onClose: () => void
}

const platformColors: Record<Platform, string> = {
  instagram: '#E1306C',
  tiktok: '#000000',
  facebook: '#1877F2',
  twitter: '#1DA1F2',
  youtube: '#FF0000',
}

export function AccountComparisonDialog({ open, onClose }: AccountComparisonDialogProps) {
  const [accounts] = useLocalStorage<SocialAccount[]>('social-accounts', [])
  const [analytics, setAnalytics] = useLocalStorage<Record<string, AccountAnalytics>>('account-analytics', {})
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([])
  const [timeRange, setTimeRange] = useState<'7' | '30' | '90'>('30')
  const [loading, setLoading] = useState(false)

  const selectedAccounts = useMemo(() => {
    return (accounts || []).filter((acc) => selectedAccountIds.includes(acc.id))
  }, [accounts, selectedAccountIds])

  const selectedAnalytics = useMemo(() => {
    return selectedAccountIds
      .map((id) => analytics?.[id])
      .filter((a): a is AccountAnalytics => a !== undefined)
  }, [analytics, selectedAccountIds])

  useEffect(() => {
    if (open && accounts && accounts.length > 0 && selectedAccountIds.length === 0) {
      const initialIds = accounts.slice(0, Math.min(3, accounts.length)).map((a) => a.id)
      setSelectedAccountIds(initialIds)
    }
  }, [open, accounts, selectedAccountIds])

  const handleToggleAccount = (accountId: string) => {
    setSelectedAccountIds((prev) => {
      if (prev.includes(accountId)) {
        return prev.filter((id) => id !== accountId)
      } else {
        if (prev.length >= 5) {
          toast.error('Maximum 5 accounts can be compared at once')
          return prev
        }
        return [...prev, accountId]
      }
    })
  }

  const handleRefreshAll = async () => {
    setLoading(true)
    try {
      const updates: Record<string, AccountAnalytics> = {}

      for (const account of selectedAccounts) {
        const accountAnalytics = await AnalyticsAPI.fetchAccountAnalytics(account)
        const historicalData = await AnalyticsAPI.fetchHistoricalData(
          account,
          parseInt(timeRange)
        )
        updates[account.id] = {
          ...accountAnalytics,
          historicalData,
        }
      }

      setAnalytics((current) => ({
        ...(current || {}),
        ...updates,
      }))

      toast.success('All analytics refreshed!')
    } catch (error) {
      toast.error('Failed to refresh analytics')
    } finally {
      setLoading(false)
    }
  }

  const comparisonData = useMemo(() => {
    if (selectedAnalytics.length === 0) return []

    return selectedAnalytics.map((analytic) => ({
      name: analytic.username,
      platform: analytic.platform,
      followers: analytic.metrics.followers,
      engagement: analytic.metrics.engagementRate,
      totalLikes: analytic.metrics.totalLikes,
      totalComments: analytic.metrics.totalComments,
      totalPosts: analytic.metrics.totalPosts,
      avgLikes: analytic.metrics.averageLikes,
      avgComments: analytic.metrics.averageComments,
      followersGained: timeRange === '7' 
        ? analytic.metrics.growthMetrics.followersGained7d
        : analytic.metrics.growthMetrics.followersGained30d,
      engagementGrowth: timeRange === '7'
        ? analytic.metrics.growthMetrics.engagementGrowth7d
        : analytic.metrics.growthMetrics.engagementGrowth30d,
    }))
  }, [selectedAnalytics, timeRange])

  const radarData = useMemo(() => {
    if (selectedAnalytics.length === 0) return []

    const maxValues = {
      engagement: Math.max(...selectedAnalytics.map((a) => a.metrics.engagementRate)),
      followers: Math.max(...selectedAnalytics.map((a) => a.metrics.followers)),
      posts: Math.max(...selectedAnalytics.map((a) => a.metrics.totalPosts)),
      avgLikes: Math.max(...selectedAnalytics.map((a) => a.metrics.averageLikes)),
      avgComments: Math.max(...selectedAnalytics.map((a) => a.metrics.averageComments)),
    }

    const metrics = ['Engagement', 'Followers', 'Posts', 'Avg Likes', 'Avg Comments']

    return metrics.map((metric) => {
      const dataPoint: any = { metric }
      
      selectedAnalytics.forEach((analytic) => {
        let value = 0
        switch (metric) {
          case 'Engagement':
            value = maxValues.engagement > 0 ? (analytic.metrics.engagementRate / maxValues.engagement) * 100 : 0
            break
          case 'Followers':
            value = maxValues.followers > 0 ? (analytic.metrics.followers / maxValues.followers) * 100 : 0
            break
          case 'Posts':
            value = maxValues.posts > 0 ? (analytic.metrics.totalPosts / maxValues.posts) * 100 : 0
            break
          case 'Avg Likes':
            value = maxValues.avgLikes > 0 ? (analytic.metrics.averageLikes / maxValues.avgLikes) * 100 : 0
            break
          case 'Avg Comments':
            value = maxValues.avgComments > 0 ? (analytic.metrics.averageComments / maxValues.avgComments) * 100 : 0
            break
        }
        dataPoint[analytic.username] = value
      })
      
      return dataPoint
    })
  }, [selectedAnalytics])

  const topPerformer = useMemo(() => {
    if (selectedAnalytics.length === 0) return null

    const sorted = [...selectedAnalytics].sort((a, b) => 
      b.metrics.engagementRate - a.metrics.engagementRate
    )

    return sorted[0]
  }, [selectedAnalytics])

  const ComparisonMetricCard = ({
    title,
    data,
    dataKey,
    icon,
    color,
    format = (val: number) => val.toString(),
  }: {
    title: string
    data: any[]
    dataKey: string
    icon: React.ReactNode
    color: string
    format?: (val: number) => string
  }) => (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
            <XAxis dataKey="name" fontSize={12} angle={-45} textAnchor="end" height={80} />
            <YAxis fontSize={12} />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
              }}
              formatter={(value: any) => format(Number(value))}
            />
            <Bar dataKey={dataKey} fill={color} radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )

  if (!accounts || accounts.length === 0) {
    return (
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Scales size={28} weight="duotone" className="text-primary" />
              Account Comparison
            </DialogTitle>
          </DialogHeader>
          <div className="text-center py-12">
            <Scales size={64} className="mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-4">
              No accounts connected yet. Connect at least 2 accounts to compare performance.
            </p>
            <Button onClick={onClose}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  if (accounts.length < 2) {
    return (
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Scales size={28} weight="duotone" className="text-primary" />
              Account Comparison
            </DialogTitle>
          </DialogHeader>
          <div className="text-center py-12">
            <Scales size={64} className="mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-4">
              Connect at least 2 accounts to compare their performance side-by-side.
            </p>
            <Button onClick={onClose}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-[98vw] max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-2xl flex items-center gap-2 mb-2">
                <Scales size={28} weight="duotone" className="text-primary" />
                Account Performance Comparison
              </DialogTitle>
              <DialogDescription>
                Compare performance metrics across multiple accounts side-by-side
              </DialogDescription>
            </div>
            <div className="flex items-center gap-3">
              <Select value={timeRange} onValueChange={(v) => setTimeRange(v as '7' | '30' | '90')}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">Last 7 days</SelectItem>
                  <SelectItem value="30">Last 30 days</SelectItem>
                  <SelectItem value="90">Last 90 days</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="icon"
                onClick={handleRefreshAll}
                disabled={loading || selectedAccountIds.length === 0}
              >
                <ArrowClockwise size={18} className={loading ? 'animate-spin' : ''} />
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Select Accounts to Compare (max 5)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                <AnimatePresence>
                  {(accounts || []).map((account) => {
                    const isSelected = selectedAccountIds.includes(account.id)
                    return (
                      <motion.div
                        key={account.id}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                      >
                        <Card
                          className={`cursor-pointer transition-all ${
                            isSelected
                              ? 'ring-2 ring-primary shadow-lg'
                              : 'hover:shadow-md'
                          }`}
                          onClick={() => handleToggleAccount(account.id)}
                        >
                          <CardContent className="p-4 flex flex-col items-center gap-2">
                            <div className="relative">
                              <Avatar className="h-14 w-14">
                                <AvatarImage src={account.profileImageUrl} />
                                <AvatarFallback>
                                  {account.username.slice(0, 2).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              <div className="absolute -top-1 -right-1">
                                <Checkbox
                                  checked={isSelected}
                                  onCheckedChange={() => handleToggleAccount(account.id)}
                                  className="h-5 w-5"
                                />
                              </div>
                            </div>
                            <div className="text-center w-full">
                              <p className="font-semibold text-sm truncate">
                                @{account.username}
                              </p>
                              <Badge
                                variant="secondary"
                                className="text-xs mt-1"
                                style={{
                                  backgroundColor: `${platformColors[account.platform]}20`,
                                  color: platformColors[account.platform],
                                }}
                              >
                                {account.platform}
                              </Badge>
                            </div>
                          </CardContent>
                        </Card>
                      </motion.div>
                    )
                  })}
                </AnimatePresence>
              </div>
            </CardContent>
          </Card>

          {selectedAccountIds.length === 0 ? (
            <div className="text-center py-12 bg-muted/30 rounded-lg border-2 border-dashed">
              <Scales size={64} className="mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                Select at least one account to view comparison data
              </p>
            </div>
          ) : loading ? (
            <div className="text-center py-12">
              <ArrowClockwise size={48} className="mx-auto text-primary animate-spin mb-4" />
              <p className="text-muted-foreground">Loading analytics...</p>
            </div>
          ) : selectedAnalytics.length > 0 ? (
            <>
              {topPerformer && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <Card className="bg-gradient-to-br from-accent/20 to-primary/20 border-primary/50">
                    <CardContent className="p-6">
                      <div className="flex items-center gap-4">
                        <div className="p-3 bg-primary/20 rounded-full">
                          <Crown size={32} weight="fill" className="text-primary" />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm text-muted-foreground mb-1">Top Performer</p>
                          <div className="flex items-center gap-3">
                            <Avatar className="h-10 w-10">
                              <AvatarImage src={selectedAccounts.find(a => a.id === topPerformer.accountId)?.profileImageUrl} />
                              <AvatarFallback>
                                {topPerformer.username.slice(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-bold text-lg">@{topPerformer.username}</p>
                              <p className="text-sm text-muted-foreground">
                                {topPerformer.metrics.engagementRate.toFixed(2)}% engagement rate
                              </p>
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold">
                            {AnalyticsAPI.formatNumber(topPerformer.metrics.followers)}
                          </p>
                          <p className="text-sm text-muted-foreground">followers</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <ComparisonMetricCard
                  title="Followers"
                  data={comparisonData}
                  dataKey="followers"
                  icon={<Users size={20} weight="duotone" className="text-primary" />}
                  color={platformColors.instagram}
                  format={AnalyticsAPI.formatNumber}
                />

                <ComparisonMetricCard
                  title="Engagement Rate"
                  data={comparisonData}
                  dataKey="engagement"
                  icon={<TrendUp size={20} weight="duotone" className="text-green-500" />}
                  color="#10b981"
                  format={(val) => `${val.toFixed(2)}%`}
                />

                <ComparisonMetricCard
                  title="Total Posts"
                  data={comparisonData}
                  dataKey="totalPosts"
                  icon={<Article size={20} weight="duotone" className="text-purple-500" />}
                  color="#a855f7"
                />

                <ComparisonMetricCard
                  title="Average Likes per Post"
                  data={comparisonData}
                  dataKey="avgLikes"
                  icon={<Heart size={20} weight="fill" className="text-red-500" />}
                  color="#ef4444"
                  format={AnalyticsAPI.formatNumber}
                />

                <ComparisonMetricCard
                  title="Average Comments per Post"
                  data={comparisonData}
                  dataKey="avgComments"
                  icon={<ChatCircle size={20} weight="fill" className="text-blue-500" />}
                  color="#3b82f6"
                  format={AnalyticsAPI.formatNumber}
                />

                <ComparisonMetricCard
                  title={`Followers Gained (${timeRange}d)`}
                  data={comparisonData}
                  dataKey="followersGained"
                  icon={<Users size={20} weight="duotone" className="text-green-500" />}
                  color="#22c55e"
                  format={AnalyticsAPI.formatNumber}
                />
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendUp size={20} weight="duotone" />
                    Performance Overview
                  </CardTitle>
                  <DialogDescription>
                    Normalized comparison across all key metrics (0-100 scale)
                  </DialogDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={400}>
                    <RadarChart data={radarData}>
                      <PolarGrid stroke="hsl(var(--border))" />
                      <PolarAngleAxis dataKey="metric" fontSize={12} />
                      <PolarRadiusAxis angle={90} domain={[0, 100]} fontSize={12} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                        }}
                        formatter={(value: any) => `${Number(value).toFixed(1)}%`}
                      />
                      {selectedAnalytics.map((analytic, index) => {
                        const colors = ['#E1306C', '#1DA1F2', '#10b981', '#a855f7', '#f59e0b']
                        return (
                          <Radar
                            key={analytic.accountId}
                            name={analytic.username}
                            dataKey={analytic.username}
                            stroke={colors[index % colors.length]}
                            fill={colors[index % colors.length]}
                            fillOpacity={0.3}
                            strokeWidth={2}
                          />
                        )
                      })}
                      <Legend />
                    </RadarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Eye size={20} weight="duotone" />
                    Head-to-Head Summary
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-3 px-2 font-semibold">Account</th>
                          <th className="text-right py-3 px-2 font-semibold">Platform</th>
                          <th className="text-right py-3 px-2 font-semibold">Followers</th>
                          <th className="text-right py-3 px-2 font-semibold">Posts</th>
                          <th className="text-right py-3 px-2 font-semibold">Engagement</th>
                          <th className="text-right py-3 px-2 font-semibold">Avg Likes</th>
                          <th className="text-right py-3 px-2 font-semibold">Growth</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedAnalytics.map((analytic) => (
                          <tr key={analytic.accountId} className="border-b hover:bg-muted/50">
                            <td className="py-3 px-2">
                              <div className="flex items-center gap-2">
                                <Avatar className="h-8 w-8">
                                  <AvatarImage 
                                    src={selectedAccounts.find(a => a.id === analytic.accountId)?.profileImageUrl} 
                                  />
                                  <AvatarFallback className="text-xs">
                                    {analytic.username.slice(0, 2).toUpperCase()}
                                  </AvatarFallback>
                                </Avatar>
                                <span className="font-medium">@{analytic.username}</span>
                              </div>
                            </td>
                            <td className="text-right py-3 px-2">
                              <Badge
                                variant="secondary"
                                className="text-xs"
                                style={{
                                  backgroundColor: `${platformColors[analytic.platform]}20`,
                                  color: platformColors[analytic.platform],
                                }}
                              >
                                {analytic.platform}
                              </Badge>
                            </td>
                            <td className="text-right py-3 px-2 font-semibold">
                              {AnalyticsAPI.formatNumber(analytic.metrics.followers)}
                            </td>
                            <td className="text-right py-3 px-2">
                              {analytic.metrics.totalPosts}
                            </td>
                            <td className="text-right py-3 px-2">
                              <Badge variant="secondary">
                                {analytic.metrics.engagementRate.toFixed(2)}%
                              </Badge>
                            </td>
                            <td className="text-right py-3 px-2">
                              {AnalyticsAPI.formatNumber(analytic.metrics.averageLikes)}
                            </td>
                            <td className="text-right py-3 px-2">
                              <div className="flex items-center justify-end gap-1">
                                {(timeRange === '7'
                                  ? analytic.metrics.growthMetrics.followersGained7d
                                  : analytic.metrics.growthMetrics.followersGained30d) >= 0 ? (
                                  <TrendUp size={16} weight="bold" className="text-green-500" />
                                ) : (
                                  <TrendDown size={16} weight="bold" className="text-red-500" />
                                )}
                                <span className={
                                  (timeRange === '7'
                                    ? analytic.metrics.growthMetrics.followersGained7d
                                    : analytic.metrics.growthMetrics.followersGained30d) >= 0
                                    ? 'text-green-500 font-semibold'
                                    : 'text-red-500 font-semibold'
                                }>
                                  {timeRange === '7'
                                    ? analytic.metrics.growthMetrics.followersGained7d
                                    : analytic.metrics.growthMetrics.followersGained30d}
                                </span>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <div className="text-center py-12">
              <p className="text-muted-foreground">
                Loading analytics for selected accounts...
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
