/**
 * Unit tests for ContentAgent.
 */

import { ContentAgent } from '../src/agents/contentAgent';
import { loadConfig } from '../src/config';
import { Platform, Tone, NewsItem } from '../src/models';
import { RateLimiter } from '../src/utils';

describe('ContentAgent', () => {
  let agent: ContentAgent;
  let rateLimiter: RateLimiter;

  beforeEach(() => {
    const config = loadConfig();
    rateLimiter = new RateLimiter();
    agent = new ContentAgent(config, rateLimiter);
  });

  describe('constructor', () => {
    it('should create agent with correct name', () => {
      expect(agent.name).toBe('content_agent');
    });

    it('should have pending status initially', () => {
      expect(agent.status).toBe('pending');
    });
  });

  describe('generateTemplatePost', () => {
    const mockNewsItem: NewsItem = {
      topic: 'AI Breakthrough in Healthcare',
      source: 'Test Source',
      url: 'https://example.com/news/1',
      summary: 'A new AI system has been developed for healthcare.',
      keywords: ['ai', 'healthcare', 'technology'],
      timestamp: new Date(),
      relevanceScore: 0.9,
    };

    it('should generate post with correct platform', () => {
      const post = (agent as any).generateTemplatePost(
        mockNewsItem,
        Platform.TWITTER,
        Tone.PROFESSIONAL
      );

      expect(post.platform).toBe(Platform.TWITTER);
    });

    it('should generate post with correct tone', () => {
      const post = (agent as any).generateTemplatePost(
        mockNewsItem,
        Platform.LINKEDIN,
        Tone.CASUAL
      );

      expect(post.tone).toBe(Tone.CASUAL);
    });

    it('should include hashtags from keywords', () => {
      const post = (agent as any).generateTemplatePost(
        mockNewsItem,
        Platform.TWITTER,
        Tone.PROFESSIONAL
      );

      expect(post.hashtags.length).toBeGreaterThan(0);
      expect(post.hashtags).toContain('ai');
    });

    it('should generate image prompt', () => {
      const post = (agent as any).generateTemplatePost(
        mockNewsItem,
        Platform.INSTAGRAM,
        Tone.PROFESSIONAL
      );

      expect(post.imagePrompt).toBeDefined();
      expect(post.imagePrompt.length).toBeGreaterThan(0);
    });

    it('should include news source URL', () => {
      const post = (agent as any).generateTemplatePost(
        mockNewsItem,
        Platform.TWITTER,
        Tone.PROFESSIONAL
      );

      expect(post.newsSource).toBe(mockNewsItem.url);
    });
  });

  describe('truncatePost', () => {
    it('should truncate long content', () => {
      const longPost = {
        postId: 'test-id',
        content: 'A'.repeat(300),
        platform: Platform.TWITTER,
        hashtags: ['test'],
        tone: Tone.PROFESSIONAL,
        characterCount: 300,
        createdAt: new Date(),
      };

      const truncated = (agent as any).truncatePost(longPost, 280);

      expect(truncated.content.length).toBeLessThanOrEqual(280);
      expect(truncated.content).toContain('...');
    });

    it('should not truncate short content', () => {
      const shortPost = {
        postId: 'test-id',
        content: 'Short content',
        platform: Platform.TWITTER,
        hashtags: ['test'],
        tone: Tone.PROFESSIONAL,
        characterCount: 13,
        createdAt: new Date(),
      };

      const result = (agent as any).truncatePost(shortPost, 280);

      expect(result.content).toBe(shortPost.content);
    });

    it('should reduce hashtags when truncating', () => {
      const longPost = {
        postId: 'test-id',
        content: 'A'.repeat(300),
        platform: Platform.TWITTER,
        hashtags: ['one', 'two', 'three', 'four', 'five'],
        tone: Tone.PROFESSIONAL,
        characterCount: 300,
        createdAt: new Date(),
      };

      const truncated = (agent as any).truncatePost(longPost, 280);

      expect(truncated.hashtags.length).toBeLessThanOrEqual(3);
    });
  });
});
