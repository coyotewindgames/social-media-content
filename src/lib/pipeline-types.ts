/**
 * Types for pipeline events and real-time status updates.
 * These types are used by the frontend components to display
 * pipeline status, progress, and content previews.
 */

// Pipeline stage states
export type PipelineStage = 'queued' | 'running' | 'completed' | 'failed';

// Content type for preview rendering
export type ContentType = 'text' | 'image' | 'audio' | 'video' | 'json' | 'markdown' | 'html';

/**
 * Represents a single pipeline event received from the backend.
 */
export interface PipelineEvent {
  jobId: string;
  stage: PipelineStage;
  timestamp: string;
  progress?: number;
  error?: string;
  agentName?: string;
  message?: string;
}

/**
 * State object returned by the usePipelineEvents hook.
 */
export interface PipelineEventState {
  status: PipelineStage;
  progress: number;
  error?: string;
  events: PipelineEvent[];
  isConnected: boolean;
  currentAgent?: string;
}

/**
 * Content preview data structure for different content types.
 */
export interface ContentPreview {
  id: string;
  type: ContentType;
  content: string;
  url?: string;
  mimeType?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  jobId?: string;
}

/**
 * State object returned by the useContentPreview hook.
 */
export interface ContentPreviewState {
  preview: ContentPreview | null;
  isLoading: boolean;
  error?: string;
  refetch: () => Promise<void>;
}

/**
 * Pipeline run history item for the GenerationHistoryList component.
 */
export interface PipelineHistoryItem {
  id: string;
  pipelineId: string;
  status: PipelineStage;
  startedAt: string;
  completedAt?: string;
  newsItemsCount: number;
  postsCount: number;
  imageSetsCount: number;
  publishResultsCount: number;
  errors: string[];
  dryRun: boolean;
}

/**
 * SSE connection options for the usePipelineEvents hook.
 */
export interface SSEConnectionOptions {
  baseUrl?: string;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Error) => void;
}

/**
 * Default SSE connection options.
 */
export const DEFAULT_SSE_OPTIONS: SSEConnectionOptions = {
  baseUrl: '/api/pipeline',
  reconnectInterval: 3000,
  maxReconnectAttempts: 10,
};

/**
 * Status colors for different pipeline stages.
 */
export const STAGE_COLORS: Record<PipelineStage, string> = {
  queued: 'bg-yellow-500',
  running: 'bg-blue-500',
  completed: 'bg-green-500',
  failed: 'bg-red-500',
};

/**
 * Status labels for different pipeline stages.
 */
export const STAGE_LABELS: Record<PipelineStage, string> = {
  queued: 'Queued',
  running: 'Running',
  completed: 'Completed',
  failed: 'Failed',
};

/**
 * Helper to determine content type from MIME type.
 */
export function getContentTypeFromMime(mimeType: string): ContentType {
  // Normalize by splitting on ';' to handle parameters like charset
  const baseMimeType = mimeType.split(';', 1)[0].trim();

  if (baseMimeType.startsWith('image/')) return 'image';
  if (baseMimeType.startsWith('audio/')) return 'audio';
  if (baseMimeType.startsWith('video/')) return 'video';
  if (baseMimeType === 'application/json') return 'json';
  if (baseMimeType === 'text/markdown') return 'markdown';
  if (baseMimeType === 'text/html') return 'html';
  return 'text';
}

/**
 * Helper to determine content type from file extension.
 */
export function getContentTypeFromExtension(filename: string): ContentType {
  const ext = filename.split('.').pop()?.toLowerCase();
  
  const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'];
  const audioExts = ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'];
  const videoExts = ['mp4', 'webm', 'mov', 'avi', 'mkv'];
  
  if (ext && imageExts.includes(ext)) return 'image';
  if (ext && audioExts.includes(ext)) return 'audio';
  if (ext && videoExts.includes(ext)) return 'video';
  if (ext === 'json') return 'json';
  if (ext === 'md' || ext === 'markdown') return 'markdown';
  if (ext === 'html' || ext === 'htm') return 'html';
  
  return 'text';
}
