import { useState, useMemo } from 'react'
import { useKV } from '@github/spark/hooks'
import { ContentIdea, CaptionTone, Platform } from '@/lib/types'
import { ContentCard } from '@/components/ContentCard'
import { ContentDialog } from '@/components/ContentDialog'
import { EmptyState } from '@/components/EmptyState'
import { AccountsDialog } from '@/components/AccountsDialog'
import { PublishDialog } from '@/components/PublishDialog'
import { TrendingTopicsDialog } from '@/components/TrendingTopicsDialog'
import { AutoDiscoverySettingsDialog } from '@/components/AutoDiscoverySettingsDialog'
import { AnalyticsDashboard } from '@/components/AnalyticsDashboard'
import { AccountComparisonDialog } from '@/components/AccountComparisonDialog'
import { useAutoDiscovery } from '@/hooks/use-auto-discovery'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { Plus, List, CalendarBlank, MagnifyingGlass, Sparkle, User, TrendUp, Gear, Bell, ChartLine, Scales } from '@phosphor-icons/react'
import { Calendar } from '@/components/ui/calendar'
import { motion, AnimatePresence } from 'framer-motion'
import { toast, Toaster } from 'sonner'

function App() {
  const [contents, setContents] = useKV<ContentIdea[]>('content-ideas', [])
  const [selectedContent, setSelectedContent] = useState<ContentIdea | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [accountsDialogOpen, setAccountsDialogOpen] = useState(false)
  const [publishDialogOpen, setPublishDialogOpen] = useState(false)
  const [trendingDialogOpen, setTrendingDialogOpen] = useState(false)
  const [autoDiscoverySettingsOpen, setAutoDiscoverySettingsOpen] = useState(false)
  const [analyticsDialogOpen, setAnalyticsDialogOpen] = useState(false)
  const [comparisonDialogOpen, setComparisonDialogOpen] = useState(false)
  const [contentToPublish, setContentToPublish] = useState<ContentIdea | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [platformFilter, setPlatformFilter] = useState<Platform | 'all'>('all')
  const [view, setView] = useState<'list' | 'calendar'>('list')
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date())

  const { settings: autoDiscoverySettings, updateSettings: updateAutoDiscoverySettings } = useAutoDiscovery(
    (newContents) => {
      setContents((currentContents) => [...(currentContents || []), ...newContents])
      toast.success(`Auto-discovery generated ${newContents.length} new content idea${newContents.length !== 1 ? 's' : ''}!`, {
        description: 'Check your library to review the new ideas.',
      })
    }
  )

  const handleCreateNew = () => {
    setSelectedContent(null)
    setDialogOpen(true)
  }

  const handleEdit = (content: ContentIdea) => {
    setSelectedContent(content)
    setDialogOpen(true)
  }

  const handleSave = (content: ContentIdea) => {
    setContents((currentContents) => {
      const safeContents = currentContents || []
      if (content.id) {
        return safeContents.map((c) => (c.id === content.id ? content : c))
      } else {
        return [
          ...safeContents,
          {
            ...content,
            id: `content-${Date.now()}`,
            createdAt: new Date().toISOString(),
          },
        ]
      }
    })
    toast.success(content.id ? 'Content updated!' : 'Content created!')
  }

  const handleDelete = (id: string) => {
    setContents((currentContents) => (currentContents || []).filter((c) => c.id !== id))
    toast.success('Content deleted')
  }

  const handlePublish = (content: ContentIdea) => {
    setContentToPublish(content)
    setPublishDialogOpen(true)
  }

  const handlePublished = (contentId: string, postUrl: string) => {
    setContents((currentContents) =>
      (currentContents || []).map((c) =>
        c.id === contentId
          ? {
              ...c,
              status: 'published' as const,
              publishedUrl: postUrl,
              publishedAt: new Date().toISOString(),
            }
          : c
      )
    )
  }

  const handleGenerateCaption = async (
    description: string,
    tone: CaptionTone
  ): Promise<string[]> => {
    const prompt = `You are a social media caption expert. Generate 3 different engaging captions for the following content:

Description: ${description}
Tone: ${tone}

Requirements:
- Match the ${tone} tone perfectly
- Keep captions concise and engaging
- Include relevant emojis naturally
- Make each caption distinct from the others
- Return ONLY the captions, one per line, without numbering or labels`

    const response = await window.spark.llm(prompt, 'gpt-4o-mini')
    const captions = response
      .split('\n')
      .filter((line: string) => line.trim())
      .slice(0, 3)
    return captions
  }

  const handleGenerateFromTrending = async (
    topics: Array<{ topic: string; category: string; relevance: string; contentAngle: string }>,
    platform: Platform,
    tone: CaptionTone
  ) => {
    toast.promise(
      (async () => {
        const newContents: ContentIdea[] = []

        for (const topic of topics) {
          const prompt = window.spark.llmPrompt`You are a social media content strategist. Create a compelling content idea for ${platform} based on this trending topic:

Topic: ${topic.topic}
Category: ${topic.category}
Why it's trending: ${topic.relevance}
Content angle: ${topic.contentAngle}
Tone: ${tone}

Generate:
1. A catchy title (5-10 words)
2. A brief description (2-3 sentences) of what the content would show
3. An engaging ${tone} caption with emojis and relevant hashtags

Return ONLY valid JSON:
{
  "title": "Title here",
  "description": "Description here",
  "caption": "Caption here"
}`

          const response = await window.spark.llm(prompt, 'gpt-4o-mini', true)
          const data = JSON.parse(response)

          const newContent: ContentIdea = {
            id: `content-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            title: data.title || topic.topic,
            description: data.description || topic.contentAngle,
            caption: data.caption || '',
            platform,
            status: 'idea',
            notes: `Generated from trending topic: ${topic.topic}\n\nRelevance: ${topic.relevance}`,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }

          newContents.push(newContent)
        }

        setContents((currentContents) => [...(currentContents || []), ...newContents])
        return newContents.length
      })(),
      {
        loading: 'Generating content ideas from trending topics...',
        success: (count) => `${count} content idea${count !== 1 ? 's' : ''} created!`,
        error: 'Failed to generate content ideas',
      }
    )
  }

  const filteredContents = useMemo(() => {
    const safeContents = contents || []
    return safeContents.filter((content) => {
      const matchesSearch =
        searchQuery === '' ||
        content.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        content.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        content.caption.toLowerCase().includes(searchQuery.toLowerCase())

      const matchesPlatform = platformFilter === 'all' || content.platform === platformFilter

      return matchesSearch && matchesPlatform
    })
  }, [contents, searchQuery, platformFilter])

  const contentsByDate = useMemo(() => {
    const map = new Map<string, ContentIdea[]>()
    const safeContents = contents || []
    safeContents.forEach((content) => {
      if (content.scheduledDate) {
        const dateKey = new Date(content.scheduledDate).toDateString()
        const existing = map.get(dateKey) || []
        map.set(dateKey, [...existing, content])
      }
    })
    return map
  }, [contents])

  const selectedDateContents = useMemo(() => {
    if (!selectedDate) return []
    const dateKey = selectedDate.toDateString()
    return contentsByDate.get(dateKey) || []
  }, [selectedDate, contentsByDate])

  return (
    <div className="min-h-screen bg-background">
      <Toaster position="top-center" />

      <div className="bg-gradient-to-br from-primary/10 via-accent/10 to-secondary/10 border-b border-border/50">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-4xl font-bold tracking-tight mb-2 flex items-center gap-3">
                <Sparkle size={36} weight="duotone" className="text-primary" />
                Content Planner
              </h1>
              <p className="text-muted-foreground text-lg">
                Plan, organize, and create amazing social content with AI
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Button
                onClick={() => setComparisonDialogOpen(true)}
                variant="outline"
                size="lg"
                className="border-secondary/50 text-secondary hover:bg-secondary/10"
              >
                <Scales size={20} weight="duotone" className="mr-2" />
                Compare
              </Button>
              <Button
                onClick={() => setAnalyticsDialogOpen(true)}
                variant="outline"
                size="lg"
                className="border-primary/50 text-primary hover:bg-primary/10"
              >
                <ChartLine size={20} weight="duotone" className="mr-2" />
                Analytics
              </Button>
              <Button
                onClick={() => setTrendingDialogOpen(true)}
                variant="outline"
                size="lg"
                className="border-accent/50 text-accent hover:bg-accent/10"
              >
                <TrendUp size={20} weight="duotone" className="mr-2" />
                Discover Trends
              </Button>
              <Button
                onClick={() => setAutoDiscoverySettingsOpen(true)}
                variant="outline"
                size="lg"
                className="relative"
              >
                <Gear size={20} weight="duotone" className="mr-2" />
                Auto-Discovery
                {autoDiscoverySettings.enabled && (
                  <Badge 
                    variant="default" 
                    className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center bg-green-500 border-2 border-background"
                  >
                    <Bell size={12} weight="fill" className="text-white" />
                  </Badge>
                )}
              </Button>
              <Button
                onClick={() => setAccountsDialogOpen(true)}
                variant="outline"
                size="lg"
              >
                <User size={20} weight="duotone" className="mr-2" />
                Accounts
              </Button>
              <Button
                onClick={handleCreateNew}
                size="lg"
                className="bg-gradient-to-r from-accent to-primary text-white hover:opacity-90 transition-opacity"
              >
                <Plus size={20} weight="bold" className="mr-2" />
                New Content
              </Button>
            </div>
          </div>

          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <MagnifyingGlass
                size={20}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                placeholder="Search content ideas..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-card"
              />
            </div>
            <Select
              value={platformFilter}
              onValueChange={(value) => setPlatformFilter(value as Platform | 'all')}
            >
              <SelectTrigger className="w-full md:w-[180px] bg-card">
                <SelectValue placeholder="Filter by platform" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Platforms</SelectItem>
                <SelectItem value="instagram">Instagram</SelectItem>
                <SelectItem value="tiktok">TikTok</SelectItem>
                <SelectItem value="facebook">Facebook</SelectItem>
                <SelectItem value="twitter">Twitter</SelectItem>
                <SelectItem value="youtube">YouTube</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        <Tabs value={view} onValueChange={(v) => setView(v as 'list' | 'calendar')}>
          <TabsList className="mb-6">
            <TabsTrigger value="list" className="gap-2">
              <List size={18} />
              Library
            </TabsTrigger>
            <TabsTrigger value="calendar" className="gap-2">
              <CalendarBlank size={18} />
              Calendar
            </TabsTrigger>
          </TabsList>

          <TabsContent value="list">
            {(contents || []).length === 0 ? (
              <EmptyState onCreateFirst={handleCreateNew} />
            ) : filteredContents.length === 0 ? (
              <div className="text-center py-20">
                <p className="text-muted-foreground">
                  No content matches your filters. Try adjusting your search.
                </p>
              </div>
            ) : (
              <motion.div
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
                layout
              >
                <AnimatePresence>
                  {filteredContents.map((content) => (
                    <ContentCard
                      key={content.id}
                      content={content}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                      onPublish={handlePublish}
                    />
                  ))}
                </AnimatePresence>
              </motion.div>
            )}
          </TabsContent>

          <TabsContent value="calendar">
            <div className="grid md:grid-cols-[auto_1fr] gap-6">
              <div className="bg-card rounded-lg border p-4 w-full md:w-auto">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={setSelectedDate}
                  className="rounded-md"
                  modifiers={{
                    hasContent: (date) => {
                      return contentsByDate.has(date.toDateString())
                    },
                  }}
                  modifiersClassNames={{
                    hasContent: 'bg-primary/10 font-bold',
                  }}
                />
              </div>

              <div>
                <h3 className="text-xl font-semibold mb-4">
                  {selectedDate
                    ? `Content for ${selectedDate.toLocaleDateString('en-US', {
                        month: 'long',
                        day: 'numeric',
                        year: 'numeric',
                      })}`
                    : 'Select a date'}
                </h3>
                <Separator className="mb-4" />

                {selectedDateContents.length === 0 ? (
                  <div className="text-center py-12 bg-card rounded-lg border-2 border-dashed">
                    <p className="text-muted-foreground mb-4">
                      No content scheduled for this date
                    </p>
                    <Button onClick={handleCreateNew} variant="outline">
                      <Plus size={18} className="mr-2" />
                      Add Content
                    </Button>
                  </div>
                ) : (
                  <div className="grid gap-4">
                    {selectedDateContents.map((content) => (
                      <ContentCard
                        key={content.id}
                        content={content}
                        onEdit={handleEdit}
                        onDelete={handleDelete}
                        onPublish={handlePublish}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <ContentDialog
        content={selectedContent}
        open={dialogOpen}
        onClose={() => {
          setDialogOpen(false)
          setSelectedContent(null)
        }}
        onSave={handleSave}
        onGenerateCaption={handleGenerateCaption}
      />

      <AccountsDialog open={accountsDialogOpen} onClose={() => setAccountsDialogOpen(false)} />

      <PublishDialog
        content={contentToPublish}
        open={publishDialogOpen}
        onClose={() => {
          setPublishDialogOpen(false)
          setContentToPublish(null)
        }}
        onPublished={handlePublished}
      />

      <TrendingTopicsDialog
        open={trendingDialogOpen}
        onClose={() => setTrendingDialogOpen(false)}
        onGenerateContent={handleGenerateFromTrending}
      />

      <AutoDiscoverySettingsDialog
        open={autoDiscoverySettingsOpen}
        onClose={() => setAutoDiscoverySettingsOpen(false)}
        settings={autoDiscoverySettings}
        onSave={updateAutoDiscoverySettings}
      />

      <AnalyticsDashboard
        open={analyticsDialogOpen}
        onClose={() => setAnalyticsDialogOpen(false)}
      />

      <AccountComparisonDialog
        open={comparisonDialogOpen}
        onClose={() => setComparisonDialogOpen(false)}
      />
    </div>
  )
}

export default App