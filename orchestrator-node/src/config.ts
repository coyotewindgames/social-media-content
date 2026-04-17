/**
 * Configuration management for the orchestrator.
 */

import * as fs from 'fs';
import * as path from 'path';

export interface Config {
  // NewsAPI
  newsapiKey?: string;

  // Twitter/X API
  twitterBearerToken?: string;
  twitterAccessToken?: string;
  twitterAccessSecret?: string;
  twitterApiKey?: string;
  twitterApiSecret?: string;

  // LinkedIn API
  linkedinAccessToken?: string;
  linkedinClientId?: string;
  linkedinClientSecret?: string;

  // Instagram API (via Facebook Graph API)
  instagramAccessToken?: string;
  instagramBusinessId?: string;

  // Facebook API
  facebookAccessToken?: string;
  facebookPageId?: string;

  // OpenAI API (for GPT-4 and DALL-E)
  openaiApiKey?: string;

  // Anthropic API (for Claude)
  anthropicApiKey?: string;

  // Stability AI (for Stable Diffusion)
  stabilityApiKey?: string;

  // Grok/xAI (for Grok image generation)
  xaiApiKey?: string;

  // Ollama (local LLM fallback)
  ollamaEndpoint?: string;
  ollamaModel?: string;

  // Reddit API (optional for authenticated requests)
  redditClientId?: string;
  redditClientSecret?: string;

  // Supabase settings
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  supabaseServiceRoleKey?: string;

  // Pipeline settings
  postsPerNewsItem: number;
  imagesPerPost: number;
  maxPostsPerRun: number;
  maxCandidateArticles: number;
  postHistoryWindow: number;
  defaultPersonaSeed: string;

  // Scheduling settings
  scheduleEnabled: boolean;
  scheduleIntervalHours: number;
  optimalPostingTimes: string[];
  staggerDelaySeconds: number;

  // Platform preferences
  enabledPlatforms: string[];
  defaultTone: string;

  // Content filters
  blockedKeywords: string[];
  requiredKeywords: string[];
  contentCategories: string[];

  // Logging settings
  logLevel: string;
  logDir: string;

  // Feature flags
  dryRunMode: boolean;
  requireApproval: boolean;
  enableAnalytics: boolean;
  autoRefineEnabled: boolean;
  autoRefinePrompt: string;
}

const defaultConfig: Config = {
  // Pipeline settings
  postsPerNewsItem: 1,
  imagesPerPost: 1,
  maxPostsPerRun: 3,
  maxCandidateArticles: 20,
  postHistoryWindow: 25,
  defaultPersonaSeed: 'A persona named Allen Sharpe — a sharp-tongued, highly critical political commentator who relentlessly scrutinizes leadership decisions from government officials to corporate executives. Uses biting sarcasm, pointed rhetorical questions, and edgy takes to call out hypocrisy, incompetence, and double standards in positions of power. Slightly right-leaning but will roast any leader regardless of party when they make bad calls. Everyday accessible language, no academic jargon. Thinks most politicians are self-serving and is not afraid to say it.',

  // Scheduling settings
  scheduleEnabled: true,
  scheduleIntervalHours: 6,
  optimalPostingTimes: ['09:00', '12:00', '17:00', '20:00'],
  staggerDelaySeconds: 30,

  // Platform preferences
  enabledPlatforms: ['twitter'],
  defaultTone: 'professional',

  // Content filters
  blockedKeywords: [],
  requiredKeywords: [],
  contentCategories: ['technology', 'business', 'news'],

  // Logging settings
  logLevel: 'info',
  logDir: 'logs',

  // Feature flags
  dryRunMode: false,
  requireApproval: false,
  enableAnalytics: true,
  autoRefineEnabled: false,
  autoRefinePrompt: 'Improve clarity, flow, and impact while preserving the original voice and message.',
};

/**
 * Load configuration from environment variables and optional config file.
 */
export function loadConfig(configFile?: string): Config {
  const config: Config = { ...defaultConfig };

  // Load from environment variables
  config.newsapiKey = process.env.NEWSAPI_KEY;
  config.twitterBearerToken = process.env.TWITTER_BEARER_TOKEN;
  config.twitterAccessToken = process.env.TWITTER_ACCESS_TOKEN;
  config.twitterAccessSecret = process.env.TWITTER_ACCESS_SECRET;
  config.twitterApiKey = process.env.TWITTER_API_KEY;
  config.twitterApiSecret = process.env.TWITTER_API_SECRET;
  config.linkedinAccessToken = process.env.LINKEDIN_ACCESS_TOKEN;
  config.linkedinClientId = process.env.LINKEDIN_CLIENT_ID;
  config.linkedinClientSecret = process.env.LINKEDIN_CLIENT_SECRET;
  config.instagramAccessToken = process.env.INSTAGRAM_ACCESS_TOKEN;
  config.instagramBusinessId = process.env.INSTAGRAM_BUSINESS_ID;
  config.facebookAccessToken = process.env.FACEBOOK_ACCESS_TOKEN;
  config.facebookPageId = process.env.FACEBOOK_PAGE_ID;
  config.openaiApiKey = process.env.OPENAI_API_KEY;
  config.anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  config.stabilityApiKey = process.env.STABILITY_API_KEY;
  config.xaiApiKey = process.env.XAI_API_KEY;
  config.ollamaEndpoint = process.env.OLLAMA_ENDPOINT || 'http://localhost:11434';
  config.ollamaModel = process.env.OLLAMA_MODEL || 'llama3.2';
  config.redditClientId = process.env.REDDIT_CLIENT_ID;
  config.redditClientSecret = process.env.REDDIT_CLIENT_SECRET;

  // Supabase settings
  config.supabaseUrl = process.env.SUPABASE_URL;
  config.supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  config.supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // Environment overrides for settings
  if (process.env.LOG_LEVEL) config.logLevel = process.env.LOG_LEVEL;
  if (process.env.LOG_DIR) config.logDir = process.env.LOG_DIR;
  if (process.env.DRY_RUN === 'true') config.dryRunMode = true;
  if (process.env.REQUIRE_APPROVAL === 'true') config.requireApproval = true;
  if (process.env.AUTO_REFINE_ENABLED === 'true') config.autoRefineEnabled = true;
  if (process.env.AUTO_REFINE_PROMPT) config.autoRefinePrompt = process.env.AUTO_REFINE_PROMPT;
  if (process.env.MAX_CANDIDATE_ARTICLES) config.maxCandidateArticles = parseInt(process.env.MAX_CANDIDATE_ARTICLES, 10);

  // Load from config file if exists
  const configPath = configFile || findConfigFile();
  if (configPath && fs.existsSync(configPath)) {
    try {
      const fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      // Merge non-credential settings using a pattern to identify sensitive keys
      const credentialPattern = /Key$|Token$|Secret$|^supabase/i;
      for (const [key, value] of Object.entries(fileConfig)) {
        if (!credentialPattern.test(key)) {
          (config as unknown as Record<string, unknown>)[key] = value;
        }
      }
    } catch (err) {
      console.warn(`Warning: Could not load config file: ${err}`);
    }
  }

  return config;
}

/**
 * Find default config file location.
 */
function findConfigFile(): string | undefined {
  const locations = [
    'config.json',
    'orchestrator-node/config.json',
    path.join(process.env.HOME || '', '.config/social-media-orchestrator/config.json'),
  ];

  for (const loc of locations) {
    if (fs.existsSync(loc)) {
      return loc;
    }
  }

  return undefined;
}

/**
 * Validate configuration and return warnings.
 */
export function validateConfig(config: Config): string[] {
  const warnings: string[] = [];

  // Check for Supabase configuration
  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    warnings.push('Supabase not configured. Database features will be disabled.');
  }

  // Check for at least one news source
  if (!config.newsapiKey && !config.redditClientId) {
    warnings.push('No news API keys configured. Will use free Reddit/HackerNews endpoints only.');
  }

  // Check for at least one LLM
  if (!config.openaiApiKey && !config.anthropicApiKey) {
    warnings.push('No LLM API keys configured. Will use template-based content generation.');
  }

  // Check for at least one image generator
  if (!config.openaiApiKey && !config.stabilityApiKey) {
    warnings.push('No image generation API keys configured. Will use stock images.');
  }

  // Check for at least one publishing platform
  const hasPublishing =
    config.twitterAccessToken ||
    config.linkedinAccessToken ||
    config.instagramAccessToken ||
    config.facebookAccessToken;

  if (!hasPublishing) {
    warnings.push('No publishing credentials configured. Running in dry-run mode only.');
  }

  return warnings;
}

/**
 * Mask secrets in config for logging.
 */
export function maskSecrets(config: Config): Record<string, unknown> {
  const masked: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(config)) {
    if (key.includes('Key') || key.includes('Token') || key.includes('Secret')) {
      masked[key] = value ? '***' : undefined;
    } else {
      masked[key] = value;
    }
  }

  return masked;
}
