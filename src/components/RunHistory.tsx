import { useState, useEffect, useCallback } from 'react'
import {
  checkHealth,
  listPipelineRuns,
  getPipelineResult,
  type RunSummary,
  type PipelineResult,
  type SocialPost,
  type ImageSet,
} from '@/lib/orchestrator-api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ArrowsClockwise,
  CheckCircle,
  XCircle,
  CircleNotch,
  Plugs,
  Eye,
  Newspaper,
  Warning,
  X,
  Hash,
  Clock,
  LinkSimple,
  ClockCounterClockwise,
  CaretDown,
  CaretUp,
} from '@phosphor-icons/react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const PLATFORM_COLORS: Record<string, string> = {
  twitter: 'bg-sky-500/10 text-sky-600 border-sky-500/20',
  instagram: 'bg-pink-500/10 text-pink-600 border-pink-500/20',
  linkedin: 'bg-blue-600/10 text-blue-700 border-blue-600/20',
  facebook: 'bg-indigo-500/10 text-indigo-600 border-indigo-500/20',
  tiktok: 'bg-slate-800/10 text-slate-800 border-slate-800/20',
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'completed') return <Badge className="bg-green-500/10 text-green-600 border-green-500/20">Completed</Badge>
  if (status === 'failed') return <Badge className="bg-red-500/10 text-red-600 border-red-500/20">Failed</Badge>
  if (status === 'running') return <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/20">Running</Badge>
  return <Badge variant="outline">{status}</Badge>
}

// ─── Post card (compact) ────────────────────────────────────────────────────

function PostCard({ post, imageSet }: { post: SocialPost; imageSet?: ImageSet }) {
  const image = imageSet?.images?.[0]
  return (
    <div className="border rounded-lg overflow-hidden bg-card">
      {image && image.url && !image.url.startsWith('data:') && (
        <img src={image.url} alt={image.altText || ''} className="w-full h-32 object-cover" />
      )}
      <div className="p-3 space-y-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge className={PLATFORM_COLORS[post.platform] || ''} >{post.platform}</Badge>
          <Badge variant="outline" className="text-xs capitalize">{post.tone}</Badge>
        </div>
        <p className="text-sm leading-relaxed whitespace-pre-wrap line-clamp-4">{post.content}</p>
        {post.hashtags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {post.hashtags.map((tag) => (
              <span key={tag} className="inline-flex items-center gap-0.5 text-xs text-primary font-medium bg-primary/5 px-1.5 py-0.5 rounded-full">
                <Hash size={10} />{tag}
              </span>
            ))}
          </div>
        )}
        <div className="flex items-center gap-3 text-xs text-muted-foreground pt-1 border-t">
          <span className="flex items-center gap-1"><Clock size={12} />{new Date(post.createdAt).toLocaleTimeString()}</span>
          <span>{post.characterCount} chars</span>
          {post.newsSource && (
            <span className="flex items-center gap-1 truncate ml-auto"><LinkSimple size={12} />{post.newsSource}</span>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Expandable run row ──────────────────────────────────────────────────────

function ExpandableRunRow({ run }: { run: RunSummary }) {
  const [expanded, setExpanded] = useState(false)
  const [result, setResult] = useState<PipelineResult | null>(null)
  const [loading, setLoading] = useState(false)

  const handleToggle = async () => {
    if (expanded) {
      setExpanded(false)
      return
    }
    if (!result && run.status !== 'running') {
      setLoading(true)
      try {
        const data = await getPipelineResult(run.id)
        if ('pipelineId' in data) setResult(data)
      } catch {
        toast.error(`Failed to load run details`)
      } finally {
        setLoading(false)
      }
    }
    setExpanded(true)
  }

  const duration = run.completedAt
    ? Math.round((new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()) / 1000)
    : null

  return (
    <div className="border rounded-lg bg-card overflow-hidden">
      {/* Summary row */}
      <button
        onClick={handleToggle}
        className="w-full flex items-center gap-3 p-4 hover:bg-accent/5 transition-colors text-left"
      >
        <div className="flex items-center gap-2 shrink-0">
          {run.status === 'completed' && <CheckCircle size={20} weight="fill" className="text-green-500" />}
          {run.status === 'failed' && <XCircle size={20} weight="fill" className="text-red-500" />}
          {run.status === 'running' && <CircleNotch size={20} className="animate-spin text-blue-500" />}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-mono font-medium">{run.id.slice(0, 8)}</span>
            <StatusBadge status={run.status} />
            {run.dryRun && <Badge variant="outline" className="text-xs">Dry Run</Badge>}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {new Date(run.startedAt).toLocaleString()}
            {duration !== null && <span className="ml-2">({duration}s)</span>}
          </p>
        </div>

        <div className="hidden md:flex items-center gap-4 text-xs text-muted-foreground shrink-0">
          <span>{run.newsCount} news</span>
          <span>{run.postCount} posts</span>
          <span>{run.publishCount} published</span>
          {run.errors.length > 0 && (
            <span className="text-amber-600">{run.errors.length} errors</span>
          )}
        </div>

        <div className="shrink-0 text-muted-foreground">
          {expanded ? <CaretUp size={16} /> : <CaretDown size={16} />}
        </div>
      </button>

      {/* Expanded detail */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t px-4 py-4 space-y-4">
              {loading && (
                <div className="flex items-center justify-center py-8">
                  <CircleNotch size={24} className="animate-spin text-muted-foreground" />
                </div>
              )}

              {run.status === 'running' && (
                <p className="text-sm text-muted-foreground text-center py-4">Pipeline is still running...</p>
              )}

              {result && (
                <>
                  {/* Stats */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Card>
                      <CardContent className="p-3 text-center">
                        <p className="text-2xl font-bold">{result.newsItems.length}</p>
                        <p className="text-xs text-muted-foreground">News Sources</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-3 text-center">
                        <p className="text-2xl font-bold">{result.posts.length}</p>
                        <p className="text-xs text-muted-foreground">Posts Generated</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-3 text-center">
                        <p className="text-2xl font-bold">{result.imageSets.length}</p>
                        <p className="text-xs text-muted-foreground">Image Sets</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-3 text-center">
                        <p className="text-2xl font-bold">{result.publishResults.length}</p>
                        <p className="text-xs text-muted-foreground">Publish Results</p>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Errors */}
                  {result.errors.length > 0 && (
                    <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 space-y-1">
                      <p className="text-sm font-medium flex items-center gap-1.5 text-amber-600">
                        <Warning size={16} weight="fill" />
                        {result.errors.length} warning{result.errors.length !== 1 ? 's' : ''}
                      </p>
                      {result.errors.slice(0, 5).map((err, i) => (
                        <p key={i} className="text-xs text-muted-foreground">{err}</p>
                      ))}
                      {result.errors.length > 5 && (
                        <p className="text-xs text-muted-foreground">...and {result.errors.length - 5} more</p>
                      )}
                    </div>
                  )}

                  {/* News sources */}
                  {result.newsItems.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                        <Newspaper size={14} weight="duotone" /> News Sources
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {result.newsItems.map((item, i) => (
                          <Badge key={i} variant="outline" className="text-xs">
                            {item.topic.slice(0, 60)}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Generated posts */}
                  {result.posts.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium text-muted-foreground">Generated Posts</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {result.posts.map((post) => (
                          <PostCard
                            key={post.postId}
                            post={post}
                            imageSet={result.imageSets.find((is) => is.postId === post.postId)}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {result.posts.length === 0 && result.errors.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">No posts were generated in this run.</p>
                  )}
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────

export function RunHistory() {
  const [connected, setConnected] = useState<boolean | null>(null)
  const [runs, setRuns] = useState<RunSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'completed' | 'failed'>('all')

  const fetchRuns = useCallback(async () => {
    const ok = await checkHealth()
    setConnected(ok)
    if (ok) {
      const allRuns = await listPipelineRuns(200)
      setRuns(allRuns)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchRuns()
  }, [fetchRuns])

  const filteredRuns = filter === 'all' ? runs : runs.filter((r) => r.status === filter)

  if (connected === null || loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <CircleNotch size={32} className="animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!connected) {
    return (
      <div className="text-center py-20 space-y-4">
        <Plugs size={48} weight="duotone" className="mx-auto text-muted-foreground" />
        <h3 className="text-xl font-semibold">Backend Not Connected</h3>
        <p className="text-muted-foreground">Start the orchestrator API server to view run history.</p>
        <code className="block text-sm bg-muted px-4 py-2 rounded-md mx-auto w-fit">
          cd orchestrator-node && npm run serve
        </code>
        <Button onClick={fetchRuns} variant="outline" className="mt-4">
          <ArrowsClockwise size={18} className="mr-2" /> Retry
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <ClockCounterClockwise size={24} weight="duotone" />
            Pipeline Run History
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">{runs.length} total runs</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center border rounded-lg overflow-hidden text-sm">
            {(['all', 'completed', 'failed'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 capitalize transition-colors ${
                  filter === f ? 'bg-primary text-primary-foreground' : 'hover:bg-accent/10'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
          <Button onClick={fetchRuns} variant="outline" size="sm">
            <ArrowsClockwise size={16} className="mr-1.5" /> Refresh
          </Button>
        </div>
      </div>

      {/* Runs list */}
      {filteredRuns.length > 0 ? (
        <div className="space-y-2">
          {filteredRuns.map((run) => (
            <ExpandableRunRow key={run.id} run={run} />
          ))}
        </div>
      ) : (
        <div className="text-center py-16 bg-card rounded-lg border-2 border-dashed">
          <ClockCounterClockwise size={48} weight="duotone" className="mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">
            {filter === 'all' ? 'No pipeline runs yet' : `No ${filter} runs found`}
          </h3>
          <p className="text-muted-foreground">
            {filter === 'all'
              ? 'Run the pipeline from the Dashboard tab to see results here.'
              : 'Try a different filter or run a new pipeline.'}
          </p>
        </div>
      )}
    </div>
  )
}
