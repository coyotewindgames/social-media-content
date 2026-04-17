/**
 * Data models and types for the social media content orchestrator.
 */

// Supported social media platforms
export enum Platform {
  TWITTER = 'twitter',
  LINKEDIN = 'linkedin',
  INSTAGRAM = 'instagram',
  FACEBOOK = 'facebook',
  TIKTOK = 'tiktok',
}

// Content tone options
/** @deprecated Persona voice replaces Tone. Kept for backward compatibility. */
export enum Tone {
  CASUAL = 'casual',
  PROFESSIONAL = 'professional',
  PLAYFUL = 'playful',
  INSPIRATIONAL = 'inspirational',
  INFORMATIVE = 'informative',
}

// ─── Persona Types ───────────────────────────────────────────────────────────

export interface PersonaVoice {
  tone: string;                     // e.g. "conversational, confident, slightly sardonic"
  vocabulary_level: string;         // e.g. "accessible everyday language"
  sentence_style: string;           // e.g. "short punchy sentences, rhetorical questions"
  rhetorical_devices: string[];     // e.g. ["irony", "understatement", "analogy"]
  humor_style: string;              // e.g. "dry wit, absurdist comparisons"
}

export interface PersonaBeliefs {
  core_values: string[];            // e.g. ["individual liberty", "free markets"]
  worldview: string;                // 1-2 sentence summary
  policy_leanings: string;          // e.g. "fiscally conservative, socially moderate"
  red_lines: string[];              // positions this persona NEVER endorses
}

export interface PersonaStyleRules {
  emoji_usage: string;              // e.g. "minimal — max 1 per post"
  hashtag_style: string;            // e.g. "1-3 per post, original or issue-based"
  cta_patterns: string[];           // e.g. ["What do you think?", "Agree or disagree?"]
  signature_phrases: string[];      // recurring catchphrases
  opening_patterns: string[];       // how posts typically start
}

export interface PersonaProfile {
  id: string;                       // UUID from Supabase
  name: string;                     // Always "Allen Sharpe"
  isActive: boolean;
  voice: PersonaVoice;
  beliefs: PersonaBeliefs;
  styleRules: PersonaStyleRules;
  taboos: string[];                 // hard-banned topics/phrases
  examplePosts: string[];           // 3-5 gold-standard example posts
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface PostHistoryEntry {
  id: string;
  personaId: string;
  platform: string;
  content: string;
  topicSummary?: string;
  hashtags: string[];
  newsSourceUrl?: string;
  contentHash: string;
  createdAt: Date;
}

// Agent execution status
export enum AgentStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  SUCCESS = 'success',
  FAILED = 'failed',
  RETRYING = 'retrying',
}

// Publishing status options
export enum PublishStatus {
  QUEUED = 'queued',
  PUBLISHED = 'published',
  FAILED = 'failed',
  PENDING_REVIEW = 'pending_review',
  SCHEDULED = 'scheduled',
}

// Structured data from news retrieval agent
export interface NewsItem {
  topic: string;
  source: string;
  url: string;
  summary: string;
  keywords: string[];
  timestamp: Date;
  relevanceScore: number;
  postworthinessScore?: number;
  rankingReason?: string;
}

// Instagram carousel slide
export interface CarouselSlide {
  slideNumber: number;
  text: string;
  imagePrompt: string;
}

// Generated social media post content
export interface SocialPost {
  postId: string;
  content: string;
  platform: Platform;
  hashtags: string[];
  imagePrompt?: string;
  /** @deprecated Use persona voice instead. Kept for backward compat. */
  tone?: Tone;
  callToAction?: string;
  characterCount: number;
  newsSource?: string;
  generatedBy?: string;
  personaId?: string;
  /** Instagram carousel slides. When present, each slide gets its own image. */
  carouselSlides?: CarouselSlide[];
  /** GPT-5.3 refined version of content. Preferred over `content` by downstream agents. */
  refinedContent?: string;
  /** Brief explanation of improvements made during refinement. */
  refinementNotes?: string;
  /** The user-provided instruction that produced the refinement. */
  refinementPrompt?: string;
  createdAt: Date;
}

// Image dimension specifications
export interface ImageDimensions {
  width: number;
  height: number;
}

// Generated image data from image agent
export interface GeneratedImage {
  url: string;
  format: string;
  dimensions: ImageDimensions;
  altText?: string;
}

// Collection of images for a post
export interface ImageSet {
  postId: string;
  images: GeneratedImage[];
  createdAt: Date;
}

// Result from publishing agent
export interface PublishResult {
  postId: string;
  platform: Platform;
  status: PublishStatus;
  postUrl?: string;
  errorMessage?: string;
  retryCount: number;
  publishedAt?: Date;
}

// Overall pipeline execution state
export interface PipelineState {
  pipelineId: string;
  startedAt: Date;
  completedAt?: Date;
  persona?: PersonaProfile;
  recentPosts?: PostHistoryEntry[];
  newsItems: NewsItem[];
  posts: SocialPost[];
  imageSets: ImageSet[];
  publishResults: PublishResult[];
  currentAgent?: string;
  agentStatuses: Record<string, AgentStatus>;
  errorLog: string[];
  dryRun: boolean;
}

// Content approval queue item
export interface ContentApproval {
  postId: string;
  post: SocialPost;
  images?: ImageSet;
  approvalStatus: 'pending' | 'approved' | 'rejected';
  reviewerNotes?: string;
  submittedAt: Date;
  reviewedAt?: Date;
}

// Platform-specific constraints
export const PLATFORM_LIMITS: Record<Platform, { maxChars: number; maxHashtags: number; imageRequired: boolean }> = {
  [Platform.TWITTER]: { maxChars: 280, maxHashtags: 5, imageRequired: false },
  [Platform.LINKEDIN]: { maxChars: 3000, maxHashtags: 5, imageRequired: false },
  [Platform.INSTAGRAM]: { maxChars: 2200, maxHashtags: 30, imageRequired: true },
  [Platform.FACEBOOK]: { maxChars: 63206, maxHashtags: 10, imageRequired: false },
  [Platform.TIKTOK]: { maxChars: 2200, maxHashtags: 10, imageRequired: true },
};

// Platform-specific image dimensions
export const PLATFORM_DIMENSIONS: Record<Platform, ImageDimensions[]> = {
  [Platform.TWITTER]: [
    { width: 1200, height: 675 },
    { width: 1200, height: 1200 },
  ],
  [Platform.LINKEDIN]: [
    { width: 1200, height: 627 },
    { width: 1200, height: 1200 },
  ],
  [Platform.INSTAGRAM]: [
    { width: 1080, height: 1080 },
    { width: 1080, height: 1350 },
    { width: 1080, height: 1920 },
  ],
  [Platform.FACEBOOK]: [
    { width: 1200, height: 630 },
    { width: 1200, height: 1200 },
  ],
  [Platform.TIKTOK]: [
    { width: 1080, height: 1920 },
  ],
};

// Helper function to validate post length
export function validatePostLength(content: string, platform: Platform): boolean {
  const limit = PLATFORM_LIMITS[platform]?.maxChars ?? 280;
  return content.length <= limit;
}

// Helper function to create a SocialPost with auto-calculated character count
export function createSocialPost(data: Omit<SocialPost, 'characterCount'>): SocialPost {
  return {
    ...data,
    characterCount: data.content.length,
  };
}
