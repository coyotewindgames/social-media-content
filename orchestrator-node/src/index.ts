/**
 * Social Media Content Orchestrator - Node.js/TypeScript Implementation
 * 
 * This module provides a production-ready orchestrator system that manages
 * 4 specialized agents for automated social media content generation and publishing.
 */

export { Orchestrator, type PipelineResult, type RunOptions } from './orchestrator';
export { Config, loadConfig, validateConfig, maskSecrets } from './config';
export {
  Platform,
  Tone,
  AgentStatus,
  PublishStatus,
  type NewsItem,
  type SocialPost,
  type ImageSet,
  type GeneratedImage,
  type ImageDimensions,
  type PublishResult,
  type PipelineState,
  type ContentApproval,
  PLATFORM_LIMITS,
  PLATFORM_DIMENSIONS,
  validatePostLength,
  createSocialPost,
} from './models';
export {
  NewsAgent,
  ContentAgent,
  ImageAgent,
  PublishAgent,
  BaseAgent,
} from './agents';
export {
  getLogger,
  setupLogging,
  closeAllLoggers,
  RateLimiter,
  ResponseCache,
  sleep,
  retryWithBackoff,
  makeApiRequest,
} from './utils';
export {
  Provider,
  ProviderErrorType,
  ProviderError,
  type GenerationOptions,
  type ProviderResult,
  generateWithFallback,
  detectErrorType,
  shouldFallback,
  testProviderConnection,
  getAvailableProviders,
} from './providerFallback';
