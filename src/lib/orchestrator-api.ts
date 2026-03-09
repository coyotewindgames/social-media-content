/**
 * Frontend API client for the orchestrator backend.
 * All calls go through the Vite proxy at /api → localhost:3001.
 */

// ─── Shared types mirroring the backend models ──────────────────────────────

export type OrchestratorPlatform = 'twitter' | 'linkedin' | 'instagram' | 'facebook' | 'tiktok'
export type OrchestratorTone = 'casual' | 'professional' | 'playful' | 'inspirational' | 'informative'

export interface NewsItem {
  topic: string
  source: string
  url: string
  summary: string
  keywords: string[]
  timestamp: string
  relevanceScore: number
}

export interface SocialPost {
  postId: string
  content: string
  platform: OrchestratorPlatform
  hashtags: string[]
  imagePrompt?: string
  tone: OrchestratorTone
  callToAction?: string
  characterCount: number
  newsSource?: string
  createdAt: string
}

export interface GeneratedImage {
  url: string
  format: string
  dimensions: { width: number; height: number }
  altText?: string
}

export interface ImageSet {
  postId: string
  images: GeneratedImage[]
  createdAt: string
}

export interface PublishResult {
  postId: string
  platform: OrchestratorPlatform
  status: 'queued' | 'published' | 'failed' | 'pending_review' | 'scheduled'
  postUrl?: string
  errorMessage?: string
  retryCount: number
  publishedAt?: string
}

export interface PipelineResult {
  pipelineId: string
  newsItems: NewsItem[]
  posts: SocialPost[]
  imageSets: ImageSet[]
  publishResults: PublishResult[]
  errors: string[]
}

export interface RunSummary {
  id: string
  status: 'running' | 'completed' | 'failed'
  startedAt: string
  completedAt?: string
  errors: string[]
  postCount: number
  newsCount: number
  publishCount: number
  dryRun?: boolean
  agentStatuses?: Record<string, string>
}

export interface ConfigStatus {
  llm: { openai: boolean; anthropic: boolean; ollama: boolean }
  platforms: {
    twitter: boolean
    instagram: boolean
    linkedin: boolean
    facebook: boolean
  }
  services: { supabase: boolean; newsapi: boolean }
  settings: {
    maxPostsPerRun: number
    enabledPlatforms: string[]
    defaultTone: string
  }
}

export interface RunPipelineOptions {
  keywords?: string[]
  platforms?: OrchestratorPlatform[]
  tone?: OrchestratorTone
  dryRun?: boolean
}

// ─── API helpers ─────────────────────────────────────────────────────────────

const BASE = '/api'

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`API ${res.status}: ${body}`)
  }
  return res.json() as Promise<T>
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function checkHealth(): Promise<boolean> {
  try {
    await apiFetch('/health')
    return true
  } catch {
    return false
  }
}

export async function getConfigStatus(): Promise<ConfigStatus> {
  return apiFetch<ConfigStatus>('/config/status')
}

export async function triggerPipelineRun(options: RunPipelineOptions = {}): Promise<{ runId: string }> {
  return apiFetch<{ runId: string }>('/pipeline/run', {
    method: 'POST',
    body: JSON.stringify(options),
  })
}

export async function getPipelineStatus(runId: string): Promise<RunSummary> {
  return apiFetch<RunSummary>(`/pipeline/status/${encodeURIComponent(runId)}`)
}

export async function getPipelineResult(runId: string): Promise<PipelineResult> {
  return apiFetch<PipelineResult>(`/pipeline/result/${encodeURIComponent(runId)}`)
}

export async function listPipelineRuns(limit = 50): Promise<RunSummary[]> {
  return apiFetch<RunSummary[]>(`/pipeline/runs?limit=${limit}`)
}

export async function getPipelineHistory(): Promise<unknown[]> {
  return apiFetch<unknown[]>('/pipeline/history')
}
