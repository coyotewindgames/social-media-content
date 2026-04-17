/**
 * PublishingStep — publishes posts to social media platforms.
 *
 * Skipped if ApprovalQueueStep already ran (pipeline would have stopped).
 * On failure, queues all posts for manual review.
 */

import { AbstractPipelineStep, StepResult } from '../PipelineStep';
import { PipelineContext } from '../PipelineContext';
import { PublishAgent } from '../../agents';
import { PublishResult, PublishStatus } from '../../models';

export class PublishingStep extends AbstractPipelineStep {
  readonly name = 'publish_agent';

  constructor(private publishAgent: PublishAgent) {
    super();
  }

  async execute(ctx: PipelineContext): Promise<StepResult> {
    try {
      const results = await this.publishAgent.run<PublishResult[]>(
        ctx.posts,
        ctx.imageSets,
        ctx.dryRun,
      );
      ctx.publishResults = results;
      this.logger.info(`Publish agent completed: ${results.length} results`);
      return this.success();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      ctx.errorLog.push(`Publish agent error: ${errorMessage}`);
      this.logger.error(`Publish agent failed: ${errorMessage}`);

      // Queue all posts for manual review
      for (const post of ctx.posts) {
        ctx.publishResults.push({
          postId: post.postId,
          platform: post.platform,
          status: PublishStatus.PENDING_REVIEW,
          errorMessage: `Queued for manual review: ${errorMessage}`,
          retryCount: 0,
        });
      }
      return this.failedNonFatal(errorMessage);
    }
  }
}
