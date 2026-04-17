/**
 * AnalyticsStep — tracks published posts in the analytics table.
 *
 * Conditional: only runs if enableAnalytics is set and DB is available.
 * Non-fatal: failures are logged but don't affect the pipeline result.
 */

import { AbstractPipelineStep, StepResult } from '../PipelineStep';
import { PipelineContext } from '../PipelineContext';
import { AnalyticsRepository } from '../../repositories';
import { Config } from '../../config';

export class AnalyticsStep extends AbstractPipelineStep {
  readonly name = 'analytics';

  constructor(
    private analyticsRepo: AnalyticsRepository,
    private config: Config,
    private dbEnabled: boolean,
  ) {
    super();
  }

  async execute(ctx: PipelineContext): Promise<StepResult> {
    if (!this.config.enableAnalytics || !this.dbEnabled) {
      return this.skipped();
    }

    try {
      await this.analyticsRepo.trackPublish(ctx.publishResults);
      this.logger.info('Analytics tracked for published posts');
      return this.success();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      ctx.errorLog.push(`Analytics error: ${errorMessage}`);
      this.logger.warn(`Analytics tracking failed: ${errorMessage}`);
      return this.failedNonFatal(errorMessage);
    }
  }
}
