/**
 * PipelineRepository — all Supabase operations for pipeline_runs.
 *
 * Gracefully no-ops when Supabase is not configured.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import {
  PipelineState,
  NewsItem,
  SocialPost,
  ImageSet,
  PublishResult,
  AgentStatus,
} from '../models';
import { PipelineContext } from '../pipeline/PipelineContext';
import { getLogger } from '../utils';

const logger = getLogger('pipeline-repository');

interface PipelineRunRow {
  id: string;
  started_at: string;
  completed_at: string | null;
  status: string;
  dry_run: boolean;
  news_items: unknown;
  posts: unknown;
  image_sets: unknown;
  publish_results: unknown;
  error_log: unknown;
  agent_statuses: unknown;
}

export class PipelineRepository {
  constructor(
    private supabase: SupabaseClient | null,
    private dbEnabled: boolean,
  ) {}

  /** Persist the current pipeline state as 'running'. */
  async savePipelineState(ctx: PipelineContext): Promise<void> {
    if (!this.supabase || !this.dbEnabled) return;

    await this.supabase.from('pipeline_runs').upsert({
      id: ctx.pipelineId,
      started_at: ctx.startedAt.toISOString(),
      completed_at: ctx.completedAt?.toISOString() ?? null,
      status: 'running',
      dry_run: ctx.dryRun,
      news_items: ctx.newsItems,
      posts: ctx.posts,
      image_sets: ctx.imageSets,
      publish_results: ctx.publishResults,
      error_log: ctx.errorLog,
      agent_statuses: ctx.agentStatuses,
    });
  }

  /** Mark the pipeline as completed (or failed) and persist final state. */
  async completePipeline(ctx: PipelineContext, status: string): Promise<void> {
    if (!this.supabase || !this.dbEnabled) return;

    await this.supabase.from('pipeline_runs').upsert({
      id: ctx.pipelineId,
      started_at: ctx.startedAt.toISOString(),
      completed_at: ctx.completedAt?.toISOString() ?? new Date().toISOString(),
      status,
      dry_run: ctx.dryRun,
      news_items: ctx.newsItems,
      posts: ctx.posts,
      image_sets: ctx.imageSets,
      publish_results: ctx.publishResults,
      error_log: ctx.errorLog,
      agent_statuses: ctx.agentStatuses,
    });
  }

  /** Fetch a single pipeline run by ID. */
  async getPipelineRun(id: string): Promise<PipelineState | null> {
    if (!this.supabase || !this.dbEnabled) return null;

    const { data, error } = await this.supabase
      .from('pipeline_runs')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) return null;

    return this.rowToState(data as PipelineRunRow);
  }

  /** Fetch recent pipeline run history. */
  async getHistory(limit = 10): Promise<PipelineState[]> {
    if (!this.supabase || !this.dbEnabled) {
      logger.warn('Supabase not configured. Cannot fetch history.');
      return [];
    }

    const { data, error } = await this.supabase
      .from('pipeline_runs')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(limit);

    if (error) {
      logger.error(`Failed to fetch history: ${error.message}`);
      return [];
    }

    return (data as PipelineRunRow[]).map((row) => this.rowToState(row));
  }

  private rowToState(row: PipelineRunRow): PipelineState {
    return {
      pipelineId: row.id,
      startedAt: new Date(row.started_at),
      completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
      newsItems: row.news_items as NewsItem[],
      posts: row.posts as SocialPost[],
      imageSets: row.image_sets as ImageSet[],
      publishResults: row.publish_results as PublishResult[],
      currentAgent: undefined,
      agentStatuses: row.agent_statuses as Record<string, AgentStatus>,
      errorLog: row.error_log as string[],
      dryRun: row.dry_run,
    };
  }
}
