/**
 * PersonaStep — loads the active persona into the pipeline context.
 */

import { AbstractPipelineStep, StepResult } from '../PipelineStep';
import { PipelineContext } from '../PipelineContext';
import { PersonaService } from '../../services/PersonaService';

export class PersonaStep extends AbstractPipelineStep {
  readonly name = 'persona_agent';

  constructor(private personaService: PersonaService) {
    super();
  }

  async execute(ctx: PipelineContext): Promise<StepResult> {
    const persona = this.personaService.getActivePersona();
    ctx.persona = persona;
    ctx.recentPosts = [];
    this.logger.info(`Pipeline using persona "${persona.name}"`);
    return this.success();
  }
}
