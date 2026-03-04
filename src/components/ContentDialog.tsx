import { useState } from 'react'
import { ContentIdea, Platform, CaptionTone } from '@/lib/types'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Sparkle, CalendarBlank, Image, X } from '@phosphor-icons/react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { generateImageFromContent } from '@/lib/image-generation'

interface ContentDialogProps {
  content: ContentIdea | null
  open: boolean
  onClose: () => void
  onSave: (content: ContentIdea) => void
  onGenerateCaption: (description: string, tone: CaptionTone) => Promise<string[]>
}

export function ContentDialog({
  content,
  open,
  onClose,
  onSave,
  onGenerateCaption,
}: ContentDialogProps) {
  const [formData, setFormData] = useState<ContentIdea>(
    content || {
      id: '',
      title: '',
      description: '',
      caption: '',
      platform: 'instagram' as Platform,
      status: 'draft',
      notes: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
  )
  const [selectedTone, setSelectedTone] = useState<CaptionTone>('casual')
  const [generating, setGenerating] = useState(false)
  const [generatingImage, setGeneratingImage] = useState(false)
  const [suggestions, setSuggestions] = useState<string[]>([])

  const handleGenerateCaption = async () => {
    if (!formData.description.trim()) {
      toast.error('Please add a description first')
      return
    }

    setGenerating(true)
    try {
      const generated = await onGenerateCaption(formData.description, selectedTone)
      setSuggestions(generated)
      toast.success('Captions generated!')
    } catch (error) {
      toast.error('Failed to generate captions')
    } finally {
      setGenerating(false)
    }
  }

  const handleGenerateImage = async () => {
    if (!formData.title.trim() || !formData.description.trim()) {
      toast.error('Please add a title and description first')
      return
    }

    setGeneratingImage(true)
    try {
      const result = await generateImageFromContent(
        formData.title,
        formData.description,
        formData.platform
      )

      if (result.success && result.imageUrl) {
        setFormData({
          ...formData,
          generatedImageUrl: result.imageUrl,
          imagePrompt: result.prompt,
        })
        toast.success('Image generated successfully!')
      } else {
        toast.error(result.error || 'Failed to generate image')
      }
    } catch (error) {
      toast.error('Failed to generate image')
    } finally {
      setGeneratingImage(false)
    }
  }

  const handleRemoveImage = () => {
    setFormData({
      ...formData,
      generatedImageUrl: undefined,
      imagePrompt: undefined,
    })
  }

  const handleSave = () => {
    if (!formData.title.trim()) {
      toast.error('Please add a title')
      return
    }
    if (!formData.description.trim()) {
      toast.error('Please add a description')
      return
    }

    onSave({
      ...formData,
      updatedAt: new Date().toISOString(),
    })
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl">
            {content ? 'Edit Content Idea' : 'New Content Idea'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              placeholder="Give your idea a name..."
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            />
          </div>

          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Describe your content idea..."
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="platform">Platform</Label>
              <Select
                value={formData.platform}
                onValueChange={(value) =>
                  setFormData({ ...formData, platform: value as Platform })
                }
              >
                <SelectTrigger id="platform">
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
            </div>

            <div>
              <Label htmlFor="scheduledDate">Scheduled Date (Optional)</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    id="scheduledDate"
                    variant="outline"
                    className="w-full justify-start text-left font-normal"
                  >
                    <CalendarBlank className="mr-2" size={16} />
                    {formData.scheduledDate
                      ? format(new Date(formData.scheduledDate), 'MMM dd, yyyy')
                      : 'Pick a date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={
                      formData.scheduledDate ? new Date(formData.scheduledDate) : undefined
                    }
                    onSelect={(date) =>
                      setFormData({
                        ...formData,
                        scheduledDate: date?.toISOString(),
                      })
                    }
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="border-t pt-4">
            <div className="flex items-center justify-between mb-3">
              <Label>AI Image Generator</Label>
              <Button
                onClick={handleGenerateImage}
                disabled={generatingImage}
                variant="outline"
                className="border-primary/50 text-primary hover:bg-primary/10"
              >
                <Image size={16} className="mr-2" weight="duotone" />
                {generatingImage ? 'Generating...' : 'Generate Image'}
              </Button>
            </div>

            {formData.generatedImageUrl && (
              <div className="relative group mb-3">
                <img
                  src={formData.generatedImageUrl}
                  alt="Generated content"
                  className="w-full h-auto rounded-lg border-2 border-primary/20"
                />
                <Button
                  onClick={handleRemoveImage}
                  size="icon"
                  variant="destructive"
                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X size={16} />
                </Button>
                {formData.imagePrompt && (
                  <p className="text-xs text-muted-foreground mt-2 italic">
                    Prompt: {formData.imagePrompt}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="border-t pt-4">
            <div className="flex items-center justify-between mb-3">
              <Label>AI Caption Generator</Label>
              <div className="flex items-center gap-2">
                <Select value={selectedTone} onValueChange={(v) => setSelectedTone(v as CaptionTone)}>
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
                <Button
                  onClick={handleGenerateCaption}
                  disabled={generating}
                  className="bg-gradient-to-r from-accent to-primary text-white"
                >
                  <Sparkle size={16} className="mr-2" weight="fill" />
                  {generating ? 'Generating...' : 'Generate'}
                </Button>
              </div>
            </div>

            {suggestions.length > 0 && (
              <div className="space-y-2 mb-3">
                {suggestions.map((suggestion, index) => (
                  <div
                    key={index}
                    className="p-3 bg-muted rounded-md cursor-pointer hover:bg-muted/80 transition-colors"
                    onClick={() => {
                      setFormData({ ...formData, caption: suggestion })
                      setSuggestions([])
                    }}
                  >
                    <p className="text-sm">{suggestion}</p>
                  </div>
                ))}
              </div>
            )}

            <Textarea
              id="caption"
              placeholder="Write or generate a caption..."
              value={formData.caption}
              onChange={(e) => setFormData({ ...formData, caption: e.target.value })}
              rows={4}
            />
            <p className="text-xs text-muted-foreground mt-1">
              {formData.caption.length} characters
            </p>
          </div>

          <div>
            <Label htmlFor="notes">Notes (Optional)</Label>
            <Textarea
              id="notes"
              placeholder="Add any additional notes..."
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} className="bg-primary text-primary-foreground">
            Save Content
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
