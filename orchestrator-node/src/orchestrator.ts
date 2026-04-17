/**
 * Orchestrator — thin façade that delegates to PipelineEngine and repositories.
 *
 * Preserves the exact public API surface consumed by server.ts and main.ts.
 * All pipeline logic now lives in pipeline/steps/*, repositories/*, and services/*.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { NewsAgent, ContentAgent, ImageAgent, PublishAgent, RankingAgent } from './agents';
import { Config, loadConfig, validateConfig } from './config';
import {
  PipelineState,
  ContentApproval,
  PersonaProfile,
  PublishResult,
} from './models';
import { getLogger, setupLogging, RateLimiter, closeAllLoggers } from './utils';

// Pipeline engine + steps
import { PipelineEngine } from './pipeline/PipelineEngine';
import { PipelineResult, RunOptions } from './pipeline/PipelineContext';
import {
  PersonaStep,
  NewsRetrievalStep,
  RankingStep,
  ContentGenerationStep,
  RefinementStep,
  ImageGenerationStep,
  ApprovalQueueStep,
  PublishingStep,
  AnalyticsStep,
} from './pipeline/steps';

// Repositories
import { PipelineRepository, ApprovalQueueRepository, AnalyticsRepository } from './repositories';

// Services
import { PersonaService } from './services/PersonaService';
import { RefinementService } from './services/RefinementService';

export type { PipelineResult, RunOptions };

const logger = getLogger('orchestrator');

export class Orchestrator {
  private config: Config;
  private engine: PipelineEngine;
  private publishAgent: PublishAgent;
  private approvalRepo: ApprovalQueueRepository;
  private pipelineRepo: PipelineRepository;
  private personaService: PersonaService;
  private isShuttingDown = false;
  private dbEnabled = false;

  constructor(config?: Config) {
    this.config = config ?? loadConfig();

    // Set up logging
    setupLogging({
      logDir: this.config.logDir,
      logLevel: this.config.logLevel as 'debug' | 'info' | 'warn' | 'error',
    });

    // Validate configuration
    const warnings = validateConfig(this.config);
    for (const warning of warnings) {
      logger.warn(warning);
    }

    // Initialize Supabase client if configured
    let supabase: SupabaseClient | null = null;
    if (this.config.supabaseUrl && this.config.supabaseAnonKey) {
      supabase = createClient(this.config.supabaseUrl, this.config.supabaseAnonKey);
      this.dbEnabled = true;
      logger.info(`Supabase initialized: ${this.config.supabaseUrl}`);
    } else {
      logger.warn('Supabase not configured. Running without database persistence.');
    }

    // Initialize shared rate limiter
    const rateLimiter = new RateLimiter();

    // Initialize agents
    const newsAgent = new NewsAgent(this.config, rateLimiter);
    const rankingAgent = new RankingAgent(this.config, rateLimiter);
    const contentAgent = new ContentAgent(this.config, rateLimiter);
    const imageAgent = new ImageAgent(this.config, rateLimiter);
    this.publishAgent = new PublishAgent(this.config, rateLimiter);

    // Initialize repositories
    this.pipelineRepo = new PipelineRepository(supabase, this.dbEnabled);
    this.approvalRepo = new ApprovalQueueRepository(supabase, this.dbEnabled);
    const analyticsRepo = new AnalyticsRepository(supabase, this.dbEnabled);

    // Initialize services
    this.personaService = new PersonaService();
    const refinementService = new RefinementService(this.config, rateLimiter);

    // Build the step list
    const steps = [
      new PersonaStep(this.personaService),
      new NewsRetrievalStep(newsAgent, this.personaService),
      new RankingStep(rankingAgent, this.config),
      new ContentGenerationStep(contentAgent, this.config),
      new RefinementStep(refinementService, this.personaService, this.config),
      new ImageGenerationStep(imageAgent, this.config),
      new ApprovalQueueStep(this.approvalRepo),
      new PublishingStep(this.publishAgent),
      new AnalyticsStep(analyticsRepo, this.config, this.dbEnabled),
    ];

    // Create the pipeline engine
    this.engine = new PipelineEngine(steps, this.pipelineRepo);

    // Set up graceful shutdown
    this.setupGracefulShutdown();

    logger.info('Orchestrator initialized');
  }

  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      if (this.isShuttingDown) return;
      this.isShuttingDown = true;

      logger.info(`Received ${signal}, initiating graceful shutdown...`);
      closeAllLoggers();
      process.exit(0);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  }

  /** Get the current pipeline's live status (used by the API server for polling). */
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
    return this.engine.getCurrentPipelineStatus();
  }

  /**
   * Run the complete content pipeline.
   */
  async runPipeline(options: RunOptions = {}): Promise<PipelineResult> {
    return this.engine.run(options, this.config.dryRunMode);
  }

  /**
   * Get the approval queue.
   */
  async getApprovalQueue(): Promise<ContentApproval[]> {
    return this.approvalRepo.getPending();
  }

  /**
   * Approve or reject a post.
   */
  async approvePost(postId: string, approved: boolean, notes?: string): Promise<void> {
    await this.approvalRepo.updateStatus(postId, approved, notes);

    // If approved, publish the post
    if (approved) {
      const data = await this.approvalRepo.getApprovedPost(postId);
      if (data) {
        const results = await this.publishAgent.run<PublishResult[]>(
          [data.post],
          data.images ? [data.images] : [],
          false,
        );
        logger.info(`Approved post published: ${JSON.stringify(results)}`);
      }
    }
  }

  /**
   * Get pipeline run history.
   */
  async getHistory(limit = 10): Promise<PipelineState[]> {
    return this.pipelineRepo.getHistory(limit);
  }

  /** Returns the active persona. */
  getActivePersona(): PersonaProfile {
    return this.personaService.getActivePersona();
  }

  /**
   * Close the orchestrator and clean up resources.
   */
  close(): void {
    closeAllLoggers();
    logger.info('Orchestrator closed');
  }
}
