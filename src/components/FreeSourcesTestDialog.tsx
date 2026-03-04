import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { RedditLogo, Fire, Newspaper, CheckCircle, XCircle, Clock, ArrowSquareOut } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { TrendingTopic } from '@/lib/news-api'

interface FreeSourcesTestDialogProps {
  open: boolean
  onClose: () => void
}

interface TestResult {
  source: string
  status: 'success' | 'error' | 'testing'
  topics?: TrendingTopic[]
  error?: string
  responseTime?: number
}

export function FreeSourcesTestDialog({ open, onClose }: FreeSourcesTestDialogProps) {
  const [testResults, setTestResults] = useState<TestResult[]>([])
  const [testing, setTesting] = useState(false)
  const [selectedSource, setSelectedSource] = useState<string>('all')

  const testHackerNews = async (): Promise<TestResult> => {
    const startTime = Date.now()
    try {
      const response = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json')
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const storyIds = await response.json()
      const topStoryIds = storyIds.slice(0, 10)
      
      const storyPromises = topStoryIds.map(async (id: number) => {
        const storyResponse = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`)
        return storyResponse.json()
      })

      const stories = await Promise.all(storyPromises)
      const validStories = stories.filter(s => s && s.title)
      
      const topics: TrendingTopic[] = validStories.map((story) => ({
        topic: story.title,
        category: 'Technology',
        relevance: `${story.score || 0} points, ${story.descendants || 0} comments`,
        articles: [{
          title: story.title,
          description: story.text || story.title,
          url: story.url || `https://news.ycombinator.com/item?id=${story.id}`,
          publishedAt: new Date(story.time * 1000).toISOString(),
          source: 'Hacker News',
        }],
        suggestedContentAngle: 'Tech innovation spotlight',
      }))

      const responseTime = Date.now() - startTime

      return {
        source: 'Hacker News',
        status: 'success',
        topics,
        responseTime,
      }
    } catch (error) {
      return {
        source: 'Hacker News',
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
        responseTime: Date.now() - startTime,
      }
    }
  }

  const testReddit = async (): Promise<TestResult> => {
    const startTime = Date.now()
    try {
      const subreddits = ['technology', 'programming', 'artificial', 'science', 'futurology']
      const testSubreddit = subreddits[0]
      
      const response = await fetch(`https://www.reddit.com/r/${testSubreddit}/hot.json?limit=10`, {
        headers: {
          'User-Agent': 'ContentPlanner/1.0',
        },
      })
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const data = await response.json()
      
      if (!data.data || !data.data.children) {
        throw new Error('Invalid response structure')
      }

      const posts = data.data.children
        .filter((post: any) => post.data && !post.data.stickied)
        .slice(0, 10)

      const topics: TrendingTopic[] = posts.map((post: any) => {
        const data = post.data
        return {
          topic: data.title,
          category: 'Technology',
          relevance: `${data.ups || 0} upvotes, ${data.num_comments || 0} comments`,
          articles: [{
            title: data.title,
            description: data.selftext || data.title,
            url: data.url,
            publishedAt: new Date(data.created_utc * 1000).toISOString(),
            source: `r/${data.subreddit}`,
            imageUrl: data.thumbnail && data.thumbnail.startsWith('http') ? data.thumbnail : undefined,
          }],
          suggestedContentAngle: 'Community discussion highlight',
        }
      })

      const responseTime = Date.now() - startTime

      return {
        source: 'Reddit',
        status: 'success',
        topics,
        responseTime,
      }
    } catch (error) {
      return {
        source: 'Reddit',
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
        responseTime: Date.now() - startTime,
      }
    }
  }

  const runTests = async () => {
    setTesting(true)
    setTestResults([])

    const tests = [
      { name: 'Hacker News', fn: testHackerNews },
      { name: 'Reddit', fn: testReddit },
    ]

    for (const test of tests) {
      setTestResults(prev => [...prev, { source: test.name, status: 'testing' }])
      
      const result = await test.fn()
      
      setTestResults(prev => 
        prev.map(r => r.source === test.name ? result : r)
      )

      await new Promise(resolve => setTimeout(resolve, 500))
    }

    setTesting(false)
    
    const successCount = testResults.filter(r => r.status === 'success').length
    if (successCount === tests.length) {
      toast.success('All free sources tested successfully!')
    } else if (successCount > 0) {
      toast.warning(`${successCount}/${tests.length} sources working`)
    } else {
      toast.error('All sources failed')
    }
  }

  const getStatusIcon = (status: TestResult['status']) => {
    switch (status) {
      case 'success':
        return <CheckCircle size={20} weight="fill" className="text-green-500" />
      case 'error':
        return <XCircle size={20} weight="fill" className="text-destructive" />
      case 'testing':
        return <Clock size={20} weight="fill" className="text-muted-foreground animate-pulse" />
    }
  }

  const selectedResult = testResults.find(r => r.source.toLowerCase().includes(selectedSource.toLowerCase()))

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-2xl">
            <Fire size={28} weight="duotone" className="text-accent" />
            Free Sources Testing
          </DialogTitle>
          <DialogDescription>
            Test Hacker News and Reddit APIs for trending content generation
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Badge variant="outline" className="text-sm">
                <RedditLogo size={16} weight="fill" className="mr-1" />
                Reddit API
              </Badge>
              <Badge variant="outline" className="text-sm">
                <Newspaper size={16} weight="fill" className="mr-1" />
                Hacker News API
              </Badge>
            </div>
            <Button
              onClick={runTests}
              disabled={testing}
              className="bg-gradient-to-r from-accent to-primary"
            >
              {testing ? 'Testing...' : 'Run All Tests'}
            </Button>
          </div>

          {testResults.length > 0 && (
            <>
              <div className="grid grid-cols-2 gap-4">
                {testResults.map((result) => (
                  <Card
                    key={result.source}
                    className={`cursor-pointer transition-all ${
                      selectedSource === result.source.toLowerCase()
                        ? 'border-primary ring-2 ring-primary/20'
                        : 'hover:border-primary/50'
                    }`}
                    onClick={() => setSelectedSource(result.source.toLowerCase())}
                  >
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center justify-between text-lg">
                        <span className="flex items-center gap-2">
                          {result.source === 'Reddit' ? (
                            <RedditLogo size={20} weight="fill" />
                          ) : (
                            <Newspaper size={20} weight="fill" />
                          )}
                          {result.source}
                        </span>
                        {getStatusIcon(result.status)}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {result.status === 'success' && (
                        <>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Topics Found</span>
                            <Badge variant="secondary">{result.topics?.length || 0}</Badge>
                          </div>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Response Time</span>
                            <Badge variant="outline">{result.responseTime}ms</Badge>
                          </div>
                        </>
                      )}
                      {result.status === 'error' && (
                        <div className="text-sm text-destructive">
                          Error: {result.error}
                        </div>
                      )}
                      {result.status === 'testing' && (
                        <div className="text-sm text-muted-foreground">
                          Testing in progress...
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>

              <Separator />

              {selectedResult && selectedResult.status === 'success' && selectedResult.topics && (
                <div>
                  <h3 className="text-lg font-semibold mb-4">
                    Trending Topics from {selectedResult.source}
                  </h3>
                  <ScrollArea className="h-[400px] pr-4">
                    <div className="space-y-3">
                      {selectedResult.topics.map((topic, idx) => (
                        <Card key={idx} className="hover:border-primary/50 transition-colors">
                          <CardContent className="pt-4">
                            <div className="space-y-2">
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex-1">
                                  <h4 className="font-semibold text-sm mb-1">{topic.topic}</h4>
                                  <p className="text-xs text-muted-foreground line-clamp-2">
                                    {topic.articles[0]?.description}
                                  </p>
                                </div>
                                <a
                                  href={topic.articles[0]?.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-primary hover:text-primary/80"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <ArrowSquareOut size={20} />
                                </a>
                              </div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <Badge variant="secondary" className="text-xs">
                                  {topic.category}
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                  {topic.relevance}
                                </span>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}
            </>
          )}

          {testResults.length === 0 && (
            <div className="text-center py-12 bg-muted/30 rounded-lg border-2 border-dashed">
              <Fire size={48} weight="duotone" className="mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-4">
                No tests run yet. Click "Run All Tests" to start testing free sources.
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
