import { useState, useEffect } from 'react'
import {
  refinePostContent,
  type SocialPost,
} from '@/lib/orchestrator-api'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import {
  ArrowsClockwise,
  CheckCircle,
  Warning,
  Lightning,
  Sparkle,
  CircleNotch,
} from '@phosphor-icons/react'
import { toast } from 'sonner'

const PRESET_PROMPTS = [
  { label: 'More Concise', prompt: 'Make this more concise and punchy without losing the edge.' },
  { label: 'Stronger Hook', prompt: 'Rewrite the opening to be more attention-grabbing and impossible to scroll past.' },
  { label: 'Professional Tone', prompt: 'Shift to a more professional tone while keeping the core message and persona voice.' },
  { label: 'Add CTA', prompt: 'Add or strengthen the call-to-action to drive more engagement and comments.' },
  { label: 'Improve Flow', prompt: 'Improve the logical flow and readability. Make transitions smoother.' },
  { label: 'More Provocative', prompt: 'Dial up the intensity and provocation. Make it impossible to ignore.' },
  { label: 'Unhinged Rant', prompt: 'Rewrite this as an unhinged, confrontational rant that treats the product/deal like a grand conspiracy against the American consumer. Open by dismissing the product as absurd, then pivot to outrage about WHY it exists. Frame discounts and email signups as manipulative psyops — the system extracting data from you while making you feel clever. Use short, punchy sentence fragments for emphasis like "A chair. A CHAIR." Escalate mundane retail details (free shipping, coupon codes, email lists) into existential commentary about consumer culture. Drip with sarcasm — stack words like "Great. Wonderful. Amazing." to mock the deal. Break the fourth wall — talk directly to "America" or the audience, tell them to "wake up." End with a call to awareness, not a call to action — the punchline is that even a simple purchase has strings attached. Keep hashtags sharp and ironic, 2-3 max. Tone: 80% theatrical outrage, 20% genuine insight buried under the chaos. Never sound like you\'re selling — sound like you\'re exposing.' },
]

interface RefineDialogProps {
  post: SocialPost | null
  pipelineId: string
  open: boolean
  onClose: () => void
  onRefined: (postId: string, refinedContent: string, notes: string) => void
}

export function RefineDialog({
  post,
  pipelineId,
  open,
  onClose,
  onRefined,
}: RefineDialogProps) {
  const [refinementPrompt, setRefinementPrompt] = useState('')
  const [refining, setRefining] = useState(false)
  const [result, setResult] = useState<{
    refinedContent: string
    notes: string
  } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setRefinementPrompt('')
      setResult(null)
      setError(null)
      setRefining(false)
    }
  }, [open])

  const currentContent = post?.refinedContent ?? post?.content ?? ''

  const handleRefine = async () => {
    if (!post || !refinementPrompt.trim()) return

    setRefining(true)
    setResult(null)
    setError(null)

    try {
      const res = await refinePostContent(
        pipelineId,
        post.postId,
        refinementPrompt.trim(),
        currentContent,
        post.platform,
      )
      setResult({ refinedContent: res.refinedContent, notes: res.notes })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      toast.error(`Refinement failed: ${msg}`)
    } finally {
      setRefining(false)
    }
  }

  const handleAccept = () => {
    if (!post || !result) return
    onRefined(post.postId, result.refinedContent, result.notes)
    toast.success('Refined content accepted')
    onClose()
  }

  const handleTryAgain = () => {
    setResult(null)
    setError(null)
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowsClockwise size={24} weight="duotone" className="text-violet-500" />
            Refine Post with AI
          </DialogTitle>
          <DialogDescription>
            Use GPT-5.3 to improve this post. The original content is preserved — only the refined version is updated.
          </DialogDescription>
        </DialogHeader>

        {post && (
          <div className="space-y-4">
            {/* Current content preview */}
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-sm font-medium text-muted-foreground">
                  {post.refinedContent ? 'Current Refined Version' : 'Original Content'}
                </span>
                <Badge variant="outline" className="text-xs capitalize">{post.platform}</Badge>
                {post.refinedContent && (
                  <Badge className="text-xs bg-violet-500/10 text-violet-600 border-violet-500/20">
                    Previously Refined
                  </Badge>
                )}
              </div>
              <div className="bg-muted rounded-lg p-3 text-sm whitespace-pre-wrap max-h-40 overflow-y-auto">
                {currentContent}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {currentContent.length} characters &middot; {post.platform}
              </p>
            </div>

            {/* Result view */}
            {result ? (
              <div className="space-y-3">
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <Sparkle size={16} weight="fill" className="text-violet-500" />
                    <span className="text-sm font-medium">Refined Version</span>
                  </div>
                  <div className="bg-violet-500/5 border border-violet-500/20 rounded-lg p-3 text-sm whitespace-pre-wrap max-h-48 overflow-y-auto">
                    {result.refinedContent}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {result.refinedContent.length} characters
                  </p>
                </div>

                {result.notes && (
                  <Alert>
                    <AlertDescription className="text-xs">
                      <span className="font-medium">Changes:</span> {result.notes}
                    </AlertDescription>
                  </Alert>
                )}

                <div className="flex gap-2">
                  <Button onClick={handleAccept} className="flex-1 gap-1.5">
                    <CheckCircle size={16} weight="bold" />
                    Accept
                  </Button>
                  <Button variant="outline" onClick={handleTryAgain} className="gap-1.5">
                    <ArrowsClockwise size={16} />
                    Try Again
                  </Button>
                  <Button variant="ghost" onClick={onClose}>
                    Discard
                  </Button>
                </div>
              </div>
            ) : (
              <>
                {/* Preset prompt buttons */}
                <div>
                  <span className="text-sm font-medium text-muted-foreground mb-1.5 block">Quick Presets</span>
                  <div className="flex flex-wrap gap-1.5">
                    {PRESET_PROMPTS.map((preset) => (
                      <Button
                        key={preset.label}
                        variant="outline"
                        size="sm"
                        className="text-xs h-7"
                        onClick={() => setRefinementPrompt(preset.prompt)}
                      >
                        <Lightning size={12} className="mr-1" />
                        {preset.label}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Custom prompt input */}
                <div>
                  <span className="text-sm font-medium text-muted-foreground mb-1.5 block">
                    Refinement Instruction
                  </span>
                  <Textarea
                    placeholder="e.g., make this more concise, improve the hook, rewrite with a more professional tone..."
                    value={refinementPrompt}
                    onChange={(e) => setRefinementPrompt(e.target.value)}
                    rows={3}
                    className="resize-none"
                  />
                </div>

                {error && (
                  <Alert variant="destructive">
                    <Warning size={16} />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
              </>
            )}
          </div>
        )}

        {!result && (
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={handleRefine}
              disabled={refining || !refinementPrompt.trim()}
              className="gap-1.5 bg-violet-600 hover:bg-violet-700"
            >
              {refining ? (
                <>
                  <CircleNotch size={16} className="animate-spin" />
                  Refining…
                </>
              ) : (
                <>
                  <Sparkle size={16} weight="fill" />
                  Refine with GPT-5.3
                </>
              )}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
