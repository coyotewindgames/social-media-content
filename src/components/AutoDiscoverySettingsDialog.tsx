import { useState, useEffect } from 'react'
import { Platform, CaptionTone } from '@/lib/types'
import { AutoDiscoverySettings } from '@/lib/auto-discovery'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Clock, Gear, Check, X } from '@phosphor-icons/react'

interface AutoDiscoverySettingsDialogProps {
  open: boolean
  onClose: () => void
  settings: AutoDiscoverySettings
  onSave: (settings: Partial<AutoDiscoverySettings>) => void
}

const CATEGORY_OPTIONS = [
  'Technology',
  'Entertainment',
  'Sports',
  'Politics',
  'Lifestyle',
  'Health',
  'Business',
  'Culture',
]

export function AutoDiscoverySettingsDialog({
  open,
  onClose,
  settings,
  onSave,
}: AutoDiscoverySettingsDialogProps) {
  const [localSettings, setLocalSettings] = useState<AutoDiscoverySettings>(settings)

  useEffect(() => {
    setLocalSettings(settings)
  }, [settings])

  const handleSave = () => {
    onSave(localSettings)
    onClose()
  }

  const toggleCategory = (category: string) => {
    setLocalSettings((prev) => {
      const categories = prev.categories.includes(category)
        ? prev.categories.filter((c) => c !== category)
        : [...prev.categories, category]
      return { ...prev, categories }
    })
  }

  const formatNextRun = (isoString?: string) => {
    if (!isoString) return 'Not scheduled'
    const date = new Date(isoString)
    const now = new Date()
    const diffMs = date.getTime() - now.getTime()
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))

    if (diffMs < 0) return 'Ready to run'
    if (diffHours < 1) return `in ${diffMins} minutes`
    if (diffHours < 24) return `in ${diffHours} hours`
    return date.toLocaleString()
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-2xl">
            <Gear size={28} weight="duotone" className="text-primary" />
            Auto-Discovery Settings
          </DialogTitle>
          <DialogDescription>
            Automatically discover trending topics and generate content ideas on a schedule
          </DialogDescription>
        </DialogHeader>

        <Separator className="my-4" />

        <div className="flex-1 overflow-y-auto space-y-6 pr-2">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label htmlFor="auto-discovery-enabled" className="text-base font-medium">
                Enable Auto-Discovery
              </Label>
              <p className="text-sm text-muted-foreground">
                Automatically check for trending topics on a schedule
              </p>
            </div>
            <Switch
              id="auto-discovery-enabled"
              checked={localSettings.enabled}
              onCheckedChange={(enabled) =>
                setLocalSettings((prev) => ({ ...prev, enabled }))
              }
            />
          </div>

          {localSettings.enabled && (
            <>
              <Separator />

              <div className="space-y-3">
                <Label className="text-base font-medium">Schedule Frequency</Label>
                <Select
                  value={localSettings.frequency}
                  onValueChange={(value) =>
                    setLocalSettings((prev) => ({
                      ...prev,
                      frequency: value as 'daily' | 'weekly',
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily (9:00 AM)</SelectItem>
                    <SelectItem value="weekly">Weekly (Monday 9:00 AM)</SelectItem>
                  </SelectContent>
                </Select>
                {settings.nextRunAt && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock size={16} />
                    <span>Next run: {formatNextRun(settings.nextRunAt)}</span>
                  </div>
                )}
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label htmlFor="auto-generate" className="text-base font-medium">
                    Auto-Generate Content
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Automatically create content ideas from discovered trends
                  </p>
                </div>
                <Switch
                  id="auto-generate"
                  checked={localSettings.autoGenerate}
                  onCheckedChange={(autoGenerate) =>
                    setLocalSettings((prev) => ({ ...prev, autoGenerate }))
                  }
                />
              </div>

              {localSettings.autoGenerate && (
                <>
                  <div className="space-y-3">
                    <Label className="text-base font-medium">Max Topics Per Run</Label>
                    <Select
                      value={localSettings.maxTopicsPerRun.toString()}
                      onValueChange={(value) =>
                        setLocalSettings((prev) => ({
                          ...prev,
                          maxTopicsPerRun: parseInt(value),
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="3">3 topics</SelectItem>
                        <SelectItem value="5">5 topics</SelectItem>
                        <SelectItem value="8">8 topics</SelectItem>
                        <SelectItem value="10">10 topics</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-3">
                      <Label className="text-base font-medium">Default Platform</Label>
                      <Select
                        value={localSettings.defaultPlatform}
                        onValueChange={(value) =>
                          setLocalSettings((prev) => ({
                            ...prev,
                            defaultPlatform: value as Platform,
                          }))
                        }
                      >
                        <SelectTrigger>
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

                    <div className="space-y-3">
                      <Label className="text-base font-medium">Default Tone</Label>
                      <Select
                        value={localSettings.defaultTone}
                        onValueChange={(value) =>
                          setLocalSettings((prev) => ({
                            ...prev,
                            defaultTone: value as CaptionTone,
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="casual">Casual</SelectItem>
                          <SelectItem value="professional">Professional</SelectItem>
                          <SelectItem value="playful">Playful</SelectItem>
                          <SelectItem value="inspirational">Inspirational</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </>
              )}

              <Separator />

              <div className="space-y-3">
                <Label className="text-base font-medium">Preferred Categories</Label>
                <p className="text-sm text-muted-foreground mb-3">
                  Select categories to focus on. Leave empty for all categories.
                </p>
                <div className="flex flex-wrap gap-2">
                  {CATEGORY_OPTIONS.map((category) => {
                    const isSelected = localSettings.categories.includes(category)
                    return (
                      <Badge
                        key={category}
                        variant={isSelected ? 'default' : 'outline'}
                        className={`cursor-pointer px-3 py-1.5 transition-all ${
                          isSelected
                            ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                            : 'hover:bg-secondary'
                        }`}
                        onClick={() => toggleCategory(category)}
                      >
                        {category}
                        {isSelected && <Check size={14} className="ml-1" weight="bold" />}
                      </Badge>
                    )
                  })}
                </div>
              </div>
            </>
          )}
        </div>

        <Separator className="my-4" />

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>
            <X size={18} className="mr-2" />
            Cancel
          </Button>
          <Button onClick={handleSave} className="bg-primary text-primary-foreground">
            <Check size={18} weight="bold" className="mr-2" />
            Save Settings
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
