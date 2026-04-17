/**
 * AnalyticsRepository — all Supabase operations for the analytics table.
 *
 * Gracefully no-ops when Supabase is not configured.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import { PublishResult, PublishStatus } from '../models';
import { getLogger } from '../utils';

const logger = getLogger('analytics-repository');

export class AnalyticsRepository {
  constructor(
    private supabase: SupabaseClient | null,
    private dbEnabled: boolean,
  ) {}

  /** Track analytics for successfully published posts. */
  async trackPublish(results: PublishResult[]): Promise<void> {
    if (!this.supabase || !this.dbEnabled) return;

    for (const result of results) {
      if (result.status === PublishStatus.PUBLISHED) {
        try {
          await this.supabase.from('analytics').insert({
            id: uuidv4(),
            post_id: result.postId,
            platform: result.platform,
            post_url: result.postUrl ?? null,
            published_at: result.publishedAt?.toISOString() ?? new Date().toISOString(),
            impressions: {},
            engagement: {},
            last_updated: new Date().toISOString(),
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          logger.warn(`Failed to track analytics for ${result.postId}: ${msg}`);
        }
      }
    }
  }
}
