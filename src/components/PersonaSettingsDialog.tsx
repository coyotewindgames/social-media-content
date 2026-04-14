import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  CircleNotch,
  UserCircle,
  Megaphone,
  Brain,
  PencilSimple,
  Warning,
} from '@phosphor-icons/react'
import {
  getActivePersona,
  type PersonaProfile,
} from '@/lib/orchestrator-api'

interface PersonaSettingsDialogProps {
  open: boolean
  onClose: () => void
}

export function PersonaSettingsDialog({ open, onClose }: PersonaSettingsDialogProps) {
  const [persona, setPersona] = useState<PersonaProfile | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    getActivePersona()
      .then((p) => setPersona(p))
      .finally(() => setLoading(false))
  }, [open])

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCircle size={24} weight="duotone" />
            Persona — Allen Sharpe
          </DialogTitle>
          <DialogDescription>
            The hardcoded voice and personality behind all generated content.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <CircleNotch size={32} className="animate-spin text-muted-foreground" />
          </div>
        ) : !persona ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Could not load persona. Make sure the backend is running.
          </p>
        ) : (
          <div className="space-y-5 py-2">
            {/* Name */}
            <div className="flex items-center gap-3">
              <h3 className="text-lg font-semibold">{persona.name}</h3>
              <Badge className="bg-green-500/10 text-green-600 border-green-500/20">Active</Badge>
            </div>

            <Separator />

            {/* Voice */}
            <section className="space-y-2">
              <h4 className="text-sm font-medium flex items-center gap-1.5">
                <Megaphone size={16} weight="duotone" /> Voice
              </h4>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Tone:</span>{' '}
                  {persona.voice.tone}
                </div>
                <div>
                  <span className="text-muted-foreground">Vocabulary:</span>{' '}
                  {persona.voice.vocabulary_level}
                </div>
                <div className="col-span-2">
                  <span className="text-muted-foreground">Sentence style:</span>{' '}
                  {persona.voice.sentence_style}
                </div>
                <div className="col-span-2">
                  <span className="text-muted-foreground">Humor:</span>{' '}
                  {persona.voice.humor_style}
                </div>
              </div>
              {persona.voice.rhetorical_devices.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {persona.voice.rhetorical_devices.map((d) => (
                    <Badge key={d} variant="outline" className="text-xs">{d}</Badge>
                  ))}
                </div>
              )}
            </section>

            <Separator />

            {/* Beliefs */}
            <section className="space-y-2">
              <h4 className="text-sm font-medium flex items-center gap-1.5">
                <Brain size={16} weight="duotone" /> Beliefs
              </h4>
              <p className="text-sm">{persona.beliefs.worldview}</p>
              <p className="text-sm text-muted-foreground">{persona.beliefs.policy_leanings}</p>
              <div className="flex flex-wrap gap-1.5">
                {persona.beliefs.core_values.map((v) => (
                  <Badge key={v} variant="secondary" className="text-xs">{v}</Badge>
                ))}
              </div>
              {persona.beliefs.red_lines.length > 0 && (
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">Red lines:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {persona.beliefs.red_lines.map((r) => (
                      <Badge key={r} variant="outline" className="text-xs text-red-500 border-red-500/30">{r}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </section>

            <Separator />

            {/* Style Rules */}
            <section className="space-y-2">
              <h4 className="text-sm font-medium flex items-center gap-1.5">
                <PencilSimple size={16} weight="duotone" /> Style Rules
              </h4>
              <div className="text-sm space-y-1">
                <div><span className="text-muted-foreground">Emoji:</span> {persona.styleRules.emoji_usage}</div>
                <div><span className="text-muted-foreground">Hashtags:</span> {persona.styleRules.hashtag_style}</div>
              </div>
              {persona.styleRules.signature_phrases.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {persona.styleRules.signature_phrases.map((p) => (
                    <Badge key={p} variant="outline" className="text-xs italic">"{p}"</Badge>
                  ))}
                </div>
              )}
            </section>

            {/* Taboos */}
            {persona.taboos.length > 0 && (
              <>
                <Separator />
                <section className="space-y-2">
                  <h4 className="text-sm font-medium flex items-center gap-1.5">
                    <Warning size={16} weight="duotone" className="text-amber-500" /> Taboos
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {persona.taboos.map((t) => (
                      <Badge key={t} variant="outline" className="text-xs text-amber-600 border-amber-500/30">{t}</Badge>
                    ))}
                  </div>
                </section>
              </>
            )}

            {/* Example Posts */}
            {persona.examplePosts.length > 0 && (
              <>
                <Separator />
                <section className="space-y-2">
                  <h4 className="text-sm font-medium">Example Posts</h4>
                  <div className="space-y-2">
                    {persona.examplePosts.map((post, i) => (
                      <div key={i} className="rounded-lg border bg-muted/50 p-3 text-sm whitespace-pre-wrap">
                        {post}
                      </div>
                    ))}
                  </div>
                </section>
              </>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
