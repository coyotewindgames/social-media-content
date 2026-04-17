/**
 * PipelineStep — interface and abstract base class for all pipeline steps.
 *
 * Each step has a single responsibility and operates on the shared PipelineContext.
 */

import { PipelineContext } from './PipelineContext';
import { Logger } from '../utils/logger';
import { getLogger } from '../utils';

export interface StepResult {
  /** Whether this step succeeded, failed, or was skipped (precondition not met). */
  status: 'success' | 'failed' | 'skipped';
  /** Error message if status is 'failed'. */
  error?: string;
  /** If false, the pipeline engine will stop after this step (graceful early exit). */
  shouldContinue: boolean;
}

export interface PipelineStep {
  /** Unique name used for logging and agentStatuses tracking. */
  readonly name: string;
  /** Execute the step, mutating ctx and returning a StepResult. */
  execute(ctx: PipelineContext): Promise<StepResult>;
}

/** Convenience base class that provides a logger scoped to the step name. */
export abstract class AbstractPipelineStep implements PipelineStep {
  abstract readonly name: string;
  private _logger?: Logger;

  protected get logger(): Logger {
    if (!this._logger) {
      this._logger = getLogger(this.name);
    }
    return this._logger;
  }

  abstract execute(ctx: PipelineContext): Promise<StepResult>;

  /** Helper: create a success result. */
  protected success(): StepResult {
    return { status: 'success', shouldContinue: true };
  }

  /** Helper: create a skipped result. */
  protected skipped(): StepResult {
    return { status: 'skipped', shouldContinue: true };
  }

  /** Helper: create a failed result that still continues the pipeline. */
  protected failedNonFatal(error: string): StepResult {
    return { status: 'failed', error, shouldContinue: true };
  }

  /** Helper: create a success result that stops the pipeline (graceful early exit). */
  protected stopPipeline(): StepResult {
    return { status: 'success', shouldContinue: false };
  }
}
