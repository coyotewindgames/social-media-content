/**
 * Frontend API client for the orchestrator backend.
 * 
 * In development, calls go through the Vite proxy at /api → localhost:3001.
 * In production, set VITE_API_URL to the backend's public URL (e.g., https://api.example.com).
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

export interface CarouselSlide {
  slideNumber: number
  text: string
  imagePrompt: string
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
  generatedBy?: string
  carouselSlides?: CarouselSlide[]
  refinedContent?: string
  refinementNotes?: string
  refinementPrompt?: string
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

export interface PartialResults {
  newsCount: number
  postCount: number
  imageCount: number
  publishCount: number
  newsTopics: string[]
  postPreviews: { platform: string; content: string; generatedBy?: string }[]
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
  partialResults?: PartialResults
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

/**
 * Base URL for the backend API.
 * - In development: Uses Vite proxy at /api
 * - In production: Set VITE_API_URL to the backend's public URL
 *
 * Example: VITE_API_URL=https://your-backend.railway.app/api
 */
const BASE = import.meta.env.VITE_API_URL || '/api'

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

// ─── Persona types ───────────────────────────────────────────────────────────

export interface PersonaVoice {
  tone: string
  vocabulary_level: string
  sentence_style: string
  rhetorical_devices: string[]
  humor_style: string
}

export interface PersonaBeliefs {
  core_values: string[]
  worldview: string
  policy_leanings: string
  red_lines: string[]
}

export interface PersonaStyleRules {
  emoji_usage: string
  hashtag_style: string
  cta_patterns: string[]
  signature_phrases: string[]
  opening_patterns: string[]
}

export interface PersonaProfile {
  id: string
  name: string
  isActive: boolean
  voice: PersonaVoice
  beliefs: PersonaBeliefs
  styleRules: PersonaStyleRules
  taboos: string[]
  examplePosts: string[]
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

// ─── Persona API (hardcoded Allen Sharpe — read-only) ────────────────────────

export async function getActivePersona(): Promise<PersonaProfile | null> {
  try {
    return await apiFetch<PersonaProfile>('/persona')
  } catch {
    return null
  }
}

// ─── Instagram publish ───────────────────────────────────────────────────────

export async function publishToInstagram(caption: string, imageUrl: string): Promise<{ success: boolean; mediaId: string; postUrl: string }> {
  return apiFetch<{ success: boolean; mediaId: string; postUrl: string }>('/publish/instagram', {
    method: 'POST',
    body: JSON.stringify({ caption, imageUrl }),
  })
}

// ─── Content refinement (GPT-5.3) ───────────────────────────────────────────

export async function refinePostContent(
  pipelineId: string,
  postId: string,
  refinementPrompt: string,
): Promise<{ success: boolean; refinedContent: string; notes: string }> {
  return apiFetch<{ success: boolean; refinedContent: string; notes: string }>('/refine', {
    method: 'POST',
    body: JSON.stringify({ pipelineId, postId, refinementPrompt }),
  })
}
