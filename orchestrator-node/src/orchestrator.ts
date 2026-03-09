/**
 * Core Orchestrator class that manages agent lifecycle and data flow.
 * Uses Supabase for state persistence.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import { NewsAgent, ContentAgent, ImageAgent, PublishAgent } from './agents';
import { Config, loadConfig, validateConfig } from './config';
import {
  NewsItem,
  SocialPost,
  ImageSet,
  PublishResult,
  PipelineState,
  AgentStatus,
  Platform,
  Tone,
  ContentApproval,
  PublishStatus,
} from './models';
import { getLogger, setupLogging, RateLimiter, closeAllLoggers } from './utils';

const logger = getLogger('orchestrator');

// Database types for Supabase
interface PipelineRunRow {
  id: string;
  started_at: string;
  completed_at: string | null;
  status: string;
  dry_run: boolean;
  news_items: unknown;
  posts: unknown;
  image_sets: unknown;
  publish_results: unknown;
  error_log: unknown;
  agent_statuses: unknown;
}

interface ApprovalQueueRow {
  id: string;
  post_id: string;
  post_data: unknown;
  images_data: unknown | null;
  status: string;
  reviewer_notes: string | null;
  submitted_at: string;
  reviewed_at: string | null;
}

export interface PipelineResult {
  pipelineId: string;
  newsItems: NewsItem[];
  posts: SocialPost[];
  imageSets: ImageSet[];
  publishResults: PublishResult[];
  errors: string[];
}

export interface RunOptions {
  keywords?: string[];
  platforms?: Platform[];
  tone?: Tone;
  dryRun?: boolean;
  requireApproval?: boolean;
  postsPerItem?: number;
  imagesPerPost?: number;
}

export class Orchestrator {
  private config: Config;
  private supabase: SupabaseClient | null = null;
  private newsAgent: NewsAgent;
  private contentAgent: ContentAgent;
  private imageAgent: ImageAgent;
  private publishAgent: PublishAgent;
  private rateLimiter: RateLimiter;
  private currentPipeline?: PipelineState;
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
    if (this.config.supabaseUrl && this.config.supabaseAnonKey) {
      this.supabase = createClient(this.config.supabaseUrl, this.config.supabaseAnonKey);
      this.dbEnabled = true;
      logger.info(`Supabase initialized: ${this.config.supabaseUrl}`);
    } else {
      logger.warn('Supabase not configured. Running without database persistence.');
    }

    // Initialize rate limiter (shared across agents)
    this.rateLimiter = new RateLimiter();

    // Initialize agents
    this.newsAgent = new NewsAgent(this.config, this.rateLimiter);
    this.contentAgent = new ContentAgent(this.config, this.rateLimiter);
    this.imageAgent = new ImageAgent(this.config, this.rateLimiter);
    this.publishAgent = new PublishAgent(this.config, this.rateLimiter);

    // Set up graceful shutdown
    this.setupGracefulShutdown();

    logger.info('Orchestrator initialized');
  }

  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      if (this.isShuttingDown) return;
      this.isShuttingDown = true;

      logger.info(`Received ${signal}, initiating graceful shutdown...`);

      // Complete any pending operations if possible
      if (this.currentPipeline) {
        this.currentPipeline.errorLog.push(`Shutdown initiated by ${signal}`);
        await this.savePipelineState();
      }

      // Close loggers
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
    if (!this.currentPipeline) return null;
    return {
      id: this.currentPipeline.pipelineId,
      agentStatuses: Object.fromEntries(
        Object.entries(this.currentPipeline.agentStatuses).map(([k, v]) => [k, String(v)])
      ),
      partialResults: {
        newsCount: this.currentPipeline.newsItems.length,
        postCount: this.currentPipeline.posts.length,
        imageCount: this.currentPipeline.imageSets.length,
        publishCount: this.currentPipeline.publishResults.length,
        newsTopics: this.currentPipeline.newsItems.map((n) => n.topic.slice(0, 80)),
        postPreviews: this.currentPipeline.posts.map((p) => ({
          platform: p.platform,
          content: p.content.slice(0, 120),
          generatedBy: p.generatedBy,
        })),
      },
    };
  }

  /**
   * Run the complete content pipeline.
   */
  async runPipeline(options: RunOptions = {}): Promise<PipelineResult> {
    const {
      keywords,
      platforms = Object.values(Platform),
      tone = Tone.PROFESSIONAL,
      dryRun = this.config.dryRunMode,
      requireApproval = this.config.requireApproval,
      postsPerItem = this.config.postsPerNewsItem,
      imagesPerPost = this.config.imagesPerPost,
    } = options;

    // Initialize pipeline state
    this.currentPipeline = {
      pipelineId: uuidv4(),
      startedAt: new Date(),
      newsItems: [],
      posts: [],
      imageSets: [],
      publishResults: [],
      currentAgent: undefined,
      agentStatuses: {},
      errorLog: [],
      dryRun,
    };

    await this.savePipelineState();

    logger.info(`Starting pipeline ${this.currentPipeline.pipelineId} (dryRun=${dryRun})`);

    try {
      // Stage 1: News Retrieval
      await this.runNewsAgent(keywords);

      if (this.currentPipeline.newsItems.length === 0) {
        logger.warn('No news items retrieved, pipeline stopping');
        return this.completePipeline('completed_no_content');
      }

      // Stage 2: Content Generation
      await this.runContentAgent(platforms, tone, postsPerItem);

      // Stage 3: Image Generation
      await this.runImageAgent(imagesPerPost);

      // Stage 4: Publishing (or approval queue)
      if (requireApproval) {
        await this.queueForApproval();
      } else {
        await this.runPublishAgent(dryRun);
      }

      return this.completePipeline('completed');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.currentPipeline.errorLog.push(`Pipeline error: ${errorMessage}`);
      logger.error(`Pipeline failed: ${errorMessage}`);
      return this.completePipeline('failed');
    }
  }

  private async runNewsAgent(keywords?: string[]): Promise<void> {
    this.currentPipeline!.currentAgent = 'news_agent';
    this.currentPipeline!.agentStatuses['news_agent'] = AgentStatus.RUNNING;
    await this.savePipelineState();

    try {
      const newsItems = await this.newsAgent.run<NewsItem[]>(keywords);
      this.currentPipeline!.newsItems = newsItems;
      this.currentPipeline!.agentStatuses['news_agent'] = AgentStatus.SUCCESS;
      logger.info(`News agent completed: ${newsItems.length} items`);
    } catch (error) {
      this.currentPipeline!.agentStatuses['news_agent'] = AgentStatus.FAILED;
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.currentPipeline!.errorLog.push(`News agent error: ${errorMessage}`);
      logger.error(`News agent failed: ${errorMessage}`);

      // Retry after delay
      await this.sleep(30000);
      throw error;
    }
  }

  private async runContentAgent(
    platforms: Platform[],
    tone: Tone,
    postsPerItem: number
  ): Promise<void> {
    this.currentPipeline!.currentAgent = 'content_agent';
    this.currentPipeline!.agentStatuses['content_agent'] = AgentStatus.RUNNING;
    await this.savePipelineState();

    try {
      const posts = await this.contentAgent.run<SocialPost[]>(
        this.currentPipeline!.newsItems,
        platforms,
        tone,
        postsPerItem
      );
      this.currentPipeline!.posts = posts;
      this.currentPipeline!.agentStatuses['content_agent'] = AgentStatus.SUCCESS;
      logger.info(`Content agent completed: ${posts.length} posts`);
    } catch (error) {
      this.currentPipeline!.agentStatuses['content_agent'] = AgentStatus.FAILED;
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.currentPipeline!.errorLog.push(`Content agent error (using templates): ${errorMessage}`);
      logger.warn(`Content agent failed, using template fallback: ${errorMessage}`);

      // Fallback: Generate template-based posts (one per news item, round-robin platforms)
      const posts: SocialPost[] = [];
      const selectedNews = this.currentPipeline!.newsItems.slice(0, this.config.maxPostsPerRun || 3);
      for (let i = 0; i < selectedNews.length; i++) {
        const platform = platforms[i % platforms.length];
        posts.push(this.generateTemplatePost(selectedNews[i], platform, tone));
      }
      this.currentPipeline!.posts = posts;
      this.currentPipeline!.agentStatuses['content_agent'] = AgentStatus.SUCCESS;
    }
  }

  private async runImageAgent(imagesPerPost: number): Promise<void> {
    this.currentPipeline!.currentAgent = 'image_agent';
    this.currentPipeline!.agentStatuses['image_agent'] = AgentStatus.RUNNING;
    await this.savePipelineState();

    try {
      const imageSets = await this.imageAgent.run<ImageSet[]>(
        this.currentPipeline!.posts,
        imagesPerPost
      );
      this.currentPipeline!.imageSets = imageSets;
      this.currentPipeline!.agentStatuses['image_agent'] = AgentStatus.SUCCESS;
      logger.info(`Image agent completed: ${imageSets.length} image sets`);
    } catch (error) {
      this.currentPipeline!.agentStatuses['image_agent'] = AgentStatus.FAILED;
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.currentPipeline!.errorLog.push(`Image agent error (using stock images): ${errorMessage}`);
      logger.warn(`Image agent failed, using stock images: ${errorMessage}`);

      // Fallback: Generate stock image sets
      this.currentPipeline!.imageSets = this.currentPipeline!.posts.map((post) => ({
        postId: post.postId,
        images: [
          {
            url: 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=1200',
            format: 'jpeg',
            dimensions: { width: 1200, height: 675 },
            altText: 'Stock image',
          },
        ],
        createdAt: new Date(),
      }));
      this.currentPipeline!.agentStatuses['image_agent'] = AgentStatus.SUCCESS;
    }
  }

  private async runPublishAgent(dryRun: boolean): Promise<void> {
    this.currentPipeline!.currentAgent = 'publish_agent';
    this.currentPipeline!.agentStatuses['publish_agent'] = AgentStatus.RUNNING;
    await this.savePipelineState();

    try {
      const results = await this.publishAgent.run<PublishResult[]>(
        this.currentPipeline!.posts,
        this.currentPipeline!.imageSets,
        dryRun
      );
      this.currentPipeline!.publishResults = results;
      this.currentPipeline!.agentStatuses['publish_agent'] = AgentStatus.SUCCESS;
      logger.info(`Publish agent completed: ${results.length} results`);

      // Track analytics for published posts
      if (this.config.enableAnalytics && this.dbEnabled) {
        await this.trackAnalytics(results);
      }
    } catch (error) {
      this.currentPipeline!.agentStatuses['publish_agent'] = AgentStatus.FAILED;
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.currentPipeline!.errorLog.push(`Publish agent error: ${errorMessage}`);
      logger.error(`Publish agent failed: ${errorMessage}`);

      // Queue all posts for manual review
      for (const post of this.currentPipeline!.posts) {
        this.currentPipeline!.publishResults.push({
          postId: post.postId,
          platform: post.platform,
          status: PublishStatus.PENDING_REVIEW,
          errorMessage: `Queued for manual review: ${errorMessage}`,
          retryCount: 0,
        });
      }
    }
  }

  private async queueForApproval(): Promise<void> {
    logger.info('Queueing posts for approval');

    for (const post of this.currentPipeline!.posts) {
      const images = this.currentPipeline!.imageSets.find((is) => is.postId === post.postId);

      if (this.supabase && this.dbEnabled) {
        await this.supabase.from('approval_queue').upsert({
          id: uuidv4(),
          post_id: post.postId,
          post_data: post,
          images_data: images ?? null,
          status: 'pending',
          submitted_at: new Date().toISOString(),
        });
      }

      this.currentPipeline!.publishResults.push({
        postId: post.postId,
        platform: post.platform,
        status: PublishStatus.PENDING_REVIEW,
        errorMessage: 'Queued for approval',
        retryCount: 0,
      });
    }
  }

  private async completePipeline(status: string): Promise<PipelineResult> {
    this.currentPipeline!.completedAt = new Date();
    this.currentPipeline!.currentAgent = undefined;

    // Update pipeline in database
    if (this.supabase && this.dbEnabled) {
      await this.supabase.from('pipeline_runs').upsert({
        id: this.currentPipeline!.pipelineId,
        started_at: this.currentPipeline!.startedAt.toISOString(),
        completed_at: this.currentPipeline!.completedAt.toISOString(),
        status,
        dry_run: this.currentPipeline!.dryRun,
        news_items: this.currentPipeline!.newsItems,
        posts: this.currentPipeline!.posts,
        image_sets: this.currentPipeline!.imageSets,
        publish_results: this.currentPipeline!.publishResults,
        error_log: this.currentPipeline!.errorLog,
        agent_statuses: this.currentPipeline!.agentStatuses,
      });
    }

    logger.info(`Pipeline ${this.currentPipeline!.pipelineId} completed with status: ${status}`);

    return {
      pipelineId: this.currentPipeline!.pipelineId,
      newsItems: this.currentPipeline!.newsItems,
      posts: this.currentPipeline!.posts,
      imageSets: this.currentPipeline!.imageSets,
      publishResults: this.currentPipeline!.publishResults,
      errors: this.currentPipeline!.errorLog,
    };
  }

  private async savePipelineState(): Promise<void> {
    if (!this.currentPipeline || !this.supabase || !this.dbEnabled) return;

    await this.supabase.from('pipeline_runs').upsert({
      id: this.currentPipeline.pipelineId,
      started_at: this.currentPipeline.startedAt.toISOString(),
      completed_at: this.currentPipeline.completedAt?.toISOString() ?? null,
      status: 'running',
      dry_run: this.currentPipeline.dryRun,
      news_items: this.currentPipeline.newsItems,
      posts: this.currentPipeline.posts,
      image_sets: this.currentPipeline.imageSets,
      publish_results: this.currentPipeline.publishResults,
      error_log: this.currentPipeline.errorLog,
      agent_statuses: this.currentPipeline.agentStatuses,
    });
  }

  private async trackAnalytics(results: PublishResult[]): Promise<void> {
    if (!this.supabase || !this.dbEnabled) return;

    for (const result of results) {
      if (result.status === PublishStatus.PUBLISHED) {
        await this.supabase.from('analytics').insert({
          id: uuidv4(),
          post_id: result.postId,
          platform: result.platform,
          post_url: result.postUrl ?? null,
          published_at: result.publishedAt?.toISOString() ?? new Date().toISOString(),
          impressions: {},
          engagement: {},
          last_updated: new Date().toISOString(),
        });
      }
    }
  }

  private generateTemplatePost(newsItem: NewsItem, platform: Platform, tone: Tone): SocialPost {
    const templates: Record<Tone, string[]> = {
      [Tone.CASUAL]: ['Check this out! {topic} 🔥'],
      [Tone.PROFESSIONAL]: ['Key insight: {topic}. Learn more about how this impacts our industry.'],
      [Tone.PLAYFUL]: ['POV: You just discovered {topic} 😎'],
      [Tone.INSPIRATIONAL]: ['The future is being shaped by {topic}. Be part of the change. ✨'],
      [Tone.INFORMATIVE]: ['Did you know? {topic}. Here are the key facts. 📊'],
    };

    const templateList = templates[tone] ?? templates[Tone.PROFESSIONAL];
    const template = templateList[Math.floor(Math.random() * templateList.length)];
    const content = template.replace('{topic}', newsItem.topic.slice(0, 100));

    return {
      postId: uuidv4(),
      content,
      platform,
      hashtags: newsItem.keywords.slice(0, 5),
      imagePrompt: `Professional illustration representing: ${newsItem.topic.slice(0, 50)}`,
      tone,
      characterCount: content.length,
      newsSource: newsItem.url,
      createdAt: new Date(),
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get the approval queue.
   */
  async getApprovalQueue(): Promise<ContentApproval[]> {
    if (!this.supabase || !this.dbEnabled) {
      logger.warn('Supabase not configured. Cannot fetch approval queue.');
      return [];
    }

    const { data, error } = await this.supabase
      .from('approval_queue')
      .select('*')
      .eq('status', 'pending');

    if (error) {
      logger.error(`Failed to fetch approval queue: ${error.message}`);
      return [];
    }

    return (data as ApprovalQueueRow[]).map((row) => ({
      postId: row.post_id,
      post: row.post_data as SocialPost,
      images: row.images_data as ImageSet | undefined,
      approvalStatus: row.status as 'pending' | 'approved' | 'rejected',
      reviewerNotes: row.reviewer_notes ?? undefined,
      submittedAt: new Date(row.submitted_at),
      reviewedAt: row.reviewed_at ? new Date(row.reviewed_at) : undefined,
    }));
  }

  /**
   * Approve or reject a post.
   */
  async approvePost(postId: string, approved: boolean, notes?: string): Promise<void> {
    const status = approved ? 'approved' : 'rejected';

    if (this.supabase && this.dbEnabled) {
      await this.supabase
        .from('approval_queue')
        .update({
          status,
          reviewer_notes: notes ?? null,
          reviewed_at: new Date().toISOString(),
        })
        .eq('post_id', postId);
    }

    logger.info(`Post ${postId} ${status}`);

    // If approved, publish the post
    if (approved && this.supabase && this.dbEnabled) {
      const { data: row } = await this.supabase
        .from('approval_queue')
        .select('*')
        .eq('post_id', postId)
        .single();

      if (row) {
        const post = row.post_data as SocialPost;
        const images = row.images_data as ImageSet | undefined;

        const results = await this.publishAgent.run<PublishResult[]>(
          [post],
          images ? [images] : [],
          false
        );

        logger.info(`Approved post published: ${JSON.stringify(results)}`);
      }
    }
  }

  /**
   * Get pipeline run history.
   */
  async getHistory(limit = 10): Promise<PipelineState[]> {
    if (!this.supabase || !this.dbEnabled) {
      logger.warn('Supabase not configured. Cannot fetch history.');
      return [];
    }

    const { data, error } = await this.supabase
      .from('pipeline_runs')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(limit);

    if (error) {
      logger.error(`Failed to fetch history: ${error.message}`);
      return [];
    }

    return (data as PipelineRunRow[]).map((row) => ({
      pipelineId: row.id,
      startedAt: new Date(row.started_at),
      completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
      newsItems: row.news_items as NewsItem[],
      posts: row.posts as SocialPost[],
      imageSets: row.image_sets as ImageSet[],
      publishResults: row.publish_results as PublishResult[],
      currentAgent: undefined,
      agentStatuses: row.agent_statuses as Record<string, AgentStatus>,
      errorLog: row.error_log as string[],
      dryRun: row.dry_run,
    }));
  }

  /**
   * Close the orchestrator and clean up resources.
   */
  close(): void {
    closeAllLoggers();
    logger.info('Orchestrator closed');
  }
}
