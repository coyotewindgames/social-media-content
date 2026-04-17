/**
 * Ranking Agent - Uses LLM cascade to score and rank news articles by postworthiness.
 * When a persona is active, evaluates articles through the persona's lens —
 * their beliefs, interests, and style — to curate content that fits the voice.
 */

import { BaseAgent } from './baseAgent';
import { Config } from '../config';
import { NewsItem, PersonaProfile } from '../models';
import { RateLimiter, retryWithBackoff } from '../utils';

interface RankedArticle {
  index: number;
  score: number;
  reason: string;
}

export class RankingAgent extends BaseAgent {
  private config: Config;

  constructor(config: Config, rateLimiter?: RateLimiter) {
    super('ranking_agent', rateLimiter);
    this.config = config;
  }

  async execute(candidates: NewsItem[], persona?: PersonaProfile): Promise<NewsItem[]> {
    const maxPosts = this.config.maxPostsPerRun || 3;

    if (candidates.length <= maxPosts) {
      this.logger.info(`Only ${candidates.length} candidates — skipping ranking`);
      return candidates;
    }

    this.logger.info(
      `Ranking ${candidates.length} candidates, selecting top ${maxPosts}${persona ? ` for persona "${persona.name}"` : ''}`
    );

    try {
      const ranked = await this.rankWithLLM(candidates, maxPosts, persona);
      return ranked;
    } catch (error) {
      this.logger.warn(
        `LLM ranking failed: ${error instanceof Error ? error.message : error}. Using relevance-score fallback.`
      );
      return this.fallbackRank(candidates, maxPosts);
    }
  }

  private async rankWithLLM(
    candidates: NewsItem[],
    topN: number,
    persona?: PersonaProfile
  ): Promise<NewsItem[]> {
    // LLM cascade: OpenAI → Anthropic → Ollama
    if (this.config.openaiApiKey) {
      try {
        return await this.rankWithOpenAI(candidates, topN, persona);
      } catch (e) {
        this.logger.warn(`OpenAI ranking failed: ${e}. Trying Anthropic…`);
      }
    }

    if (this.config.anthropicApiKey) {
      try {
        return await this.rankWithAnthropic(candidates, topN, persona);
      } catch (e) {
        this.logger.warn(`Anthropic ranking failed: ${e}. Trying Ollama…`);
      }
    }

    return this.rankWithOllama(candidates, topN, persona);
  }

  private buildPrompt(candidates: NewsItem[], topN: number, persona?: PersonaProfile): string {
    const articleList = candidates
      .map(
        (c, i) =>
          `[${i}] "${c.topic}" (source: ${c.source}, keywords: ${c.keywords.slice(0, 5).join(', ')})\n    Summary: ${c.summary.slice(0, 200)}`
      )
      .join('\n');

    if (persona) {
      return this.buildPersonaPrompt(articleList, candidates.length, topN, persona);
    }

    return this.buildGenericPrompt(articleList, candidates.length, topN);
  }

  private buildPersonaPrompt(
    articleList: string,
    total: number,
    topN: number,
    persona: PersonaProfile
  ): string {
    const values = persona.beliefs.core_values.join(', ');
    const leanings = persona.beliefs.policy_leanings;
    const worldview = persona.beliefs.worldview;
    const taboos = persona.taboos.join(', ');

    return `You are a content curator for a social media persona called "${persona.name}".

Persona profile:
- Worldview: ${worldview}
- Core values: ${values}
- Policy leanings: ${leanings}
- Voice tone: ${persona.voice.tone}
- Taboo topics (NEVER select): ${taboos}

Your job: evaluate these ${total} news articles and pick the ${topN} that this persona would MOST want to post about. The best articles are ones where the persona has a strong, authentic opinion aligned with their beliefs and voice.

Score each article 0-100 on these persona-specific criteria:
- Alignment with beliefs & values (does this topic let the persona express their worldview?)
- Opinion potential (can the persona add a distinctive take, not just restate the headline?)
- Audience resonance (will the persona's followers engage — reply, share, debate?)
- Timeliness (is it current enough to matter?)
- Taboo check (score 0 if it touches a taboo topic)

Articles:
${articleList}

Respond with ONLY valid JSON — no markdown, no explanation outside the JSON:
{
  "rankings": [
    { "index": <article index>, "score": <0-100>, "reason": "<1 sentence explaining why this persona would post about it>" }
  ]
}

Return exactly ${topN} articles, sorted by score descending.`;
  }

  private buildGenericPrompt(articleList: string, total: number, topN: number): string {
    return `You are a social media content strategist. Evaluate these ${total} news articles and pick the ${topN} most "postworthy" — the ones that would generate the most engagement, clicks, and follows on social media.

Score each article 0-100 on these criteria:
- Timeliness & urgency (is it breaking / trending?)
- Emotional hook (surprise, outrage, inspiration, humor)
- Shareability (would people tag friends or repost?)
- Broad appeal (interesting beyond a niche audience)
- Uniqueness (not the same story everyone else is posting)

Articles:
${articleList}

Respond with ONLY valid JSON — no markdown, no explanation outside the JSON:
{
  "rankings": [
    { "index": <article index>, "score": <0-100>, "reason": "<1 sentence>" }
  ]
}

Return exactly ${topN} articles, sorted by score descending. Use the article index numbers from the list above.`;
  }

  private parseRankings(
    raw: string,
    candidates: NewsItem[],
    topN: number
  ): NewsItem[] {
    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found in LLM response');

    const parsed = JSON.parse(jsonMatch[0]) as {
      rankings?: RankedArticle[];
    };

    const rankings = parsed.rankings ?? [];
    if (rankings.length === 0) throw new Error('Empty rankings array');

    // Validate indices and build result
    const result: NewsItem[] = [];
    const seen = new Set<number>();

    for (const r of rankings) {
      const idx = r.index;
      if (idx < 0 || idx >= candidates.length || seen.has(idx)) continue;
      seen.add(idx);

      const item = { ...candidates[idx] };
      item.postworthinessScore = Math.max(0, Math.min(100, r.score));
      item.rankingReason = r.reason?.slice(0, 200) ?? '';
      result.push(item);

      if (result.length >= topN) break;
    }

    if (result.length === 0) throw new Error('No valid articles after parsing');

    this.logger.info(
      `Ranked top ${result.length}: ${result.map((r) => `"${r.topic.slice(0, 40)}…" (${r.postworthinessScore})`).join(', ')}`
    );

    return result;
  }

  private buildSystemMessage(persona?: PersonaProfile): string {
    if (persona) {
      return `You are a content curator for the persona "${persona.name}". Select articles that align with their voice and beliefs. Respond only with valid JSON.`;
    }
    return 'You are a social media strategist. Respond only with valid JSON.';
  }

  private async rankWithOpenAI(
    candidates: NewsItem[],
    topN: number,
    persona?: PersonaProfile
  ): Promise<NewsItem[]> {
    if (!(await this.rateLimiter.acquire('openai'))) {
      throw new Error('OpenAI rate limited');
    }

    const prompt = this.buildPrompt(candidates, topN, persona);

    return retryWithBackoff(
      async () => {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.config.openaiApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-5-mini',
            messages: [
              {
                role: 'system',
                content: this.buildSystemMessage(persona),
              },
              { role: 'user', content: prompt },
            ],
            temperature: 0.3,
            response_format: { type: 'json_object' },
          }),
          signal: AbortSignal.timeout(60000),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
        }

        const data = (await response.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const content = data.choices?.[0]?.message?.content ?? '';
        return this.parseRankings(content, candidates, topN);
      },
      { maxRetries: 2, baseDelayMs: 2000 }
    );
  }

  private async rankWithAnthropic(
    candidates: NewsItem[],
    topN: number,
    persona?: PersonaProfile
  ): Promise<NewsItem[]> {
    if (!(await this.rateLimiter.acquire('anthropic'))) {
      throw new Error('Anthropic rate limited');
    }

    const prompt = this.buildPrompt(candidates, topN, persona);

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
            max_tokens: 1024,
            system: this.buildSystemMessage(persona),
            messages: [{ role: 'user', content: prompt }],
          }),
          signal: AbortSignal.timeout(60000),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Anthropic API error: ${response.status} - ${errorText}`);
        }

        const data = (await response.json()) as {
          content?: Array<{ text?: string }>;
        };
        const content = data.content?.[0]?.text ?? '';
        return this.parseRankings(content, candidates, topN);
      },
      { maxRetries: 2, baseDelayMs: 2000 }
    );
  }

  private async rankWithOllama(
    candidates: NewsItem[],
    topN: number,
    persona?: PersonaProfile
  ): Promise<NewsItem[]> {
    const endpoint = this.config.ollamaEndpoint || 'http://localhost:11434';
    const model = this.config.ollamaModel || 'llama3.2';
    const prompt = this.buildPrompt(candidates, topN, persona);
    const system = this.buildSystemMessage(persona);

    return retryWithBackoff(
      async () => {
        const response = await fetch(`${endpoint}/api/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            prompt,
            system,
            stream: false,
            format: 'json',
          }),
          signal: AbortSignal.timeout(120000),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Ollama API error: ${response.status} - ${errorText}`);
        }

        const data = (await response.json()) as { response?: string };
        const content = data.response ?? '';
        return this.parseRankings(content, candidates, topN);
      },
      { maxRetries: 2, baseDelayMs: 3000 }
    );
  }

  /** Fallback: rank by existing relevanceScore + recency when LLM is unavailable. */
  private fallbackRank(candidates: NewsItem[], topN: number): NewsItem[] {
    const now = Date.now();
    const scored = candidates.map((c) => {
      const ageHours = (now - new Date(c.timestamp).getTime()) / 3_600_000;
      const recencyBoost = Math.max(0, 1 - ageHours / 24);
      const score = Math.round((c.relevanceScore * 60 + recencyBoost * 40) * 100) / 100;
      return {
        ...c,
        postworthinessScore: score,
        rankingReason: 'Ranked by relevance + recency (LLM unavailable)',
      };
    });

    scored.sort((a, b) => (b.postworthinessScore ?? 0) - (a.postworthinessScore ?? 0));

    this.logger.info(
      `Fallback ranked top ${topN}: ${scored.slice(0, topN).map((r) => `"${r.topic.slice(0, 40)}…" (${r.postworthinessScore})`).join(', ')}`
    );

    return scored.slice(0, topN);
  }
}
