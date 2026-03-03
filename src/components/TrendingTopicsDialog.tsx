import { useState } from 'react'
import { Platform, CaptionTone, ContentIdea } from '@/lib/types'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { TrendUp, Sparkle, Check, X } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'

interface TrendingTopic {
  topic: string
  category: string
  relevance: string
  suggestedPlatforms: Platform[]
  contentAngle: string
}

interface TrendingTopicsDialogProps {
  open: boolean
  onClose: () => void
  onGenerateContent: (topics: TrendingTopic[], platform: Platform, tone: CaptionTone) => void
}

export function TrendingTopicsDialog({
  open,
  onClose,
  onGenerateContent,
}: TrendingTopicsDialogProps) {
  const [loading, setLoading] = useState(false)
  const [topics, setTopics] = useState<TrendingTopic[]>([])
  const [selectedTopics, setSelectedTopics] = useState<Set<string>>(new Set())
  const [selectedPlatform, setSelectedPlatform] = useState<Platform>('instagram')
  const [selectedTone, setSelectedTone] = useState<CaptionTone>('casual')
  const [timeFrame, setTimeFrame] = useState<'today' | 'week'>('today')

  const handleFetchTrends = async () => {
    setLoading(true)
    setTopics([])
    setSelectedTopics(new Set())

    try {
      const timeFrameText = timeFrame === 'today' ? 'today' : 'this week'
      const prompt = window.spark.llmPrompt`You are a social media trends analyst. Identify 8 trending topics for ${timeFrameText} that would be perfect for social media content creation.

For each topic, provide:
- The topic name (concise)
- Category (e.g., Technology, Entertainment, Sports, Politics, Lifestyle, Health, Business, Culture)
- Why it's relevant right now (one sentence)
- Which platforms it would work best on (choose from: instagram, tiktok, facebook, twitter, youtube)
- A unique content angle or approach

Return ONLY valid JSON with the following structure:
{
  "topics": [
    {
      "topic": "Topic Name",
      "category": "Category",
      "relevance": "Why it's trending",
      "suggestedPlatforms": ["platform1", "platform2"],
      "contentAngle": "Suggested approach"
    }
  ]
}

Make topics diverse across categories and genuinely reflect current events and cultural moments.`

      const response = await window.spark.llm(prompt, 'gpt-4o-mini', true)
      const data = JSON.parse(response)

      if (data.topics && Array.isArray(data.topics)) {
        setTopics(data.topics)
        toast.success(`Found ${data.topics.length} trending topics!`)
      } else {
        throw new Error('Invalid response format')
      }
    } catch (error) {
      console.error('Error fetching trends:', error)
      toast.error('Failed to fetch trending topics. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const toggleTopic = (topic: string) => {
    setSelectedTopics((current) => {
      const newSet = new Set(current)
      if (newSet.has(topic)) {
        newSet.delete(topic)
      } else {
        newSet.add(topic)
      }
      return newSet
    })
  }

  const handleGenerate = () => {
    if (selectedTopics.size === 0) {
      toast.error('Please select at least one topic')
      return
    }

    const selectedTopicObjects = topics.filter((t) => selectedTopics.has(t.topic))
    onGenerateContent(selectedTopicObjects, selectedPlatform, selectedTone)
    onClose()
  }

  const categoryColors: Record<string, string> = {
    Technology: 'bg-blue-500/10 text-blue-700 border-blue-200',
    Entertainment: 'bg-purple-500/10 text-purple-700 border-purple-200',
    Sports: 'bg-green-500/10 text-green-700 border-green-200',
    Politics: 'bg-red-500/10 text-red-700 border-red-200',
    Lifestyle: 'bg-pink-500/10 text-pink-700 border-pink-200',
    Health: 'bg-teal-500/10 text-teal-700 border-teal-200',
    Business: 'bg-orange-500/10 text-orange-700 border-orange-200',
    Culture: 'bg-yellow-500/10 text-yellow-700 border-yellow-200',
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-2xl">
            <TrendUp size={28} weight="duotone" className="text-accent" />
            Discover Trending Topics
          </DialogTitle>
          <DialogDescription>
            Find what's hot right now and generate content ideas automatically
          </DialogDescription>
        </DialogHeader>

        <Separator className="my-4" />

        <div className="flex-1 overflow-y-auto space-y-6">
          <div className="flex flex-wrap items-center gap-3">
            <Tabs value={timeFrame} onValueChange={(v) => setTimeFrame(v as 'today' | 'week')}>
              <TabsList>
                <TabsTrigger value="today">Today</TabsTrigger>
                <TabsTrigger value="week">This Week</TabsTrigger>
              </TabsList>
            </Tabs>

            <Button
              onClick={handleFetchTrends}
              disabled={loading}
              className="bg-gradient-to-r from-accent to-primary text-white"
            >
              <Sparkle size={18} weight="fill" className="mr-2" />
              {loading ? 'Discovering Trends...' : 'Discover Trends'}
            </Button>

            {topics.length > 0 && (
              <>
                <Separator orientation="vertical" className="h-8" />
                <div className="flex items-center gap-2 flex-1">
                  <Select
                    value={selectedPlatform}
                    onValueChange={(value) => setSelectedPlatform(value as Platform)}
                  >
                    <SelectTrigger className="w-[140px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="instagram">Instagram</SelectItem>
                      <SelectItem value="tiktok">TikTok</SelectItem>
                      <SelectItem value="facebook">Facebook</SelectItem>
                      <SelectItem value="twitter">Twitter</SelectItem>
                      <SelectItem value="youtube">YouTube</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select
                    value={selectedTone}
                    onValueChange={(value) => setSelectedTone(value as CaptionTone)}
                  >
                    <SelectTrigger className="w-[140px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="casual">Casual</SelectItem>
                      <SelectItem value="professional">Professional</SelectItem>
                      <SelectItem value="playful">Playful</SelectItem>
                      <SelectItem value="inspirational">Inspirational</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
          </div>

          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="text-center space-y-4">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                >
                  <Sparkle size={48} weight="duotone" className="text-primary mx-auto" />
                </motion.div>
                <p className="text-muted-foreground">Analyzing trending topics...</p>
              </div>
            </div>
          )}

          {!loading && topics.length === 0 && (
            <div className="text-center py-12 space-y-3">
              <TrendUp size={64} weight="thin" className="text-muted-foreground mx-auto" />
              <p className="text-muted-foreground">
                Click "Discover Trends" to find what's trending right now
              </p>
            </div>
          )}

          {!loading && topics.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {selectedTopics.size} topic{selectedTopics.size !== 1 ? 's' : ''} selected
                </p>
                {selectedTopics.size > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedTopics(new Set())}
                  >
                    Clear Selection
                  </Button>
                )}
              </div>

              <AnimatePresence mode="popLayout">
                {topics.map((topic, index) => {
                  const isSelected = selectedTopics.has(topic.topic)
                  return (
                    <motion.div
                      key={topic.topic}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ delay: index * 0.05 }}
                    >
                      <Card
                        className={`cursor-pointer transition-all hover:border-primary/50 ${
                          isSelected ? 'border-primary border-2 bg-primary/5' : ''
                        }`}
                        onClick={() => toggleTopic(topic.topic)}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 space-y-2">
                              <div className="flex items-start gap-2">
                                <div className="flex-1">
                                  <h4 className="font-semibold text-base mb-1">
                                    {topic.topic}
                                  </h4>
                                  <Badge
                                    variant="outline"
                                    className={`text-xs ${
                                      categoryColors[topic.category] ||
                                      'bg-gray-500/10 text-gray-700'
                                    }`}
                                  >
                                    {topic.category}
                                  </Badge>
                                </div>
                                <div
                                  className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                                    isSelected
                                      ? 'bg-primary border-primary'
                                      : 'border-muted-foreground/30'
                                  }`}
                                >
                                  {isSelected && <Check size={14} weight="bold" className="text-white" />}
                                </div>
                              </div>
                              <p className="text-sm text-muted-foreground">{topic.relevance}</p>
                              <p className="text-sm">
                                <span className="font-medium">Content Angle:</span>{' '}
                                {topic.contentAngle}
                              </p>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs text-muted-foreground">Best for:</span>
                                {topic.suggestedPlatforms.map((platform) => (
                                  <Badge key={platform} variant="secondary" className="text-xs">
                                    {platform}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  )
                })}
              </AnimatePresence>
            </div>
          )}
        </div>

        {topics.length > 0 && (
          <>
            <Separator className="my-4" />
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={onClose}>
                <X size={18} className="mr-2" />
                Cancel
              </Button>
              <Button
                onClick={handleGenerate}
                disabled={selectedTopics.size === 0}
                className="bg-gradient-to-r from-accent to-primary text-white"
              >
                <Sparkle size={18} weight="fill" className="mr-2" />
                Generate {selectedTopics.size} Content Idea
                {selectedTopics.size !== 1 ? 's' : ''}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
