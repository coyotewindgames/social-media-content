/**
 * RankingStep — uses LLM to rank/filter news items by postworthiness.
 *
 * Non-fatal: falls back to top-N by original relevance order on failure.
 */

import { AbstractPipelineStep, StepResult } from '../PipelineStep';
import { PipelineContext } from '../PipelineContext';
import { RankingAgent } from '../../agents';
import { Config } from '../../config';
import { NewsItem } from '../../models';

export class RankingStep extends AbstractPipelineStep {
  readonly name = 'ranking_agent';

  constructor(
    private rankingAgent: RankingAgent,
    private config: Config,
  ) {
    super();
  }

  async execute(ctx: PipelineContext): Promise<StepResult> {
    try {
      const rankedItems = await this.rankingAgent.run<NewsItem[]>(
        ctx.newsItems,
        ctx.persona,
      );
      ctx.newsItems = rankedItems;
      this.logger.info(`Ranking agent completed: ${rankedItems.length} top articles selected`);
      return this.success();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      ctx.errorLog.push(`Ranking agent error (using original order): ${errorMessage}`);
      this.logger.warn(`Ranking agent failed, using top articles by relevance: ${errorMessage}`);

      // Fallback: slice to maxPostsPerRun from the existing sorted list
      const maxPosts = this.config.maxPostsPerRun || 3;
      ctx.newsItems = ctx.newsItems.slice(0, maxPosts);
      return this.success();
    }
  }
}
