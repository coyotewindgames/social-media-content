/**
 * PipelineEngine — executes an ordered list of PipelineSteps.
 *
 * Responsibilities:
 *  - Create a PipelineContext
 *  - Iterate steps in order
 *  - Update agentStatuses and persist state after each step
 *  - Handle early exits (shouldContinue=false) and unhandled errors
 *  - Expose live context for server-side polling
 */

import { PipelineStep } from './PipelineStep';
import {
  PipelineContext,
  PipelineResult,
  RunOptions,
  createPipelineContext,
  contextToResult,
} from './PipelineContext';
import { PipelineRepository } from '../repositories';
import { AgentStatus } from '../models';
import { getLogger } from '../utils';

const logger = getLogger('pipeline-engine');

export class PipelineEngine {
  private currentContext?: PipelineContext;

  constructor(
    private steps: PipelineStep[],
    private repo: PipelineRepository,
  ) {}

  /**
   * Run the full pipeline with the given options.
   */
  async run(options: RunOptions, dryRunDefault: boolean): Promise<PipelineResult> {
    const dryRun = options.dryRun ?? dryRunDefault;
    const ctx = createPipelineContext(options, dryRun);
    this.currentContext = ctx;

    await this.repo.savePipelineState(ctx);
    logger.info(`Starting pipeline ${ctx.pipelineId} (dryRun=${dryRun})`);

    try {
      for (const step of this.steps) {
        // Mark step as running
        ctx.currentAgent = step.name;
        ctx.agentStatuses[step.name] = AgentStatus.RUNNING;
        await this.repo.savePipelineState(ctx);

        try {
          const result = await step.execute(ctx);

          // Update status based on result
          switch (result.status) {
            case 'success':
              ctx.agentStatuses[step.name] = AgentStatus.SUCCESS;
              break;
            case 'failed':
              ctx.agentStatuses[step.name] = AgentStatus.FAILED;
              break;
            case 'skipped':
              // Don't overwrite — leave as 'running' briefly, then mark success
              ctx.agentStatuses[step.name] = AgentStatus.SUCCESS;
              break;
          }

          await this.repo.savePipelineState(ctx);

          if (!result.shouldContinue) {
            logger.info(`Pipeline stopping after step "${step.name}" (shouldContinue=false)`);
            break;
          }
        } catch (error) {
          // Unhandled error from a step — mark failed and re-throw to abort pipeline
          ctx.agentStatuses[step.name] = AgentStatus.FAILED;
          const errorMessage = error instanceof Error ? error.message : String(error);
          ctx.errorLog.push(`${step.name} unhandled error: ${errorMessage}`);
          logger.error(`Step "${step.name}" threw unhandled error: ${errorMessage}`);
          await this.repo.savePipelineState(ctx);
          throw error;
        }
      }

      // Pipeline completed successfully
      ctx.completedAt = new Date();
      ctx.currentAgent = undefined;
      const status = ctx.posts.length === 0 ? 'completed_no_content' : 'completed';
      await this.repo.completePipeline(ctx, status);
      logger.info(`Pipeline ${ctx.pipelineId} completed with status: ${status}`);
      return contextToResult(ctx);
    } catch (error) {
      // Pipeline-level failure
      const errorMessage = error instanceof Error ? error.message : String(error);
      ctx.errorLog.push(`Pipeline error: ${errorMessage}`);
      ctx.completedAt = new Date();
      ctx.currentAgent = undefined;
      await this.repo.completePipeline(ctx, 'failed');
      logger.error(`Pipeline ${ctx.pipelineId} failed: ${errorMessage}`);
      return contextToResult(ctx);
    } finally {
      this.currentContext = undefined;
    }
  }

  /**
   * Get the current pipeline's live status (used by the API server for polling).
   */
  getCurrentPipelineStatus(): {
    id: string;
    agentStatuses: Record<string, string>;
    partialResults: {
      newsCount: number;
      postCount: number;
      imageCount: number;
      publishCount: number;
      newsTopics: string[];
      postPreviews: { platform: string; content: string; generatedBy?: string }[];
    };
  } | null {
    const ctx = this.currentContext;
    if (!ctx) return null;

    return {
      id: ctx.pipelineId,
      agentStatuses: Object.fromEntries(
        Object.entries(ctx.agentStatuses).map(([k, v]) => [k, String(v)])
      ),
      partialResults: {
        newsCount: ctx.newsItems.length,
        postCount: ctx.posts.length,
        imageCount: ctx.imageSets.length,
        publishCount: ctx.publishResults.length,
        newsTopics: ctx.newsItems.map((n) => n.topic.slice(0, 80)),
        postPreviews: ctx.posts.map((p) => ({
          platform: p.platform,
          content: p.content.slice(0, 120),
          generatedBy: p.generatedBy,
        })),
      },
    };
  }
}
