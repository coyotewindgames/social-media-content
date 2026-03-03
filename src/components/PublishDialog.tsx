import { useState, useEffect } from 'react'
import { useKV } from '@github/spark/hooks'
import { ContentIdea, SocialAccount } from '@/lib/types'
import { SocialMediaAPI, PostData } from '@/lib/social-api'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Progress } from '@/components/ui/progress'
import {
  PaperPlaneTilt,
  CheckCircle,
  Warning,
  ArrowSquareOut,
} from '@phosphor-icons/react'
import { toast } from 'sonner'

interface PublishDialogProps {
  content: ContentIdea | null
  open: boolean
  onClose: () => void
  onPublished: (contentId: string, postUrl: string) => void
}

export function PublishDialog({ content, open, onClose, onPublished }: PublishDialogProps) {
  const [accounts] = useKV<SocialAccount[]>('social-accounts', [])
  const [publishing, setPublishing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<{
    success: boolean
    postUrl?: string
    errorMessage?: string
  } | null>(null)

  const linkedAccount = accounts?.find(
    (acc) => acc.id === content?.linkedAccountId && acc.platform === content?.platform
  )

  const compatibleAccount = accounts?.find(
    (acc) => acc.platform === content?.platform && acc.status === 'connected'
  )

  const accountToUse = linkedAccount || compatibleAccount

  useEffect(() => {
    if (!open) {
      setResult(null)
      setProgress(0)
    }
  }, [open])

  const handlePublish = async () => {
    if (!content || !accountToUse) return

    setPublishing(true)
    setProgress(10)

    try {
      if (!SocialMediaAPI.validateAccount(accountToUse)) {
        throw new Error('Account token is expired. Please refresh your connection.')
      }

      setProgress(30)

      const postData: PostData = {
        caption: content.caption,
      }

      setProgress(60)

      const publishResult = content.scheduledDate && new Date(content.scheduledDate) > new Date()
        ? await SocialMediaAPI.schedulePost(
            content.platform,
            accountToUse,
            postData,
            new Date(content.scheduledDate)
          )
        : await SocialMediaAPI.postContent(content.platform, accountToUse, postData)

      setProgress(100)
      setResult(publishResult)

      if (publishResult.success && publishResult.postUrl) {
        onPublished(content.id, publishResult.postUrl)
        toast.success('Content published successfully!')
        setTimeout(() => onClose(), 2000)
      } else {
        toast.error(publishResult.errorMessage || 'Failed to publish content')
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to publish content'
      setResult({ success: false, errorMessage })
      toast.error(errorMessage)
    } finally {
      setPublishing(false)
    }
  }

  if (!content) return null

  const limits = SocialMediaAPI.getPlatformPostingLimits(content.platform)
  const captionTooLong = content.caption.length > limits.maxCaptionLength

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PaperPlaneTilt size={24} weight="duotone" className="text-primary" />
            Publish Content
          </DialogTitle>
          <DialogDescription>
            {content.scheduledDate && new Date(content.scheduledDate) > new Date()
              ? `Schedule post for ${new Date(content.scheduledDate).toLocaleString()}`
              : 'Publish this content immediately'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {accountToUse ? (
            <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
              <Avatar className="h-10 w-10">
                <AvatarImage src={accountToUse.profileImageUrl} />
                <AvatarFallback className="bg-primary text-primary-foreground">
                  {accountToUse.username.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="font-medium text-sm">
                  {accountToUse.displayName || accountToUse.username}
                </p>
                <p className="text-xs text-muted-foreground">@{accountToUse.username}</p>
              </div>
              <CheckCircle size={20} weight="fill" className="text-green-500 ml-auto" />
            </div>
          ) : (
            <Alert variant="destructive">
              <Warning size={18} />
              <AlertDescription>
                No connected {content.platform} account found. Please connect an account first.
              </AlertDescription>
            </Alert>
          )}

          <div className="p-4 bg-muted rounded-lg space-y-2">
            <h4 className="font-semibold text-sm">{content.title}</h4>
            <p className="text-sm text-muted-foreground line-clamp-2">{content.description}</p>
            <div className="pt-2 border-t border-border">
              <p className="text-sm">{content.caption}</p>
              <p className="text-xs text-muted-foreground mt-2">
                {content.caption.length} / {limits.maxCaptionLength} characters
              </p>
            </div>
          </div>

          {captionTooLong && (
            <Alert variant="destructive">
              <Warning size={18} />
              <AlertDescription>
                Caption exceeds the maximum length for {content.platform} ({limits.maxCaptionLength}{' '}
                characters)
              </AlertDescription>
            </Alert>
          )}

          {publishing && (
            <div className="space-y-2">
              <Progress value={progress} className="h-2" />
              <p className="text-sm text-center text-muted-foreground">Publishing...</p>
            </div>
          )}

          {result && (
            <Alert variant={result.success ? 'default' : 'destructive'}>
              {result.success ? <CheckCircle size={18} /> : <Warning size={18} />}
              <AlertDescription>
                {result.success ? (
                  <div className="flex items-center justify-between">
                    <span>Published successfully!</span>
                    {result.postUrl && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7"
                        onClick={() => window.open(result.postUrl, '_blank')}
                      >
                        <ArrowSquareOut size={14} className="mr-1" />
                        View Post
                      </Button>
                    )}
                  </div>
                ) : (
                  result.errorMessage || 'Failed to publish'
                )}
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={publishing}>
            {result?.success ? 'Close' : 'Cancel'}
          </Button>
          {!result?.success && (
            <Button
              onClick={handlePublish}
              disabled={!accountToUse || captionTooLong || publishing}
              className="bg-gradient-to-r from-accent to-primary text-white"
            >
              <PaperPlaneTilt size={16} className="mr-2" weight="fill" />
              {publishing
                ? 'Publishing...'
                : content.scheduledDate && new Date(content.scheduledDate) > new Date()
                ? 'Schedule Post'
                : 'Publish Now'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
