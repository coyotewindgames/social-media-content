import { useEffect } from 'react'
import { useKV } from '@github/spark/hooks'
import {
  AutoDiscoverySettings,
  DEFAULT_AUTO_DISCOVERY_SETTINGS,
  shouldRunAutoDiscovery,
  calculateNextRunTime,
  fetchTrendingTopics,
  generateContentFromTopic,
} from '@/lib/auto-discovery'
import { ContentIdea } from '@/lib/types'

export function useAutoDiscovery(
  onNewContent?: (content: ContentIdea[]) => void
) {
  const [settings, setSettings] = useKV<AutoDiscoverySettings>(
    'auto-discovery-settings',
    DEFAULT_AUTO_DISCOVERY_SETTINGS
  )

  useEffect(() => {
    if (!settings) return

    const checkInterval = setInterval(
      async () => {
        if (shouldRunAutoDiscovery(settings)) {
          await runAutoDiscovery()
        }
      },
      5 * 60 * 1000
    )

    const immediateCheck = async () => {
      if (shouldRunAutoDiscovery(settings)) {
        await runAutoDiscovery()
      }
    }
    immediateCheck()

    return () => clearInterval(checkInterval)
  }, [settings?.enabled, settings?.nextRunAt])

  const runAutoDiscovery = async () => {
    if (!settings || !settings.enabled) return

    try {
      const topics = await fetchTrendingTopics(
        'today',
        settings.maxTopicsPerRun,
        settings.categories.length > 0 ? settings.categories : undefined
      )

      const newContents: ContentIdea[] = []

      if (settings.autoGenerate) {
        for (const topic of topics.slice(0, settings.maxTopicsPerRun)) {
          const contentData = await generateContentFromTopic(
            topic,
            settings.defaultPlatform,
            settings.defaultTone
          )

          const newContent: ContentIdea = {
            ...contentData,
            id: `content-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }

          newContents.push(newContent)
        }
      }

      const now = new Date()
      const nextRun = calculateNextRunTime(settings.frequency, now)

      setSettings((current) => ({
        ...current!,
        lastRunAt: now.toISOString(),
        nextRunAt: nextRun.toISOString(),
      }))

      if (onNewContent && newContents.length > 0) {
        onNewContent(newContents)
      }

      return { topics, contents: newContents }
    } catch (error) {
      console.error('Auto-discovery failed:', error)
      return { topics: [], contents: [] }
    }
  }

  const updateSettings = (updates: Partial<AutoDiscoverySettings>) => {
    setSettings((current) => {
      const updated = { ...current!, ...updates }

      if (updates.enabled && !current!.nextRunAt) {
        updated.nextRunAt = calculateNextRunTime(updated.frequency).toISOString()
      }

      if (updates.enabled === false) {
        updated.nextRunAt = undefined
      }

      return updated
    })
  }

  return {
    settings: settings || DEFAULT_AUTO_DISCOVERY_SETTINGS,
    updateSettings,
    runAutoDiscovery,
  }
}
