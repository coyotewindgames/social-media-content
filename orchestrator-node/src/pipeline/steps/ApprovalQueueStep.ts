/**
 * ApprovalQueueStep — enqueues posts for human approval instead of publishing.
 *
 * Conditional: only runs if requireApproval is set.
 * When this step runs, it stops the pipeline (skips PublishingStep).
 */

import { AbstractPipelineStep, StepResult } from '../PipelineStep';
import { PipelineContext } from '../PipelineContext';
import { ApprovalQueueRepository } from '../../repositories';
import { PublishStatus } from '../../models';

export class ApprovalQueueStep extends AbstractPipelineStep {
  readonly name = 'approval_queue';

  constructor(private approvalRepo: ApprovalQueueRepository) {
    super();
  }

  async execute(ctx: PipelineContext): Promise<StepResult> {
    const requireApproval = ctx.options.requireApproval ?? false;
    if (!requireApproval) {
      return this.skipped();
    }

    this.logger.info('Queueing posts for approval');

    for (const post of ctx.posts) {
      const images = ctx.imageSets.find((is) => is.postId === post.postId);
      await this.approvalRepo.enqueue(post, images);

      ctx.publishResults.push({
        postId: post.postId,
        platform: post.platform,
        status: PublishStatus.PENDING_REVIEW,
        errorMessage: 'Queued for approval',
        retryCount: 0,
      });
    }

    // Stop pipeline — don't proceed to PublishingStep
    return this.stopPipeline();
  }
}
