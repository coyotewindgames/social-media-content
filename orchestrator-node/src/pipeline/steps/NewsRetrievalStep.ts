/**
 * NewsRetrievalStep — merges persona keywords with user keywords, fetches news.
 *
 * Returns shouldContinue=false if no news items are found (graceful stop).
 */

import { AbstractPipelineStep, StepResult } from '../PipelineStep';
import { PipelineContext } from '../PipelineContext';
import { NewsAgent } from '../../agents';
import { PersonaService } from '../../services/PersonaService';
import { NewsItem } from '../../models';

export class NewsRetrievalStep extends AbstractPipelineStep {
  readonly name = 'news_agent';

  constructor(
    private newsAgent: NewsAgent,
    private personaService: PersonaService,
  ) {
    super();
  }

  async execute(ctx: PipelineContext): Promise<StepResult> {
    const persona = ctx.persona;
    const userKeywords = ctx.options.keywords;

    // Merge user keywords with persona-derived keywords
    const personaKeywords = persona
      ? this.personaService.derivePersonaKeywords(persona)
      : [];
    const mergedKeywords = userKeywords?.length
      ? [...userKeywords, ...personaKeywords]
      : personaKeywords.length > 0 ? personaKeywords : undefined;

    try {
      const newsItems = await this.newsAgent.run<NewsItem[]>(mergedKeywords);
      ctx.newsItems = newsItems;
      this.logger.info(`News agent completed: ${newsItems.length} items`);

      if (newsItems.length === 0) {
        this.logger.warn('No news items retrieved, pipeline stopping');
        return this.stopPipeline();
      }

      return this.success();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      ctx.errorLog.push(`News agent error: ${errorMessage}`);
      this.logger.error(`News agent failed: ${errorMessage}`);
      throw error;
    }
  }
}
