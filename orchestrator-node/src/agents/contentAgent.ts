/**
 * Content Generation Agent - Creates social media posts using LLMs.
 * Uses persona profile for consistent voice across all runs.
 */

import { v4 as uuidv4 } from 'uuid';
import { BaseAgent } from './baseAgent';
import { Config } from '../config';
import {
  NewsItem,
  SocialPost,
  Platform,
  Tone,
  PLATFORM_LIMITS,
  createSocialPost,
  PersonaProfile,
  PostHistoryEntry,
} from '../models';
import { RateLimiter, retryWithBackoff } from '../utils';

export class ContentAgent extends BaseAgent {
  private config: Config;
  private useOpenAI: boolean;
  private useAnthropic: boolean;

  constructor(config: Config, rateLimiter?: RateLimiter) {
    super('content_agent', rateLimiter);
    this.config = config;
    this.useOpenAI = !!config.openaiApiKey;
    this.useAnthropic = !!config.anthropicApiKey;
  }

  async execute(
    newsItems: NewsItem[],
    platforms?: Platform[],
    tone: Tone = Tone.PROFESSIONAL,
    _postsPerItem = 1,
    persona?: PersonaProfile,
    recentPosts?: PostHistoryEntry[]
  ): Promise<SocialPost[]> {
    const targetPlatforms = platforms ?? Object.values(Platform);
    const maxPosts = this.config.maxPostsPerRun || 3;
    const selectedNews = newsItems.slice(0, maxPosts);

    if (persona) {
      this.logger.info(
        `Generating ${maxPosts} posts as "${persona.name}" from ${selectedNews.length} news items`
      );
    } else {
      this.logger.info(
        `Generating ${maxPosts} posts from ${selectedNews.length} news items`
      );
    }

    const allPosts: SocialPost[] = [];

    for (let i = 0; i < selectedNews.length && allPosts.length < maxPosts; i++) {
      const newsItem = selectedNews[i];
      const platform = targetPlatforms[i % targetPlatforms.length];
      try {
        const posts = await this.generatePosts(
          newsItem, platform, tone, 1, allPosts, persona, recentPosts
        );
        allPosts.push(...posts.slice(0, 1));
      } catch (e) {
        this.logger.error(`Error generating post: ${e}`);
        const post = this.generateTemplatePost(newsItem, platform, tone, persona);
        allPosts.push(post);
      }
    }

    this.logger.info(`Generated ${allPosts.length} unique posts`);
    return allPosts.slice(0, maxPosts);
  }

  // ─── Prompt construction ──────────────────────────────────────────────────

  private buildPersonaSystemPrompt(persona: PersonaProfile, platform: Platform): string {
    const limits = PLATFORM_LIMITS[platform];
    return `You are ghostwriting as the social media persona defined below. Every post MUST sound like it was written by this exact person — same voice, same worldview, same rhetorical style. Do not break character.

=== PERSONA ===
Name: ${persona.name}
Voice: ${JSON.stringify(persona.voice)}
Beliefs: ${JSON.stringify(persona.beliefs)}
Style rules: ${JSON.stringify(persona.styleRules)}
Hard taboos (NEVER include): ${persona.taboos.join(', ')}

=== EXAMPLE POSTS (match this style) ===
${persona.examplePosts.map((p, i) => `${i + 1}. "${p}"`).join('\n')}

=== RULES ===
- Stay in character at all times
- Platform: ${platform}, max ${limits.maxChars} chars
- Maximum ${limits.maxHashtags} hashtags
- Follow the persona's emoji, hashtag, and CTA patterns exactly
- NEVER produce extreme rhetoric, slurs, conspiracy theories, or incitement
- Generate an image prompt for DALL-E that fits the post's topic and persona brand`;
  }

  private buildPersonaUserPrompt(
    newsItem: NewsItem,
    platform: Platform,
    count: number,
    priorPosts: SocialPost[],
    recentPosts?: PostHistoryEntry[]
  ): string {
    let prompt = `Write ${count} unique ${platform} post(s) about this news:

Topic: ${newsItem.topic}
Summary: ${newsItem.summary}
Keywords: ${newsItem.keywords.join(', ')}`;

    // Inject post history for dedup (last N published posts)
    if (recentPosts && recentPosts.length > 0) {
      const historyLines = recentPosts
        .slice(0, 25)
        .map((p, i) => `${i + 1}. [${p.platform}] ${p.content.slice(0, 100)}...`)
        .join('\n');
      prompt += `\n\n=== POSTS ALREADY PUBLISHED (DO NOT repeat topics, angles, phrasing, or structure) ===\n${historyLines}`;
    }

    // Inject current-run posts for within-run dedup
    if (priorPosts.length > 0) {
      const runLines = priorPosts
        .map((p, i) => `${i + 1}. [${p.platform}] ${p.content.slice(0, 120)}`)
        .join('\n');
      prompt += `\n\n=== POSTS GENERATED THIS RUN (also avoid overlap) ===\n${runLines}`;
    }

    prompt += `\n\nProduce a post that covers a FRESH angle on this topic that none of the above posts have taken. Use different opening patterns, different rhetorical devices, and a different CTA than recent posts.

Respond in JSON format:
{
    "posts": [
        {
            "content": "The post text with hashtags",
            "hashtags": ["hashtag1", "hashtag2"],
            "image_prompt": "DALL-E prompt for generating an image",
            "call_to_action": "Optional CTA text"
        }
    ]
}`;

    return prompt;
  }

  private buildLegacyPriorPostsContext(priorPosts: SocialPost[]): string {
    if (priorPosts.length === 0) return '';
    const summaries = priorPosts.map((p, i) =>
      `Post ${i + 1} (${p.platform}): ${p.content.slice(0, 120)}`
    ).join('\n');
    return `\n\nIMPORTANT — Posts already generated in this run (DO NOT repeat similar topics, angles, or phrasing):\n${summaries}\n\nMake your post substantially different in topic focus, angle, and wording from the above.`;
  }

  // ─── Generation dispatch ──────────────────────────────────────────────────

  private async generatePosts(
    newsItem: NewsItem,
    platform: Platform,
    tone: Tone,
    count: number,
    priorPosts: SocialPost[] = [],
    persona?: PersonaProfile,
    recentPosts?: PostHistoryEntry[]
  ): Promise<SocialPost[]> {
    if (this.useOpenAI) {
      try {
        return await this.generateWithOpenAI(newsItem, platform, tone, count, priorPosts, persona, recentPosts);
      } catch (e) {
        this.logger.warn(`OpenAI failed after retries: ${e}. Falling back.`);
      }
    }

    if (this.useAnthropic) {
      try {
        return await this.generateWithAnthropic(newsItem, platform, tone, count, priorPosts, persona, recentPosts);
      } catch (e) {
        this.logger.warn(`Anthropic failed after retries: ${e}. Falling back to Ollama.`);
      }
    }

    return this.generateWithOllama(newsItem, platform, tone, count, priorPosts, persona, recentPosts);
  }

  // ─── OpenAI ───────────────────────────────────────────────────────────────

  private async generateWithOpenAI(
    newsItem: NewsItem,
    platform: Platform,
    tone: Tone,
    count: number,
    priorPosts: SocialPost[] = [],
    persona?: PersonaProfile,
    recentPosts?: PostHistoryEntry[]
  ): Promise<SocialPost[]> {
    if (!(await this.rateLimiter.acquire('openai'))) {
      this.logger.warn('OpenAI rate limited, using templates');
      return [this.generateTemplatePost(newsItem, platform, tone, persona)];
    }

    const limits = PLATFORM_LIMITS[platform];

    // Build prompts — persona-driven or legacy
    let systemPrompt: string;
    let userPrompt: string;

    if (persona) {
      systemPrompt = this.buildPersonaSystemPrompt(persona, platform);
      userPrompt = this.buildPersonaUserPrompt(newsItem, platform, count, priorPosts, recentPosts);
    } else {
      const priorContext = this.buildLegacyPriorPostsContext(priorPosts);
      systemPrompt = `You are a social media content creator. Generate engaging ${platform} posts that will make regular people want to follow you.

Rules:
- Maximum ${limits.maxChars} characters
- Maximum ${5} hashtags
- Tone: ${tone}
- Include a call-to-action when appropriate
- Make content platform-appropriate
- Each post must have a unique angle — never repeat a topic or style already used

For each post, also provide an image prompt that could be used with DALL-E to generate a relevant image.`;

      userPrompt = `Create ${count} unique ${platform} post(s) about this news:

Topic: ${newsItem.topic}
Summary: ${newsItem.summary}
Keywords: ${newsItem.keywords.join(', ')}${priorContext}

Respond in JSON format:
{
    "posts": [
        {
            "content": "The post text with hashtags",
            "hashtags": ["hashtag1", "hashtag2"],
            "image_prompt": "DALL-E prompt for generating an image",
            "call_to_action": "Optional CTA text"
        }
    ]
}`;
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
            model: 'gpt-5.4-mini',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            temperature: 0.7,
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
        return this.parsePostsResponse(content, platform, tone, newsItem, 'gpt-5.4-mini', limits.maxChars, persona);
      },
      { maxRetries: 3, baseDelayMs: 2000 }
    );
  }

  // ─── Anthropic ────────────────────────────────────────────────────────────

  private async generateWithAnthropic(
    newsItem: NewsItem,
    platform: Platform,
    tone: Tone,
    count: number,
    priorPosts: SocialPost[] = [],
    persona?: PersonaProfile,
    recentPosts?: PostHistoryEntry[]
  ): Promise<SocialPost[]> {
    if (!(await this.rateLimiter.acquire('anthropic'))) {
      this.logger.warn('Anthropic rate limited, using templates');
      return [this.generateTemplatePost(newsItem, platform, tone, persona)];
    }

    const limits = PLATFORM_LIMITS[platform];

    let systemPrompt: string | undefined;
    let userPrompt: string;

    if (persona) {
      systemPrompt = this.buildPersonaSystemPrompt(persona, platform);
      userPrompt = this.buildPersonaUserPrompt(newsItem, platform, count, priorPosts, recentPosts);
    } else {
      const priorContext = this.buildLegacyPriorPostsContext(priorPosts);
      userPrompt = `Generate ${count} unique ${platform} post(s) about this news.

Rules:
- Maximum ${limits.maxChars} characters
- Maximum ${5} hashtags
- Tone: ${tone}
- Include a call-to-action when appropriate
- Each post must have a unique angle — never repeat a topic or style already used

News:
Topic: ${newsItem.topic}
Summary: ${newsItem.summary}
Keywords: ${newsItem.keywords.join(', ')}${priorContext}

Respond in JSON format:
{
    "posts": [
        {
            "content": "The post text with hashtags",
            "hashtags": ["hashtag1", "hashtag2"],
            "image_prompt": "DALL-E prompt for generating an image",
            "call_to_action": "Optional CTA text"
        }
    ]
}`;
    }

    return retryWithBackoff(
      async () => {
        const body: Record<string, unknown> = {
          model: 'claude-3-sonnet-20240229',
          max_tokens: 1024,
          messages: [{ role: 'user', content: userPrompt }],
        };
        if (systemPrompt) {
          body.system = systemPrompt;
        }

        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': this.config.anthropicApiKey!,
            'Content-Type': 'application/json',
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify(body),
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
        if (!jsonMatch) throw new Error('No JSON found in response');
        return this.parsePostsResponse(jsonMatch[0], platform, tone, newsItem, 'claude-3-sonnet', limits.maxChars, persona);
      },
      { maxRetries: 3, baseDelayMs: 2000 }
    );
  }

  // ─── Ollama ───────────────────────────────────────────────────────────────

  private async generateWithOllama(
    newsItem: NewsItem,
    platform: Platform,
    tone: Tone,
    count: number,
    priorPosts: SocialPost[] = [],
    persona?: PersonaProfile,
    recentPosts?: PostHistoryEntry[]
  ): Promise<SocialPost[]> {
    const endpoint = this.config.ollamaEndpoint || 'http://localhost:11434';
    const model = this.config.ollamaModel || 'llama3.2';
    const limits = PLATFORM_LIMITS[platform];

    let prompt: string;

    if (persona) {
      const sys = this.buildPersonaSystemPrompt(persona, platform);
      const usr = this.buildPersonaUserPrompt(newsItem, platform, count, priorPosts, recentPosts);
      prompt = `${sys}\n\n${usr}\n\nRespond ONLY with valid JSON, no other text.`;
    } else {
      const priorContext = this.buildLegacyPriorPostsContext(priorPosts);
      prompt = `You are a social media content expert. Generate ${count} unique ${platform} post(s).

Rules:
- Maximum ${limits.maxChars} characters
- Maximum ${5} hashtags
- Tone: ${tone}
- Include a call-to-action when appropriate
- Each post must have a unique angle — never repeat a topic or style already used

News:
Topic: ${newsItem.topic}
Summary: ${newsItem.summary}
Keywords: ${newsItem.keywords.join(', ')}${priorContext}

Respond ONLY with valid JSON, no other text:
{
    "posts": [
        {
            "content": "The post text with hashtags",
            "hashtags": ["hashtag1", "hashtag2"],
            "image_prompt": "DALL-E prompt for generating an image",
            "call_to_action": "Optional CTA text"
        }
    ]
}`;
    }

    try {
      this.logger.info(`Attempting Ollama generation with model '${model}' at ${endpoint}`);

      const response = await fetch(`${endpoint}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt,
          stream: false,
          options: { temperature: 0.7 },
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

      const posts = this.parsePostsResponse(
        jsonMatch[0], platform, tone, newsItem, `ollama/${model}`, limits.maxChars, persona
      );

      if (posts.length > 0) {
        this.logger.info(`Ollama generated ${posts.length} posts successfully`);
        return posts;
      }

      throw new Error('Ollama returned no posts');
    } catch (e) {
      this.logger.warn(`Ollama fallback failed: ${e}. Using templates.`);
      return Array.from({ length: count }, () =>
        this.generateTemplatePost(newsItem, platform, tone, persona)
      );
    }
  }

  // ─── Response parsing ─────────────────────────────────────────────────────

  private parsePostsResponse(
    raw: string,
    platform: Platform,
    tone: Tone,
    newsItem: NewsItem,
    generatedBy: string,
    maxChars: number,
    persona?: PersonaProfile
  ): SocialPost[] {
    const parsed = JSON.parse(raw) as {
      posts?: Array<{
        content?: string;
        hashtags?: string[];
        image_prompt?: string;
        call_to_action?: string;
      }>;
    };

    const posts: SocialPost[] = [];
    for (const postData of parsed.posts ?? []) {
      const post = createSocialPost({
        postId: uuidv4(),
        content: postData.content ?? '',
        platform,
        hashtags: postData.hashtags ?? [],
        imagePrompt: postData.image_prompt,
        tone: persona ? undefined : tone,
        callToAction: postData.call_to_action,
        newsSource: newsItem.url,
        generatedBy,
        personaId: persona?.id,
        createdAt: new Date(),
      });

      if (post.content.length > maxChars) {
        posts.push(this.truncatePost(post, maxChars));
      } else {
        posts.push(post);
      }
    }

    return posts;
  }

  // ─── Template fallback ────────────────────────────────────────────────────

  private generateTemplatePost(
    newsItem: NewsItem,
    platform: Platform,
    tone: Tone,
    persona?: PersonaProfile
  ): SocialPost {
    // Persona-aware templates
    if (persona) {
      const openingPatterns = persona.styleRules.opening_patterns;
      const signaturePhrases = persona.styleRules.signature_phrases;
      const ctaPatterns = persona.styleRules.cta_patterns;

      const opening = openingPatterns.length > 0
        ? openingPatterns[Math.floor(Math.random() * openingPatterns.length)]
        : 'Here\'s the thing:';
      const signature = signaturePhrases.length > 0
        ? signaturePhrases[Math.floor(Math.random() * signaturePhrases.length)]
        : '';
      const cta = ctaPatterns.length > 0
        ? ctaPatterns[Math.floor(Math.random() * ctaPatterns.length)]
        : '';

      const hashtags = newsItem.keywords.slice(0, 3).map((kw) => `#${kw.replace(/\s+/g, '')}`);
      const parts = [opening, newsItem.topic.slice(0, 100) + '.', signature, cta, hashtags.join(' ')];
      const content = parts.filter(Boolean).join(' ').trim();
      const imagePrompt = `Professional illustration representing: ${newsItem.topic.slice(0, 50)}`;

      return createSocialPost({
        postId: uuidv4(),
        content,
        platform,
        hashtags: hashtags.map((h) => h.replace('#', '')),
        imagePrompt,
        personaId: persona.id,
        newsSource: newsItem.url,
        generatedBy: 'template-persona',
        createdAt: new Date(),
      });
    }

    // Legacy tone-based templates
    const TEMPLATE_POSTS: Record<Tone, string[]> = {
      [Tone.CASUAL]: [
        'Check this out! {topic} 🔥 {hashtags}',
        'Just saw this and had to share: {topic} 👀 {hashtags}',
        'This is wild - {topic} 🚀 {hashtags}',
      ],
      [Tone.PROFESSIONAL]: [
        'Key insight: {topic}. Learn more about how this impacts our industry. {hashtags}',
        'Important development: {topic}. Here\'s what you need to know. {hashtags}',
        'Industry update: {topic}. Stay informed. {hashtags}',
      ],
      [Tone.PLAYFUL]: [
        'POV: You just discovered {topic} 😎 {hashtags}',
        'When you realize {topic} changes everything 🤯 {hashtags}',
        'Okay but can we talk about {topic}? 💭 {hashtags}',
      ],
      [Tone.INSPIRATIONAL]: [
        'The future is being shaped by {topic}. Be part of the change. ✨ {hashtags}',
        'Innovation at its finest: {topic}. What possibilities do you see? 🌟 {hashtags}',
        'Dreaming big starts with understanding {topic}. Let\'s explore! 💡 {hashtags}',
      ],
      [Tone.INFORMATIVE]: [
        'Did you know? {topic}. Here are the key facts. 📊 {hashtags}',
        'Breaking down {topic}: What you need to understand. 📚 {hashtags}',
        'Quick explainer: {topic}. Stay informed. 📝 {hashtags}',
      ],
    };

    const templates = TEMPLATE_POSTS[tone] ?? TEMPLATE_POSTS[Tone.PROFESSIONAL];
    const template = templates[Math.floor(Math.random() * templates.length)];

    const hashtags = newsItem.keywords.slice(0, 5).map((kw) => `#${kw.replace(/\s+/g, '')}`);
    const hashtagsStr = hashtags.join(' ');

    const content = template
      .replace('{topic}', newsItem.topic.slice(0, 100))
      .replace('{hashtags}', hashtagsStr);

    const imagePrompt = `Professional illustration representing: ${newsItem.topic.slice(0, 50)}`;

    return createSocialPost({
      postId: uuidv4(),
      content,
      platform,
      hashtags: hashtags.map((h) => h.replace('#', '')),
      imagePrompt,
      tone,
      newsSource: newsItem.url,
      generatedBy: 'template',
      createdAt: new Date(),
    });
  }

  // ─── Utility ──────────────────────────────────────────────────────────────

  private truncatePost(post: SocialPost, maxChars: number): SocialPost {
    if (post.content.length <= maxChars) {
      return post;
    }

    let content = post.content;
    for (const hashtag of post.hashtags) {
      content = content.replace(`#${hashtag}`, '').trim();
    }

    const truncated = content.slice(0, maxChars - 3).split(' ').slice(0, -1).join(' ') + '...';

    return createSocialPost({
      ...post,
      content: truncated,
      hashtags: post.hashtags.slice(0, 3),
    });
  }
}
