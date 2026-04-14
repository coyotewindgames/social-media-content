/**
 * Tests for persona-aware ranking in RankingAgent.
 */

import { RankingAgent } from '../src/agents/rankingAgent';
import { loadConfig } from '../src/config';
import { NewsItem, PersonaProfile } from '../src/models';
import { RateLimiter } from '../src/utils';

describe('RankingAgent', () => {
  let agent: RankingAgent;

  const mockPersona: PersonaProfile = {
    id: 'test-id',
    name: 'Allen Sharpe',
    isActive: true,
    voice: {
      tone: 'conversational, confident, slightly sardonic',
      vocabulary_level: 'accessible everyday language',
      sentence_style: 'short punchy sentences, rhetorical questions',
      rhetorical_devices: ['irony', 'analogy'],
      humor_style: 'dry wit',
    },
    beliefs: {
      core_values: ['individual liberty', 'free markets', 'limited government'],
      worldview: 'Personal freedom is the bedrock of prosperity.',
      policy_leanings: 'fiscally conservative, socially moderate',
      red_lines: ['authoritarianism', 'censorship'],
    },
    styleRules: {
      emoji_usage: 'minimal',
      hashtag_style: '1-3 per post',
      cta_patterns: ['What do you think?'],
      signature_phrases: ['Just saying.'],
      opening_patterns: ['Here we go again…'],
    },
    taboos: ['slurs', 'incitement to violence', 'harassment', 'doxxing'],
    examplePosts: ['Sample post.'],
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockCandidates: NewsItem[] = Array.from({ length: 5 }, (_, i) => ({
    topic: `Test Article ${i + 1}`,
    source: 'Test Source',
    url: `https://example.com/${i}`,
    summary: `Summary of article ${i + 1}`,
    keywords: ['test', 'news'],
    timestamp: new Date(),
    relevanceScore: 0.5 + i * 0.1,
  }));

  beforeEach(() => {
    const config = loadConfig();
    const rateLimiter = new RateLimiter();
    agent = new RankingAgent(config, rateLimiter);
  });

  describe('constructor', () => {
    it('should create agent with correct name', () => {
      expect(agent.name).toBe('ranking_agent');
    });

    it('should have pending status initially', () => {
      expect(agent.status).toBe('pending');
    });
  });

  describe('buildPrompt (persona-aware)', () => {
    // Access private method via casting
    const build = (agent: RankingAgent, candidates: NewsItem[], topN: number, persona?: PersonaProfile) =>
      (agent as any).buildPrompt(candidates, topN, persona);

    it('should produce generic prompt when no persona is provided', () => {
      const prompt = build(agent, mockCandidates, 3);
      expect(prompt).toContain('social media content strategist');
      expect(prompt).toContain('Timeliness & urgency');
      expect(prompt).toContain('Broad appeal');
      expect(prompt).not.toContain('Allen Sharpe');
    });

    it('should produce persona-specific prompt when persona is provided', () => {
      const prompt = build(agent, mockCandidates, 3, mockPersona);
      expect(prompt).toContain('Allen Sharpe');
      expect(prompt).toContain('individual liberty');
      expect(prompt).toContain('fiscally conservative');
      expect(prompt).toContain('Alignment with beliefs');
    });

    it('should include persona worldview in prompt', () => {
      const prompt = build(agent, mockCandidates, 3, mockPersona);
      expect(prompt).toContain('Personal freedom is the bedrock');
    });

    it('should include persona voice tone in prompt', () => {
      const prompt = build(agent, mockCandidates, 3, mockPersona);
      expect(prompt).toContain('conversational, confident');
    });

    it('should include taboos in persona prompt', () => {
      const prompt = build(agent, mockCandidates, 3, mockPersona);
      expect(prompt).toContain('slurs');
      expect(prompt).toContain('incitement to violence');
      expect(prompt).toContain('Taboo check');
    });

    it('should include article list in both prompt types', () => {
      const generic = build(agent, mockCandidates, 3);
      const persona = build(agent, mockCandidates, 3, mockPersona);
      for (const prompt of [generic, persona]) {
        expect(prompt).toContain('[0]');
        expect(prompt).toContain('Test Article 1');
        expect(prompt).toContain('Test Article 5');
      }
    });

    it('should request correct number of results', () => {
      const prompt = build(agent, mockCandidates, 2, mockPersona);
      expect(prompt).toContain('exactly 2 articles');
    });

    it('should include persona-specific scoring criteria', () => {
      const prompt = build(agent, mockCandidates, 3, mockPersona);
      expect(prompt).toContain('Opinion potential');
      expect(prompt).toContain('Audience resonance');
      expect(prompt).not.toContain('Broad appeal');
    });
  });

  describe('buildSystemMessage', () => {
    const buildSys = (agent: RankingAgent, persona?: PersonaProfile) =>
      (agent as any).buildSystemMessage(persona);

    it('should return generic system message without persona', () => {
      const msg = buildSys(agent);
      expect(msg).toContain('social media strategist');
      expect(msg).not.toContain('Allen Sharpe');
    });

    it('should return persona-aware system message with persona', () => {
      const msg = buildSys(agent, mockPersona);
      expect(msg).toContain('Allen Sharpe');
      expect(msg).toContain('content curator');
    });
  });

  describe('fallbackRank', () => {
    const fallback = (agent: RankingAgent, candidates: NewsItem[], topN: number) =>
      (agent as any).fallbackRank(candidates, topN);

    it('should return topN items sorted by relevance + recency', () => {
      const result = fallback(agent, mockCandidates, 2);
      expect(result).toHaveLength(2);
      // Higher relevanceScore items should rank higher
      expect(result[0].relevanceScore).toBeGreaterThanOrEqual(result[1].relevanceScore);
    });

    it('should add postworthinessScore to results', () => {
      const result = fallback(agent, mockCandidates, 3);
      for (const item of result) {
        expect(item.postworthinessScore).toBeDefined();
        expect(typeof item.postworthinessScore).toBe('number');
      }
    });
  });

  describe('execute with few candidates', () => {
    it('should skip ranking when candidates <= maxPostsPerRun', () => {
      const config = loadConfig();
      config.maxPostsPerRun = 5;
      const a = new RankingAgent(config, new RateLimiter());

      // Testing via execute directly - with 3 candidates and max 5, should return all
      return a.execute(mockCandidates.slice(0, 3)).then((result) => {
        expect(result).toHaveLength(3);
      });
    });
  });
});
