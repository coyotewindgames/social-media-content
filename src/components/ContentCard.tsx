import { ContentIdea, Platform } from '@/lib/types'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PencilSimple, Trash, Copy, PaperPlaneTilt } from '@phosphor-icons/react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'

interface ContentCardProps {
  content: ContentIdea
  onEdit: (content: ContentIdea) => void
  onDelete: (id: string) => void
  onPublish?: (content: ContentIdea) => void
}

const platformColors: Record<Platform, string> = {
  instagram: 'bg-gradient-to-br from-purple-500 to-pink-500 text-white',
  tiktok: 'bg-black text-white',
  facebook: 'bg-blue-600 text-white',
  twitter: 'bg-sky-500 text-white',
  youtube: 'bg-red-600 text-white',
}

export function ContentCard({ content, onEdit, onDelete, onPublish }: ContentCardProps) {
  const handleCopyCaption = () => {
    navigator.clipboard.writeText(content.caption)
    toast.success('Caption copied to clipboard!')
  }

  const statusColors = {
    draft: 'bg-gray-500',
    scheduled: 'bg-blue-500',
    published: 'bg-green-500',
    failed: 'bg-red-500',
    idea: 'bg-yellow-500',
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      whileHover={{ y: -4, scale: 1.01 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
    >
      <Card className="h-full overflow-hidden border-2 hover:border-primary/50 transition-colors cursor-pointer group">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-lg truncate mb-1">{content.title}</h3>
              <div className="flex items-center gap-2">
                <Badge className={`${platformColors[content.platform]} text-xs`}>
                  {content.platform}
                </Badge>
                <Badge variant="outline" className="text-xs">
                  <div className={`w-2 h-2 rounded-full ${statusColors[content.status]} mr-1`} />
                  {content.status}
                </Badge>
              </div>
            </div>
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {onPublish && content.status !== 'published' && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-accent"
                  onClick={(e) => {
                    e.stopPropagation()
                    onPublish(content)
                  }}
                >
                  <PaperPlaneTilt size={16} weight="fill" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={(e) => {
                  e.stopPropagation()
                  onEdit(content)
                }}
              >
                <PencilSimple size={16} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive"
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete(content.id)
                }}
              >
                <Trash size={16} />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pb-4" onClick={() => onEdit(content)}>
          {content.generatedImageUrl && (
            <div className="mb-3 rounded-md overflow-hidden border-2 border-primary/20">
              <img
                src={content.generatedImageUrl}
                alt={content.title}
                className="w-full h-48 object-cover"
              />
            </div>
          )}
          <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
            {content.description}
          </p>
          {content.caption && (
            <div className="bg-muted rounded-md p-3 space-y-2">
              <p className="text-sm line-clamp-3">{content.caption}</p>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={(e) => {
                  e.stopPropagation()
                  handleCopyCaption()
                }}
              >
                <Copy size={14} className="mr-1" />
                Copy Caption
              </Button>
            </div>
          )}
          {content.scheduledDate && (
            <p className="text-xs text-muted-foreground mt-3">
              📅 {new Date(content.scheduledDate).toLocaleDateString()}
            </p>
          )}
          {content.publishedUrl && (
            <p className="text-xs text-green-600 mt-2 flex items-center">
              ✓ Published
            </p>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}
