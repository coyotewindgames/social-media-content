import { ContentIdea } from '@/lib/types'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { InstagramLogo, Sparkle, CalendarPlus, Copy, ArrowsClockwise } from '@phosphor-icons/react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'

interface DailyContentCardProps {
  content: ContentIdea
  onInstagramUpload: (content: ContentIdea) => void
  onSchedule?: (content: ContentIdea) => void
  onRegenerate?: (content: ContentIdea) => void
  index: number
}

export function DailyContentCard({ 
  content, 
  onInstagramUpload, 
  onSchedule,
  onRegenerate,
  index 
}: DailyContentCardProps) {
  const handleCopyCaption = (e: React.MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard.writeText(content.caption)
    toast.success('Caption copied to clipboard!')
  }

  const imageUrl = content.imageDataUrl || content.generatedImageUrl
  const isPublished = content.status === 'published'

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
      whileHover={{ y: -4 }}
    >
      <Card className="h-full overflow-hidden border-2 border-accent/30 hover:border-accent transition-all duration-300 bg-gradient-to-br from-card to-accent/5">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <Sparkle size={20} weight="duotone" className="text-accent" />
                <Badge className="bg-gradient-to-r from-accent to-primary text-white text-xs border-0">
                  AI Generated Today
                </Badge>
              </div>
              <h3 className="font-bold text-xl mb-1 leading-tight">{content.title}</h3>
            </div>
            {onRegenerate && !isPublished && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-accent"
                onClick={(e) => {
                  e.stopPropagation()
                  onRegenerate(content)
                }}
              >
                <ArrowsClockwise size={18} />
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {imageUrl && (
            <div className="relative rounded-lg overflow-hidden border-2 border-accent/20 shadow-lg">
              <img
                src={imageUrl}
                alt={content.title}
                className="w-full aspect-square object-cover"
              />
              <div className="absolute top-3 right-3">
                <Badge className="bg-black/70 text-white backdrop-blur-sm border-0 text-xs">
                  AI Image
                </Badge>
              </div>
              {isPublished && (
                <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center">
                  <div className="bg-green-500 text-white px-4 py-2 rounded-full font-semibold flex items-center gap-2">
                    <InstagramLogo size={20} weight="fill" />
                    Published to Instagram
                  </div>
                </div>
              )}
            </div>
          )}

          <div>
            <p className="text-sm text-muted-foreground mb-3 leading-relaxed">
              {content.description}
            </p>
          </div>

          {content.caption && (
            <div className="bg-muted/50 rounded-lg p-4 space-y-3 border border-border/50">
              <p className="text-sm leading-relaxed whitespace-pre-wrap">
                {content.caption}
              </p>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs w-full"
                onClick={handleCopyCaption}
              >
                <Copy size={14} className="mr-2" />
                Copy Caption
              </Button>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            {!isPublished && imageUrl && (
              <Button
                variant="default"
                className="flex-1 bg-gradient-to-br from-purple-500 via-pink-500 to-orange-500 hover:from-purple-600 hover:via-pink-600 hover:to-orange-600 text-white border-0 shadow-lg"
                onClick={(e) => {
                  e.stopPropagation()
                  onInstagramUpload(content)
                }}
              >
                <InstagramLogo size={18} weight="fill" className="mr-2" />
                Upload to Instagram
              </Button>
            )}
            
            {!isPublished && onSchedule && (
              <Button
                variant="outline"
                size="icon"
                className="border-primary/50 text-primary hover:bg-primary/10"
                onClick={(e) => {
                  e.stopPropagation()
                  onSchedule(content)
                }}
              >
                <CalendarPlus size={18} weight="duotone" />
              </Button>
            )}
          </div>

          {isPublished && content.publishedAt && (
            <div className="text-xs text-green-600 flex items-center gap-1 pt-1">
              ✓ Published {new Date(content.publishedAt).toLocaleString()}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}
