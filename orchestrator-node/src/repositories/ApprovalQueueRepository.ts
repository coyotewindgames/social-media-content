/**
 * ApprovalQueueRepository — all Supabase operations for the approval_queue table.
 *
 * Gracefully no-ops when Supabase is not configured.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import { SocialPost, ImageSet, ContentApproval } from '../models';
import { getLogger } from '../utils';

const logger = getLogger('approval-queue-repository');

interface ApprovalQueueRow {
  id: string;
  post_id: string;
  post_data: unknown;
  images_data: unknown | null;
  status: string;
  reviewer_notes: string | null;
  submitted_at: string;
  reviewed_at: string | null;
}

export class ApprovalQueueRepository {
  constructor(
    private supabase: SupabaseClient | null,
    private dbEnabled: boolean,
  ) {}

  /** Enqueue a post (with optional images) for human approval. */
  async enqueue(post: SocialPost, images?: ImageSet): Promise<void> {
    if (!this.supabase || !this.dbEnabled) return;

    await this.supabase.from('approval_queue').upsert({
      id: uuidv4(),
      post_id: post.postId,
      post_data: post,
      images_data: images ?? null,
      status: 'pending',
      submitted_at: new Date().toISOString(),
    });
  }

  /** Fetch all pending approvals. */
  async getPending(): Promise<ContentApproval[]> {
    if (!this.supabase || !this.dbEnabled) {
      logger.warn('Supabase not configured. Cannot fetch approval queue.');
      return [];
    }

    const { data, error } = await this.supabase
      .from('approval_queue')
      .select('*')
      .eq('status', 'pending');

    if (error) {
      logger.error(`Failed to fetch approval queue: ${error.message}`);
      return [];
    }

    return (data as ApprovalQueueRow[]).map((row) => ({
      postId: row.post_id,
      post: row.post_data as SocialPost,
      images: row.images_data as ImageSet | undefined,
      approvalStatus: row.status as 'pending' | 'approved' | 'rejected',
      reviewerNotes: row.reviewer_notes ?? undefined,
      submittedAt: new Date(row.submitted_at),
      reviewedAt: row.reviewed_at ? new Date(row.reviewed_at) : undefined,
    }));
  }

  /** Update a post's approval status. */
  async updateStatus(postId: string, approved: boolean, notes?: string): Promise<void> {
    if (!this.supabase || !this.dbEnabled) return;

    const status = approved ? 'approved' : 'rejected';
    await this.supabase
      .from('approval_queue')
      .update({
        status,
        reviewer_notes: notes ?? null,
        reviewed_at: new Date().toISOString(),
      })
      .eq('post_id', postId);

    logger.info(`Post ${postId} ${status}`);
  }

  /** Fetch an approved post and its images (used after approval to publish). */
  async getApprovedPost(postId: string): Promise<{ post: SocialPost; images?: ImageSet } | null> {
    if (!this.supabase || !this.dbEnabled) return null;

    const { data: row } = await this.supabase
      .from('approval_queue')
      .select('*')
      .eq('post_id', postId)
      .single();

    if (!row) return null;

    return {
      post: row.post_data as SocialPost,
      images: row.images_data as ImageSet | undefined,
    };
  }
}
