/**
 * Express API server for the Social Media Content Orchestrator.
 * Exposes REST endpoints so the frontend can trigger and monitor pipeline runs.
 * Reads completed runs from Supabase; keeps in-flight runs in memory.
 */

import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import * as crypto from 'crypto';
import * as dotenv from 'dotenv';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Orchestrator, RunOptions, PipelineResult } from './orchestrator';
import { loadConfig } from './config';
import { Platform, Tone } from './models';
import { getLogger, setupLogging } from './utils';

// Load .env from Render secret file path, then local .env (local values take precedence)
const renderEnvPath = '/etc/secrets/.env';
if (fs.existsSync(renderEnvPath)) {
  dotenv.config({ path: renderEnvPath });
}
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const config = loadConfig();
setupLogging({
  logDir: config.logDir,
  logLevel: config.logLevel as 'debug' | 'info' | 'warn' | 'error',
});

const logger = getLogger('api-server');
const orchestrator = new Orchestrator(config);

// Supabase client for direct queries
let supabase: SupabaseClient | null = null;
if (config.supabaseUrl && config.supabaseAnonKey) {
  supabase = createClient(config.supabaseUrl, config.supabaseAnonKey);
  logger.info('API server connected to Supabase for run history');
}

// In-memory state for *active* pipeline runs only
interface RunRecord {
  id: string;
  status: 'running' | 'completed' | 'failed';
  startedAt: string;
  completedAt?: string;
  options: RunOptions;
  currentAgent?: string;
  agentStatuses: Record<string, string>;
  result?: PipelineResult;
  errors: string[];
}

const activeRuns = new Map<string, RunRecord>();

// ─── Supabase helpers ────────────────────────────────────────────────────────

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

function rowToSummary(row: PipelineRunRow) {
  const posts = (row.posts ?? []) as unknown[];
  const news = (row.news_items ?? []) as unknown[];
  const publish = (row.publish_results ?? []) as unknown[];
  const errors = (row.error_log ?? []) as string[];
  return {
    id: row.id,
    status: row.status as 'running' | 'completed' | 'failed',
    startedAt: row.started_at,
    completedAt: row.completed_at ?? undefined,
    postCount: posts.length,
    newsCount: news.length,
    publishCount: publish.length,
    errors,
    dryRun: row.dry_run,
    agentStatuses: row.agent_statuses as Record<string, string>,
  };
}

function rowToResult(row: PipelineRunRow): PipelineResult {
  return {
    pipelineId: row.id,
    newsItems: row.news_items as PipelineResult['newsItems'],
    posts: row.posts as PipelineResult['posts'],
    imageSets: row.image_sets as PipelineResult['imageSets'],
    publishResults: row.publish_results as PipelineResult['publishResults'],
    errors: (row.error_log ?? []) as string[],
  };
}

// ─── Health ──────────────────────────────────────────────────────────────────

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Config status ───────────────────────────────────────────────────────────

app.get('/api/config/status', (_req, res) => {
  const hasOpenAI = !!config.openaiApiKey;
  const hasAnthropic = !!config.anthropicApiKey;
  const hasTwitter = !!(
    config.twitterAccessToken &&
    config.twitterAccessSecret &&
    config.twitterApiKey &&
    config.twitterApiSecret
  );
  const hasInstagram = !!config.instagramAccessToken;
  const hasLinkedIn = !!config.linkedinAccessToken;
  const hasFacebook = !!config.facebookAccessToken;
  const hasSupabase = !!config.supabaseUrl && !!config.supabaseAnonKey;
  const hasNewsApi = !!config.newsapiKey;
  const hasOllama = !!config.ollamaEndpoint;

  res.json({
    llm: { openai: hasOpenAI, anthropic: hasAnthropic, ollama: hasOllama },
    platforms: {
      twitter: hasTwitter,
      instagram: hasInstagram,
      linkedin: hasLinkedIn,
      facebook: hasFacebook,
    },
    services: { supabase: hasSupabase, newsapi: hasNewsApi },
    settings: {
      maxPostsPerRun: config.maxPostsPerRun,
      enabledPlatforms: config.enabledPlatforms,
      defaultTone: config.defaultTone,
    },
  });
});

// ─── Trigger a pipeline run ──────────────────────────────────────────────────

app.post('/api/pipeline/run', (req, res) => {
  const body = req.body as {
    keywords?: string[];
    platforms?: string[];
    tone?: string;
    dryRun?: boolean;
  };

  // Validate platforms
  let platforms: Platform[] | undefined;
  if (body.platforms && body.platforms.length > 0) {
    const validPlatforms = Object.values(Platform) as string[];
    const invalid = body.platforms.filter((p) => !validPlatforms.includes(p));
    if (invalid.length > 0) {
      res.status(400).json({ error: `Invalid platforms: ${invalid.join(', ')}` });
      return;
    }
    platforms = body.platforms as Platform[];
  }

  // Tone is deprecated — persona voice replaces it, but accept for backward compat
  let tone: Tone | undefined;
  if (body.tone) {
    const validTones = Object.values(Tone) as string[];
    if (validTones.includes(body.tone)) {
      tone = body.tone as Tone;
    }
  }

  const runOptions: RunOptions = {
    keywords: body.keywords,
    platforms,
    tone,
    dryRun: body.dryRun === true,
  };

  logger.info(`Pipeline run requested: dryRun=${runOptions.dryRun} (raw=${body.dryRun})`);

  // Generate a temporary ID; the real pipelineId comes from the orchestrator
  const tempId = `run-${Date.now()}`;

  const record: RunRecord = {
    id: tempId,
    status: 'running',
    startedAt: new Date().toISOString(),
    options: runOptions,
    agentStatuses: {},
    errors: [],
  };
  activeRuns.set(tempId, record);

  // Run pipeline async
  orchestrator
    .runPipeline(runOptions)
    .then((result) => {
      record.id = result.pipelineId;
      record.status = result.errors.length > 0 && result.posts.length === 0 ? 'failed' : 'completed';
      record.completedAt = new Date().toISOString();
      record.result = result;
      record.errors = result.errors;

      // Also key by the real pipeline ID (keep tempId as alias for in-flight frontend polls)
      activeRuns.set(result.pipelineId, record);

      // Remove both keys after a short delay (Supabase has it now)
      setTimeout(() => {
        activeRuns.delete(tempId);
        activeRuns.delete(result.pipelineId);
      }, 60_000);

      logger.info(`Pipeline ${result.pipelineId} finished: ${record.status}`);
    })
    .catch((err) => {
      record.status = 'failed';
      record.completedAt = new Date().toISOString();
      record.errors.push(err instanceof Error ? err.message : String(err));
      logger.error(`Pipeline ${tempId} failed: ${err}`);

      setTimeout(() => activeRuns.delete(tempId), 60_000);
    });

  res.status(202).json({ runId: tempId, message: 'Pipeline started' });
});

// ─── Pipeline status ─────────────────────────────────────────────────────────

app.get('/api/pipeline/status/:id', async (req, res) => {
  // Check in-memory first (active/recently completed)
  const record = activeRuns.get(req.params.id);
  if (record) {
    // For running pipelines, pull live agent statuses from the orchestrator
    let partialResults = undefined;
    if (record.status === 'running') {
      const live = orchestrator.getCurrentPipelineStatus();
      if (live) {
        record.agentStatuses = live.agentStatuses;
        partialResults = live.partialResults;
        // Also update the record's real pipeline ID once available
        if (live.id !== record.id && !activeRuns.has(live.id)) {
          record.id = live.id;
        }
      }
    }
    res.json({ ...record, partialResults });
    return;
  }

  // Fall back to Supabase
  if (supabase) {
    const { data, error } = await supabase
      .from('pipeline_runs')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (data && !error) {
      res.json(rowToSummary(data as PipelineRunRow));
      return;
    }
  }

  res.status(404).json({ error: 'Run not found' });
});

// ─── List all runs ───────────────────────────────────────────────────────────

app.get('/api/pipeline/runs', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 500);
  const seenIds = new Set<string>();
  const allRuns: ReturnType<typeof rowToSummary>[] = [];

  // Include active in-memory runs (running or just completed)
  for (const record of activeRuns.values()) {
    seenIds.add(record.id);
    allRuns.push({
      id: record.id,
      status: record.status,
      startedAt: record.startedAt,
      completedAt: record.completedAt,
      postCount: record.result?.posts.length ?? 0,
      newsCount: record.result?.newsItems.length ?? 0,
      publishCount: record.result?.publishResults.length ?? 0,
      errors: record.errors,
      dryRun: record.options.dryRun ?? false,
      agentStatuses: record.agentStatuses,
    });
  }

  // Merge Supabase runs
  if (supabase) {
    const { data, error } = await supabase
      .from('pipeline_runs')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(limit);

    if (data && !error) {
      for (const row of data as PipelineRunRow[]) {
        if (!seenIds.has(row.id)) {
          allRuns.push(rowToSummary(row));
        }
      }
    }
  }

  // Sort by start time descending
  allRuns.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());

  res.json(allRuns.slice(0, limit));
});

// ─── Get full run result (content previews) ──────────────────────────────────

app.get('/api/pipeline/result/:id', async (req, res) => {
  // Check in-memory first
  const record = activeRuns.get(req.params.id);
  if (record) {
    if (!record.result) {
      res.json({ status: record.status, message: 'Pipeline still running' });
      return;
    }
    res.json(record.result);
    return;
  }

  // Fall back to Supabase
  if (supabase) {
    const { data, error } = await supabase
      .from('pipeline_runs')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (data && !error) {
      const row = data as PipelineRunRow;
      if (row.status === 'running') {
        res.json({ status: 'running', message: 'Pipeline still running' });
        return;
      }
      res.json(rowToResult(row));
      return;
    }
  }

  res.status(404).json({ error: 'Run not found' });
});

// ─── Approval queue ──────────────────────────────────────────────────────────

app.get('/api/pipeline/approvals', async (_req, res) => {
  const queue = await orchestrator.getApprovalQueue();
  res.json(queue);
});

app.post('/api/pipeline/approve/:postId', async (req, res) => {
  const { postId } = req.params;
  const { approved, notes } = req.body as { approved: boolean; notes?: string };
  await orchestrator.approvePost(postId, approved, notes);
  res.json({ message: `Post ${postId} ${approved ? 'approved' : 'rejected'}` });
});

// ─── History (from Supabase if configured) ───────────────────────────────────

app.get('/api/pipeline/history', async (_req, res) => {
  const history = await orchestrator.getHistory(20);
  res.json(history);
});

// ─── Persona management (hardcoded Allen Sharpe) ─────────────────────────────

app.get('/api/persona', (_req, res) => {
  res.json(orchestrator.getActivePersona());
});

// ─── Refine a post using GPT-5.3 ──────────────────────────────────────────────
// Accepts { pipelineId, postId, refinementPrompt }, refines the post content
// via GPT-5.3, and writes the result back to the pipeline_runs JSONB.

import { refineContent } from './utils/refinementService';

app.post('/api/refine', async (req, res) => {
  const { pipelineId, postId, refinementPrompt, content: directContent, platform: directPlatform } = req.body as {
    pipelineId?: string;
    postId?: string;
    refinementPrompt?: string;
    content?: string;
    platform?: string;
  };

  if (!refinementPrompt) {
    res.status(400).json({ error: 'refinementPrompt is required' });
    return;
  }

  try {
    let contentToRefine: string | undefined;
    let platform: Platform = Platform.TWITTER;
    let canUpdateSupabase = false;
    let posts: Array<Record<string, unknown>> = [];
    let postIndex = -1;

    // Try loading from Supabase pipeline_runs first
    if (supabase && pipelineId && postId) {
      const { data: run, error: fetchErr } = await supabase
        .from('pipeline_runs')
        .select('posts')
        .eq('id', pipelineId)
        .single();

      if (!fetchErr && run) {
        posts = (run.posts ?? []) as Array<Record<string, unknown>>;
        postIndex = posts.findIndex((p) => p.postId === postId);

        if (postIndex !== -1) {
          const post = posts[postIndex];
          contentToRefine = (post.refinedContent as string) || (post.content as string);
          platform = (post.platform as Platform) || Platform.TWITTER;
          canUpdateSupabase = true;
        }
      }
    }

    // Fall back to directly-provided content
    if (!contentToRefine && directContent) {
      contentToRefine = directContent;
      const validPlatforms = Object.values(Platform) as string[];
      if (directPlatform && validPlatforms.includes(directPlatform)) {
        platform = directPlatform as Platform;
      }
    }

    if (!contentToRefine) {
      res.status(400).json({ error: 'No content to refine. Provide a valid pipelineId/postId or include content directly.' });
      return;
    }

    const persona = orchestrator.getActivePersona();

    // Call the LLM
    const result = await refineContent(
      contentToRefine,
      refinementPrompt,
      platform,
      persona,
      config,
    );

    // Update Supabase if we loaded from there
    if (canUpdateSupabase && supabase && postIndex !== -1) {
      posts[postIndex] = {
        ...posts[postIndex],
        refinedContent: result.refinedContent,
        refinementNotes: result.notes,
        refinementPrompt,
      };

      const { error: updateErr } = await supabase
        .from('pipeline_runs')
        .update({ posts })
        .eq('id', pipelineId);

      if (updateErr) {
        logger.warn(`Supabase update failed (result still returned): ${updateErr.message}`);
      }
    }

    logger.info(`Refined content${pipelineId ? ` (pipeline ${pipelineId})` : ' (direct)'}`);
    res.json({
      success: true,
      refinedContent: result.refinedContent,
      notes: result.notes,
    });
  } catch (err) {
    logger.error(`/api/refine error: ${err}`);
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

function percentEncode(str: string): string {
  return encodeURIComponent(str).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function buildTwitterOAuth1Header(method: string, url: string): string {
  const consumerKey = config.twitterApiKey!;
  const consumerSecret = config.twitterApiSecret!;
  const accessToken = config.twitterAccessToken!;
  const accessSecret = config.twitterAccessSecret!;

  const oauthParams: Record<string, string> = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: accessToken,
    oauth_version: '1.0',
  };

  const paramString = Object.keys(oauthParams)
    .sort()
    .map((k) => `${percentEncode(k)}=${percentEncode(oauthParams[k])}`)
    .join('&');

  const baseString = [
    method.toUpperCase(),
    percentEncode(url),
    percentEncode(paramString),
  ].join('&');

  const signingKey = `${percentEncode(consumerSecret)}&${percentEncode(accessSecret)}`;
  const signature = crypto
    .createHmac('sha1', signingKey)
    .update(baseString)
    .digest('base64');

  oauthParams.oauth_signature = signature;

  const header = Object.keys(oauthParams)
    .sort()
    .map((k) => `${percentEncode(k)}="${percentEncode(oauthParams[k])}"`)
    .join(', ');

  return `OAuth ${header}`;
}

// ─── Publish a single post to X (Twitter) on demand ────────────────────────
// Accepts { text } and uses TWITTER_ACCESS_TOKEN / TWITTER_ACCESS_SECRET /
// TWITTER_API_KEY / TWITTER_API_SECRET to publish via Twitter API v2.

app.post('/api/publish/twitter', async (req, res) => {
  const { text } = req.body as { text?: string };

  if (!text || !text.trim()) {
    res.status(400).json({ error: 'text is required' });
    return;
  }

  if (text.length > 280) {
    res.status(400).json({ error: 'text exceeds X character limit (280)' });
    return;
  }

  if (!config.twitterAccessToken || !config.twitterAccessSecret || !config.twitterApiKey || !config.twitterApiSecret) {
    res.status(503).json({
      error: 'Twitter credentials not fully configured (TWITTER_ACCESS_TOKEN / TWITTER_ACCESS_SECRET / TWITTER_API_KEY / TWITTER_API_SECRET)',
    });
    return;
  }

  try {
    const url = 'https://api.twitter.com/2/tweets';
    const authHeader = buildTwitterOAuth1Header('POST', url);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text: text.trim() }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      const errText = await response.text();
      logger.error(`Twitter publish failed: ${response.status} ${errText}`);
      res.status(502).json({ error: `Twitter API error: ${response.status} - ${errText}` });
      return;
    }

    const data = (await response.json()) as { data?: { id?: string; text?: string } };
    const tweetId = data.data?.id ?? '';

    logger.info(`Published to X: tweetId=${tweetId}`);
    res.json({
      success: true,
      tweetId,
      postUrl: `https://x.com/i/web/status/${tweetId}`,
    });
  } catch (err) {
    logger.error(`/api/publish/twitter error: ${err}`);
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ─── Publish a single post to Instagram on demand ────────────────────────────
// Accepts { caption, imageUrl } and uses the INSTAGRAM_ACCESS_TOKEN /
// INSTAGRAM_BUSINESS_ID from the environment to publish via the Graph API.

app.post('/api/publish/instagram', async (req, res) => {
  const { caption, imageUrl } = req.body as { caption?: string; imageUrl?: string };

  if (!caption) {
    res.status(400).json({ error: 'caption is required' });
    return;
  }
  if (!imageUrl) {
    res.status(400).json({ error: 'imageUrl is required (Instagram requires an image)' });
    return;
  }
  if (!config.instagramAccessToken || !config.instagramBusinessId) {
    res.status(503).json({ error: 'Instagram credentials not configured (INSTAGRAM_ACCESS_TOKEN / INSTAGRAM_BUSINESS_ID)' });
    return;
  }

  try {
    // Step 1: Create media container
    const containerUrl = new URL(
      `https://graph.instagram.com/v18.0/${config.instagramBusinessId}/media`
    );
    containerUrl.searchParams.set('image_url', imageUrl);
    containerUrl.searchParams.set('caption', caption);
    containerUrl.searchParams.set('access_token', config.instagramAccessToken);

    const containerRes = await fetch(containerUrl.toString(), {
      method: 'POST',
      signal: AbortSignal.timeout(60_000),
    });

    if (!containerRes.ok) {
      const errText = await containerRes.text();
      logger.error(`Instagram container creation failed: ${errText}`);
      res.status(502).json({ error: `Instagram API error: ${errText}` });
      return;
    }

    const containerData = (await containerRes.json()) as { id?: string };
    const containerId = containerData.id;
    if (!containerId) {
      res.status(502).json({ error: 'Instagram did not return a container ID' });
      return;
    }

    // Step 2: Publish the container
    const publishUrl = new URL(
      `https://graph.instagram.com/v18.0/${config.instagramBusinessId}/media_publish`
    );
    publishUrl.searchParams.set('creation_id', containerId);
    publishUrl.searchParams.set('access_token', config.instagramAccessToken);

    const publishRes = await fetch(publishUrl.toString(), {
      method: 'POST',
      signal: AbortSignal.timeout(60_000),
    });

    if (!publishRes.ok) {
      const errText = await publishRes.text();
      logger.error(`Instagram publish failed: ${errText}`);
      res.status(502).json({ error: `Instagram publish error: ${errText}` });
      return;
    }

    const publishData = (await publishRes.json()) as { id?: string };
    const mediaId = publishData.id ?? '';

    logger.info(`Published to Instagram: mediaId=${mediaId}`);
    res.json({
      success: true,
      mediaId,
      postUrl: `https://www.instagram.com/p/${mediaId}`,
    });
  } catch (err) {
    logger.error(`/api/publish/instagram error: ${err}`);
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ─── Production: serve frontend static files ────────────────────────────────

if (process.env.NODE_ENV === 'production') {
  const frontendPath = path.resolve(
    process.env.FRONTEND_DIST_PATH || path.join(__dirname, '..', 'frontend-dist')
  );
  app.use(express.static(frontendPath));
  // SPA fallback: serve index.html for any non-API route (skip /api paths)
  app.use((req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(frontendPath, 'index.html'));
  });
}

// ─── Clean up stale runs on startup ──────────────────────────────────────────

async function cleanupStaleRuns() {
  if (!supabase) return;
  try {
    const { data, error } = await supabase
      .from('pipeline_runs')
      .update({ status: 'failed', error_log: ['Server restarted while pipeline was running'] })
      .eq('status', 'running');
    if (!error && data) {
      logger.info(`Cleaned up stale running pipelines on startup`);
    }
  } catch (err) {
    logger.warn(`Failed to clean up stale runs: ${err}`);
  }
}

// ─── Start server ────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.API_PORT || '3001', 10);

app.listen(PORT, async () => {
  await cleanupStaleRuns();
  logger.info(`API server running on http://localhost:${PORT}`);
  console.log(`\n🚀 Orchestrator API server running on http://localhost:${PORT}\n`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down API server...');
  orchestrator.close();
  process.exit(0);
});
