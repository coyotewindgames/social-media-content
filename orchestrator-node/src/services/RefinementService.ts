/**
 * RefinementService — class wrapper around the GPT-5.4 refinement cascade.
 *
 * Delegates to the existing refineContent() function in utils/refinementService.ts
 * but provides a class-based API for dependency injection into pipeline steps.
 */

import { Config } from '../config';
import { PersonaProfile, Platform } from '../models';
import { RateLimiter } from '../utils/apiHelpers';
import { refineContent, RefinementResult } from '../utils/refinementService';

export type { RefinementResult };

export class RefinementService {
  constructor(
    private config: Config,
    private rateLimiter: RateLimiter,
  ) {}

  /**
   * Refine a piece of content using GPT-5.4 (with Anthropic/Ollama fallback).
   */
  async refine(
    content: string,
    refinementPrompt: string,
    platform: Platform,
    persona: PersonaProfile,
  ): Promise<RefinementResult> {
    return refineContent(content, refinementPrompt, platform, persona, this.config, this.rateLimiter);
  }
}
