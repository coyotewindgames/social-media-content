/**
 * Tests for persona parsing and consistency logic in PersonaAgent.
 */

import { PersonaAgent } from '../src/agents/personaAgent';
import { loadConfig } from '../src/config';
import { RateLimiter } from '../src/utils';

describe('PersonaAgent', () => {
  let agent: PersonaAgent;

  beforeEach(() => {
    const config = loadConfig();
    const rateLimiter = new RateLimiter();
    agent = new PersonaAgent(config, rateLimiter);
  });

  describe('constructor', () => {
    it('should create agent with correct name', () => {
      expect(agent.name).toBe('persona_agent');
    });

    it('should have pending status initially', () => {
      expect(agent.status).toBe('pending');
    });
  });

  describe('default persona seed', () => {
    it('should have a default persona seed configured', () => {
      const config = loadConfig();
      expect(config.defaultPersonaSeed).toBeDefined();
      expect(config.defaultPersonaSeed.length).toBeGreaterThan(50);
    });

    it('should mention critical/leadership in the default seed', () => {
      const config = loadConfig();
      const seed = config.defaultPersonaSeed.toLowerCase();
      expect(seed).toMatch(/critical|scrutinize/);
      expect(seed).toMatch(/leadership|leader/);
    });
  });

  describe('parsePersonaResponse', () => {
    const validPayload = JSON.stringify({
      name: 'Allen Sharpe',
      voice: {
        tone: 'conversational, confident',
        vocabulary_level: 'everyday language',
        sentence_style: 'short punchy sentences',
        rhetorical_devices: ['irony', 'analogy'],
        humor_style: 'dry wit',
      },
      beliefs: {
        core_values: ['individual liberty', 'free markets'],
        worldview: 'Personal freedom is the foundation of prosperity.',
        policy_leanings: 'fiscally conservative, socially moderate',
        red_lines: ['authoritarianism'],
      },
      style_rules: {
        emoji_usage: 'minimal — max 1 per post',
        hashtag_style: '1-3 per post',
        cta_patterns: ['What do you think?'],
        signature_phrases: ['Just saying.'],
        opening_patterns: ['Here we go again…'],
      },
      taboos: ['conspiracy theories'],
      example_posts: ['Sample post about economics.'],
    });

    // Access the private method via casting
    const parse = (agent: PersonaAgent, raw: string) =>
      (agent as any).parsePersonaResponse(raw);

    it('should parse a valid persona response', () => {
      const persona = parse(agent, validPayload);
      expect(persona.name).toBe('Allen Sharpe');
      expect(persona.isActive).toBe(true);
      expect(persona.voice.tone).toBe('conversational, confident');
      expect(persona.beliefs.core_values).toContain('individual liberty');
      expect(persona.styleRules.cta_patterns).toContain('What do you think?');
      expect(persona.examplePosts).toHaveLength(1);
    });

    it('should always include mandatory taboos', () => {
      const persona = parse(agent, validPayload);
      expect(persona.taboos).toContain('slurs');
      expect(persona.taboos).toContain('incitement to violence');
      expect(persona.taboos).toContain('harassment');
      expect(persona.taboos).toContain('doxxing');
    });

    it('should merge user taboos with mandatory taboos', () => {
      const persona = parse(agent, validPayload);
      expect(persona.taboos).toContain('conspiracy theories');
      // No duplicates
      const unique = new Set(persona.taboos);
      expect(unique.size).toBe(persona.taboos.length);
    });

    it('should fill defaults for missing optional voice fields', () => {
      const minimal = JSON.stringify({
        name: 'Test Persona',
        voice: { tone: 'casual' },
        beliefs: { core_values: ['truth'] },
        style_rules: { hashtag_style: '2 per post' },
      });
      const persona = parse(agent, minimal);
      expect(persona.voice.vocabulary_level).toBe('accessible');
      expect(persona.voice.sentence_style).toBe('clear and direct');
      // Voice fields are hardcoded for Allen Sharpe
      expect(persona.voice.rhetorical_devices).toEqual(['emotional', 'credible']);
      expect(persona.voice.humor_style).toBe('edgy');
    });

    it('should fill defaults for missing optional beliefs fields', () => {
      const minimal = JSON.stringify({
        name: 'Test Persona',
        voice: { tone: 'casual' },
        beliefs: { worldview: 'The world is complex.' },
        style_rules: { hashtag_style: '2 per post' },
      });
      const persona = parse(agent, minimal);
      // Beliefs are hardcoded for Allen Sharpe
      expect(persona.beliefs.core_values).toEqual(['individual liberty', 'free markets', 'limited government']);
      expect(persona.beliefs.policy_leanings).toBe('fiscally conservative, socially moderate');
      expect(persona.beliefs.red_lines).toEqual(['authoritarianism', 'censorship', 'socialism', 'woke ideology']);
    });

    it('should reject response missing required fields', () => {
      const noName = JSON.stringify({
        voice: { tone: 'casual' },
        beliefs: { worldview: 'test' },
        style_rules: { hashtag_style: '2 per post' },
      });
      expect(() => parse(agent, noName)).toThrow('missing required fields');
    });

    it('should reject response missing voice', () => {
      const noVoice = JSON.stringify({
        name: 'Test',
        beliefs: { worldview: 'test' },
        style_rules: { hashtag_style: '2 per post' },
      });
      expect(() => parse(agent, noVoice)).toThrow('missing required fields');
    });

    it('should reject invalid JSON', () => {
      expect(() => parse(agent, 'not json at all')).toThrow();
    });

    it('should produce consistent structure across multiple parses', () => {
      const persona1 = parse(agent, validPayload);
      const persona2 = parse(agent, validPayload);
      // Same input should produce structurally identical output
      expect(persona1.name).toBe(persona2.name);
      expect(persona1.voice).toEqual(persona2.voice);
      expect(persona1.beliefs).toEqual(persona2.beliefs);
      expect(persona1.styleRules).toEqual(persona2.styleRules);
      expect(persona1.taboos).toEqual(persona2.taboos);
    });

    it('should set id to empty string (assigned by DB)', () => {
      const persona = parse(agent, validPayload);
      expect(persona.id).toBe('');
    });

    it('should set createdAt and updatedAt to Date objects', () => {
      const persona = parse(agent, validPayload);
      expect(persona.createdAt).toBeInstanceOf(Date);
      expect(persona.updatedAt).toBeInstanceOf(Date);
    });
  });
});
