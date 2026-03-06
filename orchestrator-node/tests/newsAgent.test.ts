/**
 * Unit tests for NewsAgent.
 */

import { NewsAgent } from '../src/agents/newsAgent';
import { loadConfig } from '../src/config';
import { RateLimiter } from '../src/utils';

describe('NewsAgent', () => {
  let agent: NewsAgent;
  let rateLimiter: RateLimiter;

  beforeEach(() => {
    const config = loadConfig();
    rateLimiter = new RateLimiter();
    agent = new NewsAgent(config, rateLimiter);
  });

  describe('constructor', () => {
    it('should create agent with correct name', () => {
      expect(agent.name).toBe('news_agent');
    });

    it('should have pending status initially', () => {
      expect(agent.status).toBe('pending');
    });
  });

  describe('extractKeywords', () => {
    it('should extract keywords from text', () => {
      // Access private method for testing
      const text = 'The quick brown fox jumps over the lazy dog';
      const keywords = (agent as any).extractKeywords(text);

      expect(keywords).toContain('quick');
      expect(keywords).toContain('brown');
      expect(keywords).toContain('fox');
      expect(keywords).toContain('jumps');
      expect(keywords).toContain('lazy');
      expect(keywords).toContain('dog');
      // Should not contain stopwords
      expect(keywords).not.toContain('the');
      expect(keywords).not.toContain('over');
    });

    it('should return max 10 keywords', () => {
      const text = 'apple banana cherry date elderberry fig grape honeydew kiwi lemon mango nectarine orange papaya';
      const keywords = (agent as any).extractKeywords(text);

      expect(keywords.length).toBeLessThanOrEqual(10);
    });

    it('should remove duplicate keywords', () => {
      const text = 'apple apple banana banana cherry';
      const keywords = (agent as any).extractKeywords(text);

      const uniqueKeywords = new Set(keywords);
      expect(keywords.length).toBe(uniqueKeywords.size);
    });
  });

  describe('applyFilters', () => {
    it('should filter by keywords', () => {
      const newsItems = [
        {
          topic: 'AI breakthrough in technology',
          source: 'Test',
          url: 'https://example.com/1',
          summary: 'AI is advancing',
          keywords: ['ai', 'technology'],
          timestamp: new Date(),
          relevanceScore: 0.8,
        },
        {
          topic: 'Sports championship results',
          source: 'Test',
          url: 'https://example.com/2',
          summary: 'Team wins big',
          keywords: ['sports'],
          timestamp: new Date(),
          relevanceScore: 0.7,
        },
      ];

      const filtered = (agent as any).applyFilters(newsItems, ['AI']);

      expect(filtered.length).toBe(1);
      expect(filtered[0].topic).toContain('AI');
    });

    it('should filter old news', () => {
      const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
      const newsItems = [
        {
          topic: 'Old news',
          source: 'Test',
          url: 'https://example.com/1',
          summary: 'Old content',
          keywords: [],
          timestamp: twoDaysAgo,
          relevanceScore: 0.8,
        },
        {
          topic: 'New news',
          source: 'Test',
          url: 'https://example.com/2',
          summary: 'New content',
          keywords: [],
          timestamp: new Date(),
          relevanceScore: 0.7,
        },
      ];

      const filtered = (agent as any).applyFilters(newsItems);

      expect(filtered.length).toBe(1);
      expect(filtered[0].topic).toBe('New news');
    });

    it('should deduplicate similar topics', () => {
      const newsItems = [
        {
          topic: 'Breaking news about technology advances',
          source: 'Test1',
          url: 'https://example.com/1',
          summary: 'Summary 1',
          keywords: [],
          timestamp: new Date(),
          relevanceScore: 0.8,
        },
        {
          topic: 'Breaking news about technology advances',
          source: 'Test2',
          url: 'https://example.com/2',
          summary: 'Summary 2',
          keywords: [],
          timestamp: new Date(),
          relevanceScore: 0.7,
        },
      ];

      const filtered = (agent as any).applyFilters(newsItems);

      expect(filtered.length).toBe(1);
    });
  });
});
