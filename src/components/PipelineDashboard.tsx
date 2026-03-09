import { useState, useEffect, useCallback } from 'react'
import {
  checkHealth,
  getConfigStatus,
  triggerPipelineRun,
  getPipelineStatus,
  getPipelineResult,
  listPipelineRuns,
  type ConfigStatus,
  type RunSummary,
  type PipelineResult,
  type RunPipelineOptions,
  type OrchestratorPlatform,
  type OrchestratorTone,
  type SocialPost,
  type ImageSet,
} from '@/lib/orchestrator-api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
  Play,
  ArrowsClockwise,
  CheckCircle,
  XCircle,
  CircleNotch,
  Plugs,
  Lightning,
  Eye,
  Newspaper,
  ImageSquare,
  PaperPlaneTilt,
  Warning,
  Scales,
  X,
  Hash,
  Clock,
  LinkSimple,
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

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span className={`inline-block w-2.5 h-2.5 rounded-full ${ok ? 'bg-green-500' : 'bg-red-400'}`} />
  )
}

function AgentStep({
  label,
  icon: Icon,
  status,
}: {
  label: string
  icon: React.ElementType
  status: 'pending' | 'running' | 'success' | 'failed' | undefined
}) {
  return (
    <div className="flex items-center gap-2 py-1.5">
      <Icon
        size={18}
        weight="duotone"
        className={
          status === 'running'
            ? 'text-blue-500 animate-pulse'
            : status === 'success'
              ? 'text-green-500'
              : status === 'failed'
                ? 'text-red-500'
                : 'text-muted-foreground'
        }
      />
      <span className="text-sm flex-1">{label}</span>
      {status === 'running' && <CircleNotch size={14} className="animate-spin text-blue-500" />}
      {status === 'success' && <CheckCircle size={14} weight="fill" className="text-green-500" />}
      {status === 'failed' && <XCircle size={14} weight="fill" className="text-red-500" />}
    </div>
  )
}

// ─── Content card ────────────────────────────────────────────────────────────

function ContentPostCard({
  post,
  imageSet,
  runLabel,
}: {
  post: SocialPost
  imageSet?: ImageSet
  runLabel?: string
}) {
  const image = imageSet?.images?.[0]
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      className="border rounded-xl overflow-hidden bg-card shadow-sm hover:shadow-md transition-shadow"
    >
      {image && image.url && !image.url.startsWith('data:') && (
        <img
          src={image.url}
          alt={image.altText || 'Generated image'}
          className="w-full h-44 object-cover"
        />
      )}
      <div className="p-5 space-y-3">
        {/* Header badges */}
        <div className="flex items-center gap-2 flex-wrap">
          <Badge className={PLATFORM_COLORS[post.platform] || ''}>
            {post.platform}
          </Badge>
          <Badge variant="outline" className="text-xs capitalize">
            {post.tone}
          </Badge>
          {runLabel && (
            <Badge variant="secondary" className="text-xs ml-auto">
              {runLabel}
            </Badge>
          )}
        </div>

        {/* Body */}
        <p className="text-sm leading-relaxed whitespace-pre-wrap">{post.content}</p>

        {/* Hashtags */}
        {post.hashtags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {post.hashtags.map((tag) => (
              <span key={tag} className="inline-flex items-center gap-0.5 text-xs text-primary font-medium bg-primary/5 px-2 py-0.5 rounded-full">
                <Hash size={10} />
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground pt-2 border-t">
          <span className="flex items-center gap-1">
            <Clock size={12} />
            {new Date(post.createdAt).toLocaleTimeString()}
          </span>
          <span>{post.characterCount} chars</span>
          {post.newsSource && (
            <span className="flex items-center gap-1 truncate ml-auto">
              <LinkSimple size={12} />
              {post.newsSource}
            </span>
          )}
        </div>
      </div>
    </motion.div>
  )
}

// ─── Run history row ─────────────────────────────────────────────────────────

function RunRow({
  run,
  onPreview,
  onCompareToggle,
  isSelected,
}: {
  run: RunSummary
  onPreview: (id: string) => void
  onCompareToggle: (id: string) => void
  isSelected: boolean
}) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/5 transition-colors">
      <Checkbox
        checked={isSelected}
        onCheckedChange={() => onCompareToggle(run.id)}
        aria-label={`Select run ${run.id.slice(0, 8)}`}
      />
      <div className="flex items-center gap-2">
        {run.status === 'completed' && <CheckCircle size={18} weight="fill" className="text-green-500" />}
        {run.status === 'failed' && <XCircle size={18} weight="fill" className="text-red-500" />}
        {run.status === 'running' && <CircleNotch size={18} className="animate-spin text-blue-500" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">
          {run.id.slice(0, 8)}
          <span className="text-muted-foreground ml-2 font-normal">
            {new Date(run.startedAt).toLocaleString()}
          </span>
        </p>
        <p className="text-xs text-muted-foreground">
          {run.newsCount} news &rarr; {run.postCount} posts &rarr; {run.publishCount} published
        </p>
      </div>
      {run.status !== 'running' && (
        <Button variant="ghost" size="sm" onClick={() => onPreview(run.id)}>
          <Eye size={16} className="mr-1.5" /> View
        </Button>
      )}
    </div>
  )
}

// ─── Compare view ────────────────────────────────────────────────────────────

function CompareView({
  compareIds,
  compareResults,
  onClose,
}: {
  compareIds: string[]
  compareResults: Map<string, PipelineResult>
  onClose: () => void
}) {
  const results = compareIds.map((id) => ({ id, result: compareResults.get(id) })).filter((r) => r.result)
  if (results.length < 2) return null

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Scales size={22} weight="duotone" />
          Comparing {results.length} Runs
        </h3>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X size={18} className="mr-1" /> Close Comparison
        </Button>
      </div>

      {/* Summary comparison */}
      <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${results.length}, 1fr)` }}>
        {results.map(({ id, result }) => (
          <Card key={id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-mono">{id.slice(0, 8)}...</CardTitle>
            </CardHeader>
            <CardContent className="text-xs space-y-1">
              <p>{result!.newsItems.length} news sources</p>
              <p>{result!.posts.length} posts generated</p>
              <p>{result!.imageSets.length} image sets</p>
              <p>{result!.publishResults.length} publish results</p>
              {result!.errors.length > 0 && (
                <p className="text-amber-600">{result!.errors.length} warnings</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Side-by-side content */}
      <div>
        <h4 className="text-sm font-medium text-muted-foreground mb-3">Generated Posts — Side by Side</h4>
        <div className="grid gap-6" style={{ gridTemplateColumns: `repeat(${results.length}, 1fr)` }}>
          {results.map(({ id, result }) => (
            <div key={id} className="space-y-4">
              <p className="text-xs font-mono text-muted-foreground sticky top-0 bg-background py-1">
                Run {id.slice(0, 8)}
              </p>
              <AnimatePresence>
                {result!.posts.map((post) => (
                  <ContentPostCard
                    key={post.postId}
                    post={post}
                    imageSet={result!.imageSets.find((is) => is.postId === post.postId)}
                    runLabel={id.slice(0, 8)}
                  />
                ))}
              </AnimatePresence>
              {result!.posts.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">No posts in this run</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Single-run detail view ──────────────────────────────────────────────────

function RunDetailView({
  result,
  runId,
  onClose,
}: {
  result: PipelineResult
  runId: string
  onClose: () => void
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Eye size={22} weight="duotone" />
          Run {runId.slice(0, 8)} — {result.posts.length} posts
        </h3>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X size={18} className="mr-1" /> Close
        </Button>
      </div>

      {result.errors.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 space-y-1">
          <p className="text-sm font-medium flex items-center gap-1.5 text-amber-600">
            <Warning size={16} weight="fill" />
            {result.errors.length} warning{result.errors.length !== 1 ? 's' : ''}
          </p>
          {result.errors.map((err, i) => (
            <p key={i} className="text-xs text-muted-foreground">{err}</p>
          ))}
        </div>
      )}

      {result.newsItems.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground">News Sources Used</h4>
          <div className="flex flex-wrap gap-2">
            {result.newsItems.map((item, i) => (
              <Badge key={i} variant="outline" className="text-xs">
                {item.topic.slice(0, 60)}
              </Badge>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <AnimatePresence>
          {result.posts.map((post) => (
            <ContentPostCard
              key={post.postId}
              post={post}
              imageSet={result.imageSets.find((is) => is.postId === post.postId)}
            />
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────

export function PipelineDashboard() {
  const [connected, setConnected] = useState<boolean | null>(null)
  const [configStatus, setConfigStatus] = useState<ConfigStatus | null>(null)
  const [runs, setRuns] = useState<RunSummary[]>([])
  const [activeRunId, setActiveRunId] = useState<string | null>(null)

  // Single preview
  const [previewRunId, setPreviewRunId] = useState<string | null>(null)
  const [previewResult, setPreviewResult] = useState<PipelineResult | null>(null)

  // Comparison
  const [compareIds, setCompareIds] = useState<string[]>([])
  const [compareResults, setCompareResults] = useState<Map<string, PipelineResult>>(new Map())
  const [comparing, setComparing] = useState(false)

  // Run options
  const [selectedPlatform, setSelectedPlatform] = useState<OrchestratorPlatform | 'all'>('all')
  const [selectedTone, setSelectedTone] = useState<OrchestratorTone>('professional')
  const [dryRun, setDryRun] = useState(true)

  // ─── Check backend connectivity ──────────────────────────────────────────

  const refreshStatus = useCallback(async () => {
    const ok = await checkHealth()
    setConnected(ok)
    if (ok) {
      const cfg = await getConfigStatus()
      setConfigStatus(cfg)
      const allRuns = await listPipelineRuns()
      setRuns(allRuns)
    }
  }, [])

  useEffect(() => {
    refreshStatus()
    const interval = setInterval(refreshStatus, 15000)
    return () => clearInterval(interval)
  }, [refreshStatus])

  // ─── Poll active run ────────────────────────────────────────────────────

  useEffect(() => {
    if (!activeRunId) return
    let cancelled = false

    const poll = async () => {
      while (!cancelled) {
        try {
          const status = await getPipelineStatus(activeRunId)
          if (status.status !== 'running') {
            try {
              const finalId = status.id !== activeRunId ? status.id : activeRunId
              const result = await getPipelineResult(finalId)
              if ('pipelineId' in result) {
                setActiveRunId(null)
                setPreviewRunId(finalId)
                setPreviewResult(result)
                toast.success(
                  `Pipeline finished: ${result.posts.length} posts generated`,
                  { description: result.errors.length > 0 ? `${result.errors.length} warnings` : undefined }
                )
              }
            } catch { /* still finalizing */ }
            await refreshStatus()
            break
          }
        } catch {
          await refreshStatus()
          break
        }
        await new Promise((r) => setTimeout(r, 3000))
      }
    }

    poll()
    return () => { cancelled = true }
  }, [activeRunId, refreshStatus])

  // ─── Actions ─────────────────────────────────────────────────────────────

  const handleRunPipeline = async () => {
    if (!connected) {
      toast.error('Backend not connected. Start the API server first.')
      return
    }
    const options: RunPipelineOptions = {
      platforms: selectedPlatform === 'all' ? undefined : [selectedPlatform],
      tone: selectedTone,
      dryRun,
    }
    try {
      const { runId } = await triggerPipelineRun(options)
      setActiveRunId(runId)
      setPreviewRunId(null)
      setPreviewResult(null)
      setComparing(false)
      toast.info('Pipeline started!', { description: dryRun ? 'Dry-run mode' : 'Posts will be published' })
      await refreshStatus()
    } catch (err) {
      toast.error(`Failed to start pipeline: ${err instanceof Error ? err.message : err}`)
    }
  }

  const handleViewResult = async (runId: string) => {
    try {
      const result = await getPipelineResult(runId)
      if ('pipelineId' in result) {
        setPreviewRunId(runId)
        setPreviewResult(result)
        setComparing(false)
      }
    } catch (err) {
      toast.error(`Failed to load result: ${err instanceof Error ? err.message : err}`)
    }
  }

  const handleCompareToggle = (runId: string) => {
    setCompareIds((prev) => {
      if (prev.includes(runId)) return prev.filter((id) => id !== runId)
      if (prev.length >= 3) {
        toast.warning('Compare up to 3 runs at once')
        return prev
      }
      return [...prev, runId]
    })
  }

  const handleStartCompare = async () => {
    if (compareIds.length < 2) {
      toast.warning('Select at least 2 runs to compare')
      return
    }
    const map = new Map<string, PipelineResult>()
    for (const id of compareIds) {
      try {
        const result = await getPipelineResult(id)
        if ('pipelineId' in result) map.set(id, result)
      } catch {
        toast.error(`Failed to load run ${id.slice(0, 8)}`)
      }
    }
    setCompareResults(map)
    setComparing(true)
    setPreviewRunId(null)
    setPreviewResult(null)
  }

  const handleCloseCompare = () => {
    setComparing(false)
    setCompareIds([])
    setCompareResults(new Map())
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  if (connected === null) {
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
        <p className="text-muted-foreground max-w-md mx-auto">
          Start the orchestrator API server to use the pipeline dashboard.
        </p>
        <code className="block text-sm bg-muted px-4 py-2 rounded-md mx-auto w-fit">
          cd orchestrator-node && npm run serve
        </code>
        <Button onClick={refreshStatus} variant="outline" className="mt-4">
          <ArrowsClockwise size={18} className="mr-2" />
          Retry Connection
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* ── Config Status ── */}
      {configStatus && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">LLM Providers</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              <div className="flex items-center gap-2 text-sm"><StatusDot ok={configStatus.llm.openai} /> OpenAI</div>
              <div className="flex items-center gap-2 text-sm"><StatusDot ok={configStatus.llm.anthropic} /> Anthropic</div>
              <div className="flex items-center gap-2 text-sm"><StatusDot ok={configStatus.llm.ollama} /> Ollama</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Platforms</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {Object.entries(configStatus.platforms).map(([name, ok]) => (
                <div key={name} className="flex items-center gap-2 text-sm">
                  <StatusDot ok={ok} /> {name.charAt(0).toUpperCase() + name.slice(1)}
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Services</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              <div className="flex items-center gap-2 text-sm"><StatusDot ok={configStatus.services.supabase} /> Supabase</div>
              <div className="flex items-center gap-2 text-sm"><StatusDot ok={configStatus.services.newsapi} /> NewsAPI</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Run Controls ── */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row items-start md:items-end gap-4">
            <div className="space-y-1.5 flex-1">
              <Label className="text-sm">Platform</Label>
              <Select value={selectedPlatform} onValueChange={(v) => setSelectedPlatform(v as OrchestratorPlatform | 'all')}>
                <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Platforms</SelectItem>
                  <SelectItem value="twitter">Twitter</SelectItem>
                  <SelectItem value="instagram">Instagram</SelectItem>
                  <SelectItem value="linkedin">LinkedIn</SelectItem>
                  <SelectItem value="facebook">Facebook</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Tone</Label>
              <Select value={selectedTone} onValueChange={(v) => setSelectedTone(v as OrchestratorTone)}>
                <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="professional">Professional</SelectItem>
                  <SelectItem value="casual">Casual</SelectItem>
                  <SelectItem value="playful">Playful</SelectItem>
                  <SelectItem value="inspirational">Inspirational</SelectItem>
                  <SelectItem value="informative">Informative</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 pb-0.5">
              <Switch id="dry-run" checked={dryRun} onCheckedChange={setDryRun} />
              <Label htmlFor="dry-run" className="text-sm cursor-pointer">Dry Run</Label>
            </div>
            <Button
              onClick={handleRunPipeline}
              disabled={!!activeRunId}
              size="lg"
              className="bg-gradient-to-r from-accent to-primary text-white hover:opacity-90 transition-opacity"
            >
              {activeRunId ? (
                <><CircleNotch size={20} className="animate-spin mr-2" />Running...</>
              ) : (
                <><Play size={20} weight="fill" className="mr-2" />Run Pipeline</>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Active run progress ── */}
      {activeRunId && (
        <Card className="border-blue-500/30">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CircleNotch size={20} className="animate-spin text-blue-500" />
              Pipeline Running
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <AgentStep label="Fetching News" icon={Newspaper} status="running" />
              <AgentStep label="Generating Content" icon={Lightning} status="pending" />
              <AgentStep label="Creating Images" icon={ImageSquare} status="pending" />
              <AgentStep label="Publishing" icon={PaperPlaneTilt} status="pending" />
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Compare view ── */}
      {comparing && (
        <CompareView
          compareIds={compareIds}
          compareResults={compareResults}
          onClose={handleCloseCompare}
        />
      )}

      {/* ── Single-run detail ── */}
      {previewResult && previewRunId && !comparing && (
        <RunDetailView
          result={previewResult}
          runId={previewRunId}
          onClose={() => { setPreviewRunId(null); setPreviewResult(null) }}
        />
      )}

      {/* ── Run History ── */}
      {runs.length > 0 && !comparing && !previewResult && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Recent Runs</h3>
            <div className="flex items-center gap-2">
              {compareIds.length >= 2 && (
                <Button size="sm" onClick={handleStartCompare} className="bg-gradient-to-r from-accent to-primary text-white">
                  <Scales size={16} className="mr-1.5" />
                  Compare {compareIds.length} Runs
                </Button>
              )}
              {compareIds.length > 0 && (
                <Button size="sm" variant="ghost" onClick={() => setCompareIds([])}>
                  Clear
                </Button>
              )}
            </div>
          </div>
          <p className="text-xs text-muted-foreground -mt-1">Select 2–3 runs to compare side by side</p>
          <div className="space-y-2">
            {runs.map((run) => (
              <RunRow
                key={run.id}
                run={run}
                onPreview={handleViewResult}
                onCompareToggle={handleCompareToggle}
                isSelected={compareIds.includes(run.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Empty state ── */}
      {runs.length === 0 && !activeRunId && !previewResult && !comparing && (
        <div className="text-center py-16 bg-card rounded-lg border-2 border-dashed">
          <Lightning size={48} weight="duotone" className="mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No pipeline runs yet</h3>
          <p className="text-muted-foreground mb-4">
            Configure your options above and run the pipeline to generate content
          </p>
        </div>
      )}
    </div>
  )
}
