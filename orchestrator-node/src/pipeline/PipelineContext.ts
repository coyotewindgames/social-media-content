/**
 * PipelineContext — shared mutable state threaded through all pipeline steps.
 *
 * Each step reads from and writes to this context. The PipelineEngine persists
 * it to Supabase after each step completes.
 */

import { v4 as uuidv4 } from 'uuid';
import {
  NewsItem,
  SocialPost,
  ImageSet,
  PublishResult,
  AgentStatus,
  PersonaProfile,
  PostHistoryEntry,
  Platform,
  Tone,
} from '../models';

export interface RunOptions {
  keywords?: string[];
  platforms?: Platform[];
  tone?: Tone;
  dryRun?: boolean;
  requireApproval?: boolean;
  postsPerItem?: number;
  imagesPerPost?: number;
  enableAutoRefinement?: boolean;
  autoRefinementPrompt?: string;
}

export interface PipelineResult {
  pipelineId: string;
  newsItems: NewsItem[];
  posts: SocialPost[];
  imageSets: ImageSet[];
  publishResults: PublishResult[];
  errors: string[];
}

export interface PipelineContext {
  pipelineId: string;
  startedAt: Date;
  completedAt?: Date;
  options: RunOptions;

  // Persona
  persona?: PersonaProfile;
  recentPosts?: PostHistoryEntry[];

  // Pipeline data (populated by successive steps)
  newsItems: NewsItem[];
  posts: SocialPost[];
  imageSets: ImageSet[];
  publishResults: PublishResult[];

  // Status tracking
  currentAgent?: string;
  agentStatuses: Record<string, AgentStatus>;
  errorLog: string[];
  dryRun: boolean;
}

/** Create a fresh PipelineContext from RunOptions. */
export function createPipelineContext(options: RunOptions, dryRun: boolean): PipelineContext {
  return {
    pipelineId: uuidv4(),
    startedAt: new Date(),
    options,
    newsItems: [],
    posts: [],
    imageSets: [],
    publishResults: [],
    agentStatuses: {},
    errorLog: [],
    dryRun,
  };
}

/** Convert a PipelineContext into the API-facing PipelineResult. */
export function contextToResult(ctx: PipelineContext): PipelineResult {
  return {
    pipelineId: ctx.pipelineId,
    newsItems: ctx.newsItems,
    posts: ctx.posts,
    imageSets: ctx.imageSets,
    publishResults: ctx.publishResults,
    errors: ctx.errorLog,
  };
}
