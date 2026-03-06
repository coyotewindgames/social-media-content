/**
 * Base agent class with common functionality.
 */

import { AgentStatus } from '../models';
import { getLogger, RateLimiter } from '../utils';

export abstract class BaseAgent {
  readonly name: string;
  protected logger: ReturnType<typeof getLogger>;
  protected rateLimiter: RateLimiter;
  private _status: AgentStatus = AgentStatus.PENDING;
  private _lastError?: string;

  constructor(name: string, rateLimiter?: RateLimiter) {
    this.name = name;
    this.logger = getLogger(`agents.${name}`);
    this.rateLimiter = rateLimiter ?? new RateLimiter();
  }

  get status(): AgentStatus {
    return this._status;
  }

  set status(value: AgentStatus) {
    this.logger.info(`Status changed: ${this._status} -> ${value}`);
    this._status = value;
  }

  get lastError(): string | undefined {
    return this._lastError;
  }

  /**
   * Execute the agent's main task.
   * Override this method in subclasses.
   */
  abstract execute(...args: unknown[]): Promise<unknown>;

  /**
   * Run the agent with status tracking and error handling.
   */
  async run<T>(...args: unknown[]): Promise<T> {
    this.status = AgentStatus.RUNNING;
    this._lastError = undefined;

    try {
      const result = await this.execute(...args);
      this.status = AgentStatus.SUCCESS;
      return result as T;
    } catch (error) {
      this._lastError = error instanceof Error ? error.message : String(error);
      this.status = AgentStatus.FAILED;
      this.logger.error(`Agent failed: ${this._lastError}`);
      throw error;
    }
  }

  /**
   * Reset agent state for new execution.
   */
  reset(): void {
    this._status = AgentStatus.PENDING;
    this._lastError = undefined;
  }
}
