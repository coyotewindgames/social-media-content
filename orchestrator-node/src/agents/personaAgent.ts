/**
 * Persona Agent - Generates structured persona profiles via LLM.
 * Uses the same OpenAI → Anthropic → Ollama fallback cascade as other agents.
 */

import { BaseAgent } from './baseAgent';
import { Config } from '../config';
import { PersonaProfile, PersonaVoice, PersonaBeliefs, PersonaStyleRules } from '../models';
import { RateLimiter, retryWithBackoff } from '../utils';

const PERSONA_SCHEMA_DESCRIPTION = `{
  "name": "<persona name>",
  "voice": {
    "tone": "<e.g., conversational, confident, slightly sardonic>",
    "vocabulary_level": "<e.g., accessible, avoids jargon>",
    "sentence_style": "<e.g., short punchy sentences, rhetorical questions>",
    "rhetorical_devices": ["<e.g., irony, understatement, analogy>"],
    "humor_style": "<e.g., dry wit, self-deprecating asides>"
  },
  "beliefs": {
    "core_values": ["<e.g., individual liberty, free markets>"],
    "worldview": "<1-2 sentence summary>",
    "policy_leanings": "<e.g., fiscally conservative, socially moderate>",
    "red_lines": ["<topics/positions this persona NEVER endorses>"]
  },
  "style_rules": {
    "emoji_usage": "<e.g., minimal — one per post max>",
    "hashtag_style": "<e.g., 1-3 per post, avoids trendjacking>",
    "cta_patterns": ["<e.g., 'What do you think?'>"],
    "signature_phrases": ["<recurring catchphrases>"],
    "opening_patterns": ["<how posts typically start>"]
  },
  "taboos": ["<hard-banned: slurs, incitement, conspiracy theories, harassment>"],
  "example_posts": ["<3-5 example posts that exemplify this persona>"]
}`;

export class PersonaAgent extends BaseAgent {
  private config: Config;
  private useOpenAI: boolean;
  private useAnthropic: boolean;

  constructor(config: Config, rateLimiter?: RateLimiter) {
    super('persona_agent', rateLimiter);
    this.config = config;
    this.useOpenAI = !!config.openaiApiKey;
    this.useAnthropic = !!config.anthropicApiKey;
  }

  async execute(seedPrompt: string): Promise<PersonaProfile> {
    return this.generatePersona(seedPrompt);
  }

  async generatePersona(seedPrompt: string): Promise<PersonaProfile> {
    this.logger.info(`Generating persona from seed: "${seedPrompt.slice(0, 80)}..."`);

    const systemPrompt = `You are a persona architect for social media accounts. Given a high-level description, produce a detailed, structured persona profile as JSON. The persona should feel like a real, consistent human voice — not a corporate account. Include specific stylistic quirks, recurring phrases, and clear boundaries.`;

    const userPrompt = `Create a persona for: "${seedPrompt}"

Output JSON matching this exact schema:
${PERSONA_SCHEMA_DESCRIPTION}

Requirements:
- The persona must feel authentic and consistent — a real human voice with specific quirks
- Include 3-5 example posts that perfectly demonstrate the persona's style
- Taboos must include at minimum: slurs, incitement to violence, harassment, doxxing
- Example posts should vary in topic but maintain consistent voice
- Respond with ONLY valid JSON, no other text`;

    if (this.useOpenAI) {
      try {
        return await this.generateWithOpenAI(systemPrompt, userPrompt);
      } catch (e) {
        this.logger.warn(`OpenAI failed for persona generation: ${e}. Trying Anthropic.`);
      }
    }

    if (this.useAnthropic) {
      try {
        return await this.generateWithAnthropic(systemPrompt, userPrompt);
      } catch (e) {
        this.logger.warn(`Anthropic failed for persona generation: ${e}. Trying Ollama.`);
      }
    }

    return this.generateWithOllama(systemPrompt, userPrompt);
  }

  private async generateWithOpenAI(systemPrompt: string, userPrompt: string): Promise<PersonaProfile> {
    if (!(await this.rateLimiter.acquire('openai'))) {
      throw new Error('OpenAI rate limited');
    }

    return retryWithBackoff(
      async () => {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.config.openaiApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-5.1',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            temperature: 0.8,
            response_format: { type: 'json_object' },
          }),
          signal: AbortSignal.timeout(60000),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
        }

        const data = await response.json() as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const content = data.choices?.[0]?.message?.content ?? '{}';
        return this.parsePersonaResponse(content);
      },
      { maxRetries: 2, baseDelayMs: 2000 }
    );
  }

  private async generateWithAnthropic(systemPrompt: string, userPrompt: string): Promise<PersonaProfile> {
    if (!(await this.rateLimiter.acquire('anthropic'))) {
      throw new Error('Anthropic rate limited');
    }

    return retryWithBackoff(
      async () => {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': this.config.anthropicApiKey!,
            'Content-Type': 'application/json',
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-3-sonnet-20240229',
            max_tokens: 2048,
            system: systemPrompt,
            messages: [{ role: 'user', content: userPrompt }],
          }),
          signal: AbortSignal.timeout(60000),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Anthropic API error: ${response.status} - ${errorText}`);
        }

        const data = await response.json() as {
          content?: Array<{ text?: string }>;
        };
        const content = data.content?.[0]?.text ?? '';
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('No JSON found in Anthropic response');
        return this.parsePersonaResponse(jsonMatch[0]);
      },
      { maxRetries: 2, baseDelayMs: 2000 }
    );
  }

  private async generateWithOllama(systemPrompt: string, userPrompt: string): Promise<PersonaProfile> {
    const endpoint = this.config.ollamaEndpoint || 'http://localhost:11434';
    const model = this.config.ollamaModel || 'llama3.2';

    this.logger.info(`Generating persona with Ollama (${model}) at ${endpoint}`);

    const response = await fetch(`${endpoint}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt: `${systemPrompt}\n\n${userPrompt}`,
        stream: false,
        options: { temperature: 0.8 },
      }),
      signal: AbortSignal.timeout(120000),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status}`);
    }

    const data = await response.json() as { response?: string };
    const rawText = data.response ?? '';
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found in Ollama response');
    return this.parsePersonaResponse(jsonMatch[0]);
  }

  private parsePersonaResponse(raw: string): PersonaProfile {
    const parsed = JSON.parse(raw) as {
      name?: string;
      voice?: Partial<PersonaVoice>;
      beliefs?: Partial<PersonaBeliefs>;
      style_rules?: Partial<PersonaStyleRules>;
      taboos?: string[];
      example_posts?: string[];
    };

    if (!parsed.name || !parsed.voice || !parsed.beliefs || !parsed.style_rules) {
      throw new Error('Persona response missing required fields (name, voice, beliefs, style_rules)');
    }

    // Ensure mandatory taboos are always present
    const mandatoryTaboos = ['slurs', 'incitement to violence', 'harassment', 'doxxing'];
    const taboos = Array.from(new Set([
      ...mandatoryTaboos,
      ...(parsed.taboos ?? []),
    ]));

    const now = new Date();
    return {
      id: '',  // Set by Supabase on insert
      name: 'Allen Sharpe',
      isActive: true,
      voice: {
        tone: parsed.voice.tone ?? 'Critical, conversational',
        vocabulary_level: parsed.voice.vocabulary_level ?? 'accessible',
        sentence_style: parsed.voice.sentence_style ?? 'clear and direct',
        rhetorical_devices: ["emotional","credible"] ,
        humor_style: "edgy" ,
      },
      beliefs: {
        core_values: ["individual liberty", "free markets", "limited government"],
        worldview: "Personal freedom is the bedrock of prosperity.",
        policy_leanings: "fiscally conservative, socially moderate",
        red_lines: ["authoritarianism", "censorship", "socialism", "woke ideology"],
      },
      styleRules: {
        emoji_usage: parsed.style_rules.emoji_usage ?? 'minimal',
        hashtag_style: parsed.style_rules.hashtag_style ?? '1-3 per post',
        cta_patterns: parsed.style_rules.cta_patterns ?? [],
        signature_phrases: parsed.style_rules.signature_phrases ?? [],
        opening_patterns: parsed.style_rules.opening_patterns ?? [],
      },
      taboos,
      examplePosts: parsed.example_posts ?? [],
      metadata: {},
      createdAt: now,
      updatedAt: now,
    };
  }
}
