import { useState, useEffect, useMemo } from 'react'
import { useKV } from '@github/spark/hooks'
import { SocialAccount, AccountAnalytics, Platform } from '@/lib/types'
import { AnalyticsAPI } from '@/lib/analytics-api'
import { PerformanceInsights } from '@/components/PerformanceInsights'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import {
  ChartLine,
  TrendUp,
  TrendDown,
  Users,
  Heart,
  ChatCircle,
  ShareNetwork,
  Eye,
  UserPlus,
  UserMinus,
  Article,
  ArrowClockwise,
} from '@phosphor-icons/react'
import { toast } from 'sonner'
import { motion } from 'framer-motion'

interface AnalyticsDashboardProps {
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

export function AnalyticsDashboard({ open, onClose }: AnalyticsDashboardProps) {
  const [accounts] = useKV<SocialAccount[]>('social-accounts', [])
  const [analytics, setAnalytics] = useKV<Record<string, AccountAnalytics>>('account-analytics', {})
  const [selectedAccountId, setSelectedAccountId] = useState<string>('')
  const [timeRange, setTimeRange] = useState<'7' | '30' | '90'>('30')
  const [loading, setLoading] = useState(false)

  const selectedAccount = useMemo(() => {
    return (accounts || []).find((acc) => acc.id === selectedAccountId)
  }, [accounts, selectedAccountId])

  const selectedAnalytics = useMemo(() => {
    return selectedAccountId ? analytics?.[selectedAccountId] : null
  }, [analytics, selectedAccountId])

  useEffect(() => {
    if (open && accounts && accounts.length > 0 && !selectedAccountId) {
      setSelectedAccountId(accounts[0].id)
    }
  }, [open, accounts, selectedAccountId])

  const handleRefreshAnalytics = async () => {
    if (!selectedAccount) return

    setLoading(true)
    try {
      const accountAnalytics = await AnalyticsAPI.fetchAccountAnalytics(selectedAccount)
      const historicalData = await AnalyticsAPI.fetchHistoricalData(
        selectedAccount,
        parseInt(timeRange)
      )

      const updatedAnalytics = {
        ...accountAnalytics,
        historicalData,
      }

      setAnalytics((current) => ({
        ...(current || {}),
        [selectedAccount.id]: updatedAnalytics,
      }))

      toast.success('Analytics refreshed!')
    } catch (error) {
      toast.error('Failed to refresh analytics')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (selectedAccount && !analytics?.[selectedAccount.id]) {
      handleRefreshAnalytics()
    }
  }, [selectedAccount])

  const StatCard = ({
    icon,
    title,
    value,
    change,
    changeLabel,
    color,
  }: {
    icon: React.ReactNode
    title: string
    value: string | number
    change?: number
    changeLabel?: string
    color: string
  }) => (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-sm text-muted-foreground mb-1">{title}</p>
            <p className="text-3xl font-bold mb-2">{value}</p>
            {change !== undefined && (
              <div className="flex items-center gap-1 text-sm">
                {change >= 0 ? (
                  <TrendUp size={16} weight="bold" className="text-green-500" />
                ) : (
                  <TrendDown size={16} weight="bold" className="text-red-500" />
                )}
                <span className={change >= 0 ? 'text-green-500' : 'text-red-500'}>
                  {Math.abs(change)}%
                </span>
                <span className="text-muted-foreground">{changeLabel}</span>
              </div>
            )}
          </div>
          <div className={`p-3 rounded-lg`} style={{ backgroundColor: `${color}20` }}>
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  )

  if (!accounts || accounts.length === 0) {
    return (
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ChartLine size={28} weight="duotone" className="text-primary" />
              Analytics Dashboard
            </DialogTitle>
          </DialogHeader>
          <div className="text-center py-12">
            <ChartLine size={64} className="mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-4">
              No accounts connected yet. Connect your social media accounts to view analytics.
            </p>
            <Button onClick={onClose}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-[95vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-2xl flex items-center gap-2 mb-2">
                <ChartLine size={28} weight="duotone" className="text-primary" />
                Analytics Dashboard
              </DialogTitle>
              <DialogDescription>
                Track performance and growth metrics for your social media accounts
              </DialogDescription>
            </div>
            <div className="flex items-center gap-3">
              <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(accounts || []).map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      <div className="flex items-center gap-2">
                        <Avatar className="h-5 w-5">
                          <AvatarImage src={account.profileImageUrl} />
                          <AvatarFallback className="text-xs">
                            {account.username.slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span>@{account.username}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                onClick={handleRefreshAnalytics}
                disabled={loading}
              >
                <ArrowClockwise
                  size={18}
                  className={loading ? 'animate-spin' : ''}
                />
              </Button>
            </div>
          </div>
        </DialogHeader>

        {loading && !selectedAnalytics ? (
          <div className="text-center py-12">
            <ArrowClockwise size={48} className="mx-auto text-primary animate-spin mb-4" />
            <p className="text-muted-foreground">Loading analytics...</p>
          </div>
        ) : selectedAnalytics ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                icon={<Users size={24} style={{ color: platformColors[selectedAccount!.platform] }} />}
                title="Followers"
                value={AnalyticsAPI.formatNumber(selectedAnalytics.metrics.followers)}
                change={
                  timeRange === '7'
                    ? AnalyticsAPI.calculateGrowthPercentage(
                        selectedAnalytics.metrics.growthMetrics.followersGained7d,
                        selectedAnalytics.metrics.followers - selectedAnalytics.metrics.growthMetrics.followersGained7d
                      )
                    : AnalyticsAPI.calculateGrowthPercentage(
                        selectedAnalytics.metrics.growthMetrics.followersGained30d,
                        selectedAnalytics.metrics.followers - selectedAnalytics.metrics.growthMetrics.followersGained30d
                      )
                }
                changeLabel={timeRange === '7' ? 'vs last week' : 'vs last month'}
                color={platformColors[selectedAccount!.platform]}
              />
              <StatCard
                icon={<Heart size={24} weight="fill" className="text-red-500" />}
                title="Total Likes"
                value={AnalyticsAPI.formatNumber(selectedAnalytics.metrics.totalLikes)}
                color="#ef4444"
              />
              <StatCard
                icon={<Eye size={24} weight="duotone" className="text-blue-500" />}
                title="Total Views"
                value={AnalyticsAPI.formatNumber(selectedAnalytics.metrics.totalViews)}
                color="#3b82f6"
              />
              <StatCard
                icon={<Article size={24} weight="duotone" className="text-purple-500" />}
                title="Posts"
                value={selectedAnalytics.metrics.totalPosts}
                change={
                  timeRange === '7'
                    ? selectedAnalytics.metrics.growthMetrics.postsPublished7d
                    : selectedAnalytics.metrics.growthMetrics.postsPublished30d
                }
                changeLabel={timeRange === '7' ? 'this week' : 'this month'}
                color="#a855f7"
              />
            </div>

            <Tabs defaultValue="overview" className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="growth">Growth</TabsTrigger>
                <TabsTrigger value="engagement">Engagement</TabsTrigger>
                <TabsTrigger value="insights">Insights</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Follower Growth</CardTitle>
                    <CardDescription>Track your audience growth over time</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {selectedAnalytics.historicalData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={300}>
                        <AreaChart data={selectedAnalytics.historicalData}>
                          <defs>
                            <linearGradient id="colorFollowers" x1="0" y1="0" x2="0" y2="1">
                              <stop
                                offset="5%"
                                stopColor={platformColors[selectedAccount!.platform]}
                                stopOpacity={0.3}
                              />
                              <stop
                                offset="95%"
                                stopColor={platformColors[selectedAccount!.platform]}
                                stopOpacity={0}
                              />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                          <XAxis
                            dataKey="date"
                            tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            fontSize={12}
                          />
                          <YAxis fontSize={12} />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: 'hsl(var(--card))',
                              border: '1px solid hsl(var(--border))',
                              borderRadius: '8px',
                            }}
                          />
                          <Area
                            type="monotone"
                            dataKey="followers"
                            stroke={platformColors[selectedAccount!.platform]}
                            fillOpacity={1}
                            fill="url(#colorFollowers)"
                            strokeWidth={2}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="text-center py-12 text-muted-foreground">
                        No historical data available
                      </div>
                    )}
                  </CardContent>
                </Card>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>Engagement Breakdown</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Heart size={20} weight="fill" className="text-red-500" />
                            <span className="text-sm">Average Likes</span>
                          </div>
                          <span className="font-semibold">
                            {selectedAnalytics.metrics.averageLikes}
                          </span>
                        </div>
                        <Separator />
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <ChatCircle size={20} weight="fill" className="text-blue-500" />
                            <span className="text-sm">Average Comments</span>
                          </div>
                          <span className="font-semibold">
                            {selectedAnalytics.metrics.averageComments}
                          </span>
                        </div>
                        <Separator />
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <ShareNetwork size={20} weight="fill" className="text-green-500" />
                            <span className="text-sm">Total Shares</span>
                          </div>
                          <span className="font-semibold">
                            {AnalyticsAPI.formatNumber(selectedAnalytics.metrics.totalShares)}
                          </span>
                        </div>
                        <Separator />
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <TrendUp size={20} weight="fill" className="text-purple-500" />
                            <span className="text-sm">Engagement Rate</span>
                          </div>
                          <Badge variant="secondary" className="font-semibold">
                            {selectedAnalytics.metrics.engagementRate.toFixed(2)}%
                          </Badge>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Growth Summary</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <UserPlus size={20} weight="fill" className="text-green-500" />
                            <span className="text-sm">
                              Followers Gained ({timeRange === '7' ? '7d' : '30d'})
                            </span>
                          </div>
                          <span className="font-semibold text-green-500">
                            +{timeRange === '7'
                              ? selectedAnalytics.metrics.growthMetrics.followersGained7d
                              : selectedAnalytics.metrics.growthMetrics.followersGained30d}
                          </span>
                        </div>
                        <Separator />
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <UserMinus size={20} weight="fill" className="text-red-500" />
                            <span className="text-sm">
                              Followers Lost ({timeRange === '7' ? '7d' : '30d'})
                            </span>
                          </div>
                          <span className="font-semibold text-red-500">
                            -{timeRange === '7'
                              ? selectedAnalytics.metrics.growthMetrics.followersLost7d
                              : selectedAnalytics.metrics.growthMetrics.followersLost30d}
                          </span>
                        </div>
                        <Separator />
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Article size={20} weight="fill" className="text-blue-500" />
                            <span className="text-sm">
                              Posts Published ({timeRange === '7' ? '7d' : '30d'})
                            </span>
                          </div>
                          <span className="font-semibold">
                            {timeRange === '7'
                              ? selectedAnalytics.metrics.growthMetrics.postsPublished7d
                              : selectedAnalytics.metrics.growthMetrics.postsPublished30d}
                          </span>
                        </div>
                        <Separator />
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <TrendUp size={20} weight="fill" className="text-purple-500" />
                            <span className="text-sm">
                              Engagement Growth ({timeRange === '7' ? '7d' : '30d'})
                            </span>
                          </div>
                          <Badge
                            variant={
                              (timeRange === '7'
                                ? selectedAnalytics.metrics.growthMetrics.engagementGrowth7d
                                : selectedAnalytics.metrics.growthMetrics.engagementGrowth30d) >= 0
                                ? 'default'
                                : 'destructive'
                            }
                          >
                            {timeRange === '7'
                              ? selectedAnalytics.metrics.growthMetrics.engagementGrowth7d
                              : selectedAnalytics.metrics.growthMetrics.engagementGrowth30d}
                            %
                          </Badge>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="growth" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Audience Growth Trend</CardTitle>
                    <CardDescription>
                      Followers vs Following over time
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {selectedAnalytics.historicalData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={350}>
                        <LineChart data={selectedAnalytics.historicalData}>
                          <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                          <XAxis
                            dataKey="date"
                            tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            fontSize={12}
                          />
                          <YAxis fontSize={12} />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: 'hsl(var(--card))',
                              border: '1px solid hsl(var(--border))',
                              borderRadius: '8px',
                            }}
                          />
                          <Legend />
                          <Line
                            type="monotone"
                            dataKey="followers"
                            stroke={platformColors[selectedAccount!.platform]}
                            strokeWidth={3}
                            dot={false}
                          />
                          <Line
                            type="monotone"
                            dataKey="following"
                            stroke="#94a3b8"
                            strokeWidth={2}
                            dot={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="text-center py-12 text-muted-foreground">
                        No historical data available
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="engagement" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Engagement Over Time</CardTitle>
                    <CardDescription>
                      Track likes, comments, and shares
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {selectedAnalytics.historicalData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={350}>
                        <BarChart data={selectedAnalytics.historicalData.slice(-14)}>
                          <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                          <XAxis
                            dataKey="date"
                            tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            fontSize={12}
                          />
                          <YAxis fontSize={12} />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: 'hsl(var(--card))',
                              border: '1px solid hsl(var(--border))',
                              borderRadius: '8px',
                            }}
                          />
                          <Legend />
                          <Bar dataKey="likes" fill="#ef4444" name="Likes" />
                          <Bar dataKey="comments" fill="#3b82f6" name="Comments" />
                          <Bar dataKey="shares" fill="#10b981" name="Shares" />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="text-center py-12 text-muted-foreground">
                        No historical data available
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="insights" className="space-y-6">
                <PerformanceInsights analytics={selectedAnalytics} timeRange={timeRange} />
              </TabsContent>
            </Tabs>
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Select an account to view analytics</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
