import { useState, useEffect, useCallback, useRef } from 'react'
import {
  checkHealth,
  getConfigStatus,
  triggerPipelineRun,
  getPipelineStatus,
  getPipelineResult,
  listPipelineRuns,
  getActivePersona,
  type ConfigStatus,
  type RunSummary,
  type PipelineResult,
  type RunPipelineOptions,
  type OrchestratorPlatform,
  type PersonaProfile,
  type SocialPost,
  type ImageSet,
  type PartialResults,
} from '@/lib/orchestrator-api'
import { PersonaSettingsDialog } from '@/components/PersonaSettingsDialog'
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
  UserCircle,
  Gear,
} from '@phosphor-icons/react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'

// ─── Polling hook ────────────────────────────────────────────────────────────

function usePolling<T>(
  fetcher: () => Promise<T>,
  interval: number,
  enabled: boolean,
): T | null {
  const [data, setData] = useState<T | null>(null)
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher

  useEffect(() => {
    if (!enabled) {
      setData(null)
      return
    }

    let mounted = true

    const tick = async () => {
      try {
        const result = await fetcherRef.current()
        if (mounted) setData(result)
      } catch {
        // Silently skip — will retry on the next interval
      }
    }

    tick()
    const id = setInterval(tick, interval)
    return () => {
      mounted = false
      clearInterval(id)
    }
  }, [enabled, interval])

  return data
}

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
  detail,
  isLast,
}: {
  label: string
  icon: React.ElementType
  status: 'pending' | 'running' | 'success' | 'failed' | undefined
  detail?: string
  isLast?: boolean
}) {
  const bgColor =
    status === 'running'
      ? 'bg-blue-500/15 ring-2 ring-blue-500/40'
      : status === 'success'
        ? 'bg-green-500/15 ring-1 ring-green-500/30'
        : status === 'failed'
          ? 'bg-red-500/15 ring-1 ring-red-500/30'
          : 'bg-muted/50'

  const iconColor =
    status === 'running'
      ? 'text-blue-500'
      : status === 'success'
        ? 'text-green-500'
        : status === 'failed'
          ? 'text-red-500'
          : 'text-muted-foreground/50'

  return (
    <div className="flex items-start gap-3">
      {/* Icon circle */}
      <div className="flex flex-col items-center">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 ${bgColor}`}>
          {status === 'running' ? (
            <CircleNotch size={22} className="animate-spin text-blue-500" />
          ) : status === 'success' ? (
            <CheckCircle size={22} weight="fill" className="text-green-500" />
          ) : status === 'failed' ? (
            <XCircle size={22} weight="fill" className="text-red-500" />
          ) : (
            <Icon size={22} weight="duotone" className={iconColor} />
          )}
        </div>
        {!isLast && (
          <div className={`w-0.5 h-6 mt-1 transition-colors duration-300 ${
            status === 'success' ? 'bg-green-500/40' : status === 'failed' ? 'bg-red-500/40' : 'bg-border'
          }`} />
        )}
      </div>
      {/* Text */}
      <div className="pt-1.5 min-w-0 flex-1">
        <p className={`text-sm font-medium leading-none ${
          status === 'running' ? 'text-blue-600' : status === 'success' ? 'text-green-600' : status === 'failed' ? 'text-red-600' : 'text-muted-foreground'
        }`}>
          {label}
          {status === 'running' && <span className="ml-1.5 text-xs font-normal text-blue-400 animate-pulse">in progress…</span>}
        </p>
        {detail && (
          <p className="text-xs text-muted-foreground mt-1 truncate">{detail}</p>
        )}
      </div>
    </div>
  )
}

// ─── Content card ────────────────────────────────────────────────────────────

function ContentPostCard({
  post,
  imageSet,
  runLabel,
  compact,
}: {
  post: SocialPost
  imageSet?: ImageSet
  runLabel?: string
  compact?: boolean
}) {
  const image = imageSet?.images?.[0]
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      className={`border rounded-xl overflow-hidden bg-card shadow-sm hover:shadow-md transition-shadow ${compact ? 'text-[0.8rem]' : ''}`}
    >
      {image && image.url && !image.url.startsWith('data:') && (
        <img
          src={image.url}
          alt={image.altText || 'Generated image'}
          className={`w-full object-cover ${compact ? 'h-28' : 'h-44'}`}
        />
      )}
      <div className={compact ? 'p-3 space-y-2' : 'p-5 space-y-3'}>
        {/* Header badges */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge className={`${PLATFORM_COLORS[post.platform] || ''} ${compact ? 'text-[10px] px-1.5 py-0' : ''}`}>
            {post.platform}
          </Badge>
          {post.tone && (
            <Badge variant="outline" className={`capitalize ${compact ? 'text-[10px] px-1.5 py-0' : 'text-xs'}`}>
              {post.tone}
            </Badge>
          )}
          {post.generatedBy && (
            <Badge variant="outline" className={`bg-violet-500/10 text-violet-600 border-violet-500/20 ${compact ? 'text-[10px] px-1.5 py-0' : 'text-xs'}`}>
              {post.generatedBy}
            </Badge>
          )}
          {runLabel && (
            <Badge variant="secondary" className={`ml-auto ${compact ? 'text-[10px] px-1.5 py-0' : 'text-xs'}`}>
              {runLabel}
            </Badge>
          )}
        </div>

        {/* Body */}
        <p className={`leading-relaxed whitespace-pre-wrap ${compact ? 'text-xs line-clamp-4' : 'text-sm'}`}>{post.content}</p>

        {/* Hashtags */}
        {post.hashtags.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {post.hashtags.map((tag) => (
              <span key={tag} className={`inline-flex items-center gap-0.5 text-primary font-medium bg-primary/5 rounded-full ${compact ? 'text-[10px] px-1.5 py-0' : 'text-xs px-2 py-0.5'}`}>
                <Hash size={compact ? 8 : 10} />
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className={`flex items-center gap-2 text-muted-foreground border-t ${compact ? 'text-[10px] pt-1.5' : 'text-xs pt-2 gap-3'}`}>
          <span className="flex items-center gap-1">
            <Clock size={compact ? 10 : 12} />
            {new Date(post.createdAt).toLocaleTimeString()}
          </span>
          <span>{post.characterCount} chars</span>
          {post.newsSource && !compact && (
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
        <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${results.length}, 1fr)` }}>
          {results.map(({ id, result }) => (
            <div key={id} className="space-y-3">
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
                    compact
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

  // Partial results from active polling
  const [activePartial, setActivePartial] = useState<PartialResults | null>(null)

  // Run options
  const [selectedPlatform, setSelectedPlatform] = useState<OrchestratorPlatform | 'all'>('all')
  const [dryRun, setDryRun] = useState(true)

  // Persona
  const [activePersona, setActivePersona] = useState<PersonaProfile | null>(null)
  const [personaDialogOpen, setPersonaDialogOpen] = useState(false)

  // ─── Check backend connectivity ──────────────────────────────────────────

  const refreshStatus = useCallback(async () => {
    const ok = await checkHealth()
    setConnected(ok)
    if (ok) {
      const [cfg, allRuns, persona] = await Promise.all([
        getConfigStatus(),
        listPipelineRuns(),
        getActivePersona(),
      ])
      setConfigStatus(cfg)
      setRuns(allRuns)
      setActivePersona(persona)
    }
  }, [])

  useEffect(() => {
    refreshStatus()
    const interval = setInterval(refreshStatus, 15000)
    return () => clearInterval(interval)
  }, [refreshStatus])

  // Auto-resume polling if a pipeline is still running (e.g., after page refresh)
  useEffect(() => {
    if (activeRunId) return
    const runningRun = runs.find((r) => r.status === 'running')
    if (runningRun) {
      setActiveRunId(runningRun.id)
    }
  }, [runs, activeRunId])

  // ─── Poll active run (interval-based, survives transient errors) ───────

  const activeStatus = usePolling(
    () => getPipelineStatus(activeRunId!),
    3000,
    !!activeRunId,
  )

  // React to polled status changes
  useEffect(() => {
    if (!activeStatus || !activeRunId) return

    // Sync agent statuses into the runs list
    if (activeStatus.agentStatuses) {
      setRuns((prev) =>
        prev.map((r) =>
          r.id === activeRunId ? { ...r, agentStatuses: activeStatus.agentStatuses } : r
        )
      )
    }

    // Sync partial results for live preview
    setActivePartial(activeStatus.partialResults ?? null)

    // Handle completion
    if (activeStatus.status !== 'running') {
      setActivePartial(null)
      const finalId = activeStatus.id !== activeRunId ? activeStatus.id : activeRunId

      getPipelineResult(finalId)
        .then((result) => {
          if ('pipelineId' in result) {
            setPreviewRunId(finalId)
            setPreviewResult(result)
            toast.success(
              `Pipeline finished: ${result.posts.length} posts generated`,
              { description: result.errors.length > 0 ? `${result.errors.length} warnings` : undefined }
            )
          }
        })
        .catch(() => { /* result will appear in the runs list */ })

      setActiveRunId(null)
      refreshStatus()
    }
  }, [activeStatus, activeRunId, refreshStatus])

  // ─── Actions ─────────────────────────────────────────────────────────────

  const handleRunPipeline = async () => {
    if (!connected) {
      toast.error('Backend not connected. Start the API server first.')
      return
    }
    const options: RunPipelineOptions = {
      platforms: selectedPlatform === 'all' ? undefined : [selectedPlatform],
      dryRun,
    }
    try {
      const { runId } = await triggerPipelineRun(options)
      setActiveRunId(runId)
      setPreviewRunId(null)
      setPreviewResult(null)
      setActivePartial(null)
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
              <Label className="text-sm">Persona</Label>
              <div className="flex items-center gap-2">
                <Badge className="bg-violet-500/10 text-violet-600 border-violet-500/20 text-sm py-1 px-3">
                  <UserCircle size={16} weight="duotone" className="mr-1.5" />
                  {activePersona?.name ?? 'Allen Sharpe'}
                </Badge>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPersonaDialogOpen(true)}
                >
                  <Gear size={14} className="mr-1" />
                  View
                </Button>
              </div>
            </div>
            <div className="flex items-center gap-2 pb-0.5">
              <Switch id="dry-run" checked={dryRun} onCheckedChange={setDryRun} />
              <Label htmlFor="dry-run" className="text-sm cursor-pointer">Dry Run</Label>
            </div>
            <Button
              onClick={handleRunPipeline}
              disabled={!!activeRunId}
              size="lg"
              className="bg-linear-to-r from-accent to-primary text-white hover:opacity-90 transition-opacity"
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
      {activeRunId && (() => {
        const activeRun = runs.find((r) => r.id === activeRunId)
        const agentStatus = (agent: string): 'pending' | 'running' | 'success' | 'failed' | undefined => {
          const s = activeRun?.agentStatuses?.[agent]
          if (s === 'running') return 'running'
          if (s === 'success') return 'success'
          if (s === 'failed') return 'failed'
          return 'pending'
        }

        // Calculate progress percentage
        const statuses = ['news_agent', 'ranking_agent', 'content_agent', 'image_agent', 'publish_agent']
        const completedCount = statuses.filter((a) => {
          const s = agentStatus(a)
          return s === 'success' || s === 'failed'
        }).length
        const runningCount = statuses.filter((a) => agentStatus(a) === 'running').length
        const progressPct = Math.round(((completedCount + runningCount * 0.5) / statuses.length) * 100)

        // Build detail strings from partial results
        const partial = activePartial
        const newsDetail = partial && partial.newsCount > 0
          ? `Found ${partial.newsCount} article${partial.newsCount !== 1 ? 's' : ''}`
          : agentStatus('news_agent') === 'running' ? 'Scanning sources…' : undefined
        const rankingDetail = agentStatus('ranking_agent') === 'running'
          ? 'Evaluating postworthiness…'
          : agentStatus('ranking_agent') === 'success'
            ? 'Top articles selected'
            : undefined
        const contentDetail = partial && partial.postCount > 0
          ? `${partial.postCount} post${partial.postCount !== 1 ? 's' : ''} generated`
          : agentStatus('content_agent') === 'running' ? 'Writing posts…' : undefined
        const imageDetail = partial && partial.imageCount > 0
          ? `${partial.imageCount} image${partial.imageCount !== 1 ? 's' : ''} created`
          : agentStatus('image_agent') === 'running' ? 'Generating visuals…' : undefined
        const publishDetail = partial && partial.publishCount > 0
          ? `${partial.publishCount} published`
          : agentStatus('publish_agent') === 'running' ? 'Distributing…' : undefined

        return (
          <Card className="border-blue-500/30 overflow-hidden">
            {/* Progress bar along the top */}
            <div className="h-1 bg-muted">
              <motion.div
                className="h-full bg-linear-to-r from-blue-500 to-primary"
                initial={{ width: 0 }}
                animate={{ width: `${progressPct}%` }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
              />
            </div>

            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <CircleNotch size={20} className="animate-spin text-blue-500" />
                Pipeline Running
                <span className="ml-auto text-xs font-normal text-muted-foreground">{progressPct}%</span>
              </CardTitle>
            </CardHeader>

            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-[1fr_1.5fr] gap-6">
                {/* Left: vertical stepper */}
                <div className="space-y-0">
                  <AgentStep label="Fetching News" icon={Newspaper} status={agentStatus('news_agent')} detail={newsDetail} />
                  <AgentStep label="Ranking Articles" icon={Scales} status={agentStatus('ranking_agent')} detail={rankingDetail} />
                  <AgentStep label="Generating Content" icon={Lightning} status={agentStatus('content_agent')} detail={contentDetail} />
                  <AgentStep label="Creating Images" icon={ImageSquare} status={agentStatus('image_agent')} detail={imageDetail} />
                  <AgentStep label="Publishing" icon={PaperPlaneTilt} status={agentStatus('publish_agent')} detail={publishDetail} isLast />
                </div>

                {/* Right: live preview panel */}
                <div className="space-y-3 border-l pl-5 min-h-[120px]">
                  {/* News topics discovered */}
                  {partial && partial.newsTopics.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-1.5"
                    >
                      <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                        <Newspaper size={12} weight="duotone" />
                        News Found
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {partial.newsTopics.map((topic, i) => (
                          <Badge key={i} variant="outline" className="text-[11px] py-0.5 max-w-[220px] truncate">
                            {topic}
                          </Badge>
                        ))}
                      </div>
                    </motion.div>
                  )}

                  {/* Post previews */}
                  {partial && partial.postPreviews.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-2"
                    >
                      <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                        <Lightning size={12} weight="duotone" />
                        Generated Posts
                      </p>
                      {partial.postPreviews.map((preview, i) => (
                        <motion.div
                          key={i}
                          initial={{ opacity: 0, x: 12 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.1 }}
                          className="rounded-lg border bg-card/50 p-2.5 space-y-1"
                        >
                          <div className="flex items-center gap-1.5">
                            <Badge className={`text-[10px] px-1.5 py-0 ${PLATFORM_COLORS[preview.platform] || ''}`}>
                              {preview.platform}
                            </Badge>
                            {preview.generatedBy && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-violet-500/10 text-violet-600 border-violet-500/20">
                                {preview.generatedBy}
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                            {preview.content}{preview.content.length >= 120 ? '…' : ''}
                          </p>
                        </motion.div>
                      ))}
                    </motion.div>
                  )}

                  {/* Empty state while waiting */}
                  {(!partial || (partial.newsTopics.length === 0 && partial.postPreviews.length === 0)) && (
                    <div className="flex items-center justify-center h-full text-muted-foreground">
                      <div className="text-center space-y-1">
                        <CircleNotch size={24} className="animate-spin mx-auto text-muted-foreground/50" />
                        <p className="text-xs">Waiting for results…</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )
      })()}

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
                <Button size="sm" onClick={handleStartCompare} className="bg-linear-to-r from-accent to-primary text-white">
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

      {/* ── Persona Settings Dialog ── */}
      <PersonaSettingsDialog
        open={personaDialogOpen}
        onClose={() => setPersonaDialogOpen(false)}
      />
    </div>
  )
}
