/**
 * RefinementStep — refines each post via GPT-5.4 while preserving persona voice.
 *
 * Conditional: only runs if enableAutoRefinement is set.
 * Non-fatal: individual post failures are logged and skipped.
 */

import { AbstractPipelineStep, StepResult } from '../PipelineStep';
import { PipelineContext } from '../PipelineContext';
import { Config } from '../../config';
import { RefinementService } from '../../services/RefinementService';
import { PersonaService } from '../../services/PersonaService';

export class RefinementStep extends AbstractPipelineStep {
  readonly name = 'refinement_agent';

  constructor(
    private refinementService: RefinementService,
    private personaService: PersonaService,
    private config: Config,
  ) {
    super();
  }

  async execute(ctx: PipelineContext): Promise<StepResult> {
    const shouldRefine = ctx.options.enableAutoRefinement ?? this.config.autoRefineEnabled;
    if (!shouldRefine) {
      return this.skipped();
    }

    const refinementPrompt = ctx.options.autoRefinementPrompt ?? this.config.autoRefinePrompt;
    const persona = ctx.persona ?? this.personaService.getActivePersona();
    let refined = 0;

    try {
      for (const post of ctx.posts) {
        try {
          const contentToRefine = post.refinedContent ?? post.content;
          const result = await this.refinementService.refine(
            contentToRefine,
            refinementPrompt,
            post.platform,
            persona,
          );
          post.refinedContent = result.refinedContent;
          post.refinementNotes = result.notes;
          post.refinementPrompt = refinementPrompt;
          refined++;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          this.logger.warn(`Refinement failed for post ${post.postId}: ${msg}`);
          ctx.errorLog.push(`Refinement skipped for ${post.postId}: ${msg}`);
        }
      }

      this.logger.info(`Refinement agent completed: ${refined}/${ctx.posts.length} posts refined`);
      return this.success();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      ctx.errorLog.push(`Refinement agent error: ${errorMessage}`);
      this.logger.error(`Refinement agent failed: ${errorMessage}`);
      return this.failedNonFatal(errorMessage);
    }
  }
}
