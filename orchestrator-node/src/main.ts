#!/usr/bin/env node
/**
 * CLI entry point for the Social Media Content Orchestrator.
 */

import { Command } from 'commander';
import * as cron from 'node-cron';
import * as dotenv from 'dotenv';
import { execSync, spawn } from 'child_process';
import { Orchestrator, RunOptions } from './orchestrator';
import { loadConfig } from './config';
import { Platform, Tone } from './models';
import { getLogger, setupLogging } from './utils';

// Load environment variables
dotenv.config();

const program = new Command();

program
  .name('orchestrator')
  .description('Social Media Content Orchestrator')
  .version('1.0.0');

program
  .option('-c, --config <path>', 'Path to configuration file')
  .option('-d, --dry-run', 'Run without actually posting to social media')
  .option('-k, --keywords <words...>', 'Keywords to filter news content')
  .option(
    '-p, --platforms <platforms...>',
    'Target platforms (twitter, linkedin, instagram, facebook, tiktok)'
  )
  .option(
    '-t, --tone <tone>',
    '(DEPRECATED: persona voice replaces tone) Content tone',
    'professional'
  )
  .option('-s, --schedule', 'Run with scheduler at optimal posting times')
  .option('-i, --interactive', 'Run in interactive mode')
  .option('-a, --approval-mode', 'Queue posts for approval before publishing')
  .option('--show-queue', 'Show pending approvals')
  .option('--approve-post <postId>', 'Approve a post by ID')
  .option('--reject-post <postId>', 'Reject a post by ID')
  .option('--history', 'Show pipeline run history');

// ─── Persona subcommand ──────────────────────────────────────────────────────

program
  .command('show-persona')
  .description('Display the hardcoded Allen Sharpe persona')
  .action(() => {
    const config = loadConfig();
    setupLogging({ logDir: config.logDir, logLevel: config.logLevel as 'debug' | 'info' | 'warn' | 'error' });
    const orchestrator = new Orchestrator(config);
    const persona = orchestrator.getActivePersona();
    console.log(`\nActive Persona: ${persona.name} (id: ${persona.id})\n`);
    console.log(JSON.stringify(persona, null, 2));
    orchestrator.close();
  });

program.parse();

const options = program.opts();

async function ensureOllamaRunning(endpoint: string, model: string): Promise<void> {
  const logger = getLogger('ollama-startup');

  // Check if Ollama is already reachable
  try {
    const res = await fetch(`${endpoint}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      logger.info('Ollama is already running');
      await ensureModelPulled(endpoint, model, logger);
      return;
    }
  } catch {
    // Not running yet — attempt to start it
  }

  logger.info('Ollama not detected. Attempting to start ollama serve...');
  console.log('Starting Ollama in the background...');

  // Start ollama serve as a detached background process
  const child = spawn('ollama', ['serve'], {
    detached: true,
    stdio: 'ignore',
    shell: true,
  });
  child.unref();

  // Wait for it to become reachable (up to 15 seconds)
  for (let i = 0; i < 15; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    try {
      const res = await fetch(`${endpoint}/api/tags`, { signal: AbortSignal.timeout(2000) });
      if (res.ok) {
        logger.info('Ollama started successfully');
        console.log('Ollama is ready.');
        await ensureModelPulled(endpoint, model, logger);
        return;
      }
    } catch {
      // Still starting up
    }
  }

  logger.warn('Could not start Ollama automatically. Ollama fallback will be unavailable.');
  console.warn('Warning: Could not start Ollama. Install it from https://ollama.com if you want local LLM fallback.');
}

async function ensureModelPulled(endpoint: string, model: string, logger: ReturnType<typeof getLogger>): Promise<void> {
  try {
    const res = await fetch(`${endpoint}/api/tags`, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const data = await res.json() as { models?: Array<{ name: string }> };
      const available = data.models?.map((m) => m.name) ?? [];
      if (available.some((n) => n.startsWith(model))) {
        logger.info(`Model '${model}' is available`);
        return;
      }

      logger.info(`Model '${model}' not found locally. Pulling...`);
      console.log(`Pulling Ollama model '${model}'... (this may take a few minutes on first run)`);
      try {
        execSync(`ollama pull ${model}`, { stdio: 'inherit', timeout: 600000 });
        logger.info(`Model '${model}' pulled successfully`);
      } catch (e) {
        logger.warn(`Failed to pull model '${model}': ${e}`);
      }
    }
  } catch {
    // Can't check models, skip
  }
}

async function main(): Promise<void> {
  const config = loadConfig(options.config);
  
  setupLogging({
    logDir: config.logDir,
    logLevel: config.logLevel as 'debug' | 'info' | 'warn' | 'error',
  });

  const logger = getLogger('main');

  // Ensure Ollama is running for local LLM fallback
  const ollamaEndpoint = config.ollamaEndpoint || 'http://localhost:11434';
  const ollamaModel = config.ollamaModel || 'llama3.2';
  await ensureOllamaRunning(ollamaEndpoint, ollamaModel);

  // Create orchestrator
  const orchestrator = new Orchestrator(config);

  try {
    // Handle approval queue commands
    if (options.showQueue) {
      const queue = await orchestrator.getApprovalQueue();
      if (queue.length === 0) {
        console.log('No pending approvals.');
      } else {
        console.log(`\nPending Approvals (${queue.length}):\n`);
        for (const item of queue) {
          console.log(`  ID: ${item.postId}`);
          console.log(`  Platform: ${item.post.platform}`);
          console.log(`  Content: ${item.post.content.slice(0, 100)}...`);
          console.log(`  Submitted: ${item.submittedAt.toISOString()}`);
          console.log('');
        }
      }
      orchestrator.close();
      return;
    }

    if (options.approvePost) {
      await orchestrator.approvePost(options.approvePost, true);
      console.log(`Post ${options.approvePost} approved and published.`);
      orchestrator.close();
      return;
    }

    if (options.rejectPost) {
      await orchestrator.approvePost(options.rejectPost, false);
      console.log(`Post ${options.rejectPost} rejected.`);
      orchestrator.close();
      return;
    }

    if (options.history) {
      const history = await orchestrator.getHistory(10);
      if (history.length === 0) {
        console.log('\nNo pipeline history found.\n');
      } else {
        console.log(`\nPipeline History (last ${history.length} runs):\n`);
        for (const run of history) {
          console.log(`  ID: ${run.pipelineId}`);
          console.log(`  Started: ${run.startedAt.toISOString()}`);
          console.log(`  Completed: ${run.completedAt?.toISOString() ?? 'N/A'}`);
          console.log(`  Dry Run: ${run.dryRun}`);
          console.log(`  News Items: ${run.newsItems.length}`);
          console.log(`  Posts: ${run.posts.length}`);
          console.log(`  Publish Results: ${run.publishResults.length}`);
          console.log(`  Errors: ${run.errorLog.length}`);
          console.log('');
        }
      }
      orchestrator.close();
      return;
    }

    // Parse platforms
    let platforms: Platform[] | undefined;
    if (options.platforms) {
      platforms = options.platforms.map((p: string) => {
        const platform = p.toLowerCase() as Platform;
        if (!Object.values(Platform).includes(platform)) {
          throw new Error(`Invalid platform: ${p}`);
        }
        return platform;
      });
    }

    // Parse tone
    let tone: Tone = Tone.PROFESSIONAL;
    if (options.tone) {
      const toneValue = options.tone.toLowerCase() as Tone;
      if (!Object.values(Tone).includes(toneValue)) {
        throw new Error(`Invalid tone: ${options.tone}`);
      }
      tone = toneValue;
    }

    const runOptions: RunOptions = {
      keywords: options.keywords,
      platforms,
      tone,
      dryRun: options.dryRun ?? config.dryRunMode,
      requireApproval: options.approvalMode ?? config.requireApproval,
    };

    // Handle scheduled mode
    if (options.schedule) {
      logger.info('Starting scheduled mode');
      console.log('\nStarting scheduled mode. Press Ctrl+C to stop.\n');

      // Run immediately
      await runPipeline(orchestrator, runOptions, logger);

      // Schedule at optimal times
      for (const time of config.optimalPostingTimes) {
        const [hour, minute] = time.split(':');
        const cronExpression = `${minute} ${hour} * * *`;

        cron.schedule(cronExpression, async () => {
          logger.info(`Scheduled run at ${time}`);
          await runPipeline(orchestrator, runOptions, logger);
        });

        console.log(`Scheduled run at ${time} daily`);
      }

      // Keep the process running
      process.on('SIGINT', () => {
        console.log('\nShutting down scheduler...');
        orchestrator.close();
        process.exit(0);
      });

      // Block forever
      await new Promise(() => {});
    } else if (options.interactive) {
      // Interactive mode - would use readline or similar
      console.log('Interactive mode not yet implemented. Running once with options.');
      await runPipeline(orchestrator, runOptions, logger);
      orchestrator.close();
    } else {
      // Single run mode
      await runPipeline(orchestrator, runOptions, logger);
      orchestrator.close();
    }
  } catch (error) {
    logger.error(`Fatal error: ${error instanceof Error ? error.message : error}`);
    console.error(`Error: ${error instanceof Error ? error.message : error}`);
    orchestrator.close();
    process.exit(1);
  }
}

async function runPipeline(
  orchestrator: Orchestrator,
  options: RunOptions,
  _logger: ReturnType<typeof getLogger>
): Promise<void> {
  console.log('\nStarting content pipeline...\n');

  const result = await orchestrator.runPipeline(options);

  console.log('\n=== Pipeline Results ===\n');
  console.log(`Pipeline ID: ${result.pipelineId}`);
  console.log(`News Items: ${result.newsItems.length}`);
  console.log(`Posts Generated: ${result.posts.length}`);
  console.log(`Image Sets: ${result.imageSets.length}`);
  console.log(`Publish Results: ${result.publishResults.length}`);

  if (result.errors.length > 0) {
    console.log(`\nErrors (${result.errors.length}):`);
    for (const error of result.errors) {
      console.log(`  - ${error}`);
    }
  }

  const published = result.publishResults.filter((r) => r.status === 'published').length;
  const failed = result.publishResults.filter((r) => r.status === 'failed').length;
  const pending = result.publishResults.filter((r) => r.status === 'pending_review').length;

  console.log(`\nPublishing Summary:`);
  console.log(`  Published: ${published}`);
  console.log(`  Failed: ${failed}`);
  console.log(`  Pending Review: ${pending}`);
  console.log('');
}

// Help text examples
program.addHelpText(
  'after',
  `
Examples:
  # Generate a persona (one-time setup)
  npx ts-node src/main.ts generate-persona --seed "slightly right-leaning political influencer" --save
  
  # Show the active persona
  npx ts-node src/main.ts show-persona
  
  # Run once in dry-run mode (uses active persona)
  npx ts-node src/main.ts --dry-run
  
  # Run with specific keywords
  npx ts-node src/main.ts --keywords "AI" "technology" "startups"
  
  # Run with scheduler
  npx ts-node src/main.ts --schedule
  
  # Show approval queue
  npx ts-node src/main.ts --show-queue
  
  # Approve a post
  npx ts-node src/main.ts --approve-post abc123
`
);

main().catch(console.error);
