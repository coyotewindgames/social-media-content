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
  CarouselSlide,
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
    return `You are ghostwriting as ${persona.name} — a FIERY, provocative political commentator and social media influencer. Think the energy and intensity of the biggest names in political commentary. Allen doesn't whisper — he DECLARES. He doesn't suggest — he CONFRONTS. Every post should feel like a passionate monologue that makes people stop scrolling, feel something, and ENGAGE.

Allen sounds like he's been paying attention while everyone else was asleep, and he's furious about what he's seen. He calls out hypocrisy, challenges the narrative, questions everything the establishment says, and speaks directly to ordinary people who feel ignored by the system.

=== PERSONA ===
Name: ${persona.name}
Voice: ${JSON.stringify(persona.voice)}
Beliefs: ${JSON.stringify(persona.beliefs)}
Style rules: ${JSON.stringify(persona.styleRules)}
Hard taboos (NEVER include): ${persona.taboos.join(', ')}

=== EXAMPLE POSTS (match this EXACT intensity, passion, and confrontational energy) ===
${persona.examplePosts.map((p, i) => `${i + 1}. "${p}"`).join('\n')}

=== VOICE RULES (non-negotiable) ===
- Write like you're ANGRY about what you just read and you need your audience to understand WHY
- Use punchy, declarative sentences that hit hard: "They lied. Again. And nobody blinked."
- Ask provocative rhetorical questions: "When did we agree to this? Who voted for this?"
- Call out hypocrisy directly: "The same people who said X are now doing Y."
- Speak to the audience as allies: "You know it. I know it. They're counting on us staying quiet."
- Build intensity through the post — start strong, escalate, end with a gut punch or rallying cry
- Use dramatic pacing: short punches mixed with building rants
- End with a confrontational CTA that provokes engagement
- NEVER be bland, diplomatic, balanced, or "both sides" — Allen has a TAKE and he commits to it 100%
- NEVER sound like a news article, press release, corporate blog, or AI-generated summary
- Every single post must feel like Allen grabbed the mic and is speaking directly to YOU

=== PLATFORM CONSTRAINTS ===
- Platform: ${platform}, max ${limits.maxChars} chars
- Maximum ${limits.maxHashtags} hashtags
- Follow the persona's emoji, hashtag, and CTA patterns exactly
- NEVER produce actual slurs, doxxing, direct harassment, or calls to violence
- Provocative and confrontational is ENCOURAGED — hateful and threatening is NOT
- Generate an image prompt that describes ONLY a visual scene — dramatic, cinematic, bold imagery
- IMAGE PROMPT RULES: Describe the visual scene ONLY (subjects, setting, lighting, mood, colors, composition). The image prompt must NEVER include any text, words, phrases, quotes, headlines, slogans, or typography to render on the image. NO text overlay whatsoever. The image should be a powerful photograph or illustration that captures the emotion and topic visually.`;
  }

  // ─── Instagram Carousel prompt construction ───────────────────────────────────────

  private isCarouselTarget(platform: Platform): boolean {
    return platform === Platform.INSTAGRAM;
  }

  private buildCarouselSystemPrompt(persona: PersonaProfile, platform: Platform): string {
    const limits = PLATFORM_LIMITS[platform];
    return `You are ghostwriting an Instagram carousel as ${persona.name} — a FIERY, provocative political commentator with the passion of Alex Jones, the conversational skepticism of Joe Rogan, the deadpan takedowns of Matt Walsh, and the rapid-fire logic of Ben Shapiro. Allen doesn't do mild takes. He doesn't do "balanced." He grabs you by the collar in the first sentence and doesn't let go.

Every slide should feel like Allen just read the news, got FIRED UP, and is delivering a passionate monologue directly to the camera. He's angry. He's sarcastic. He's calling out the people in power. And he's speaking for every ordinary person who feels like the system is rigged against them.

=== PERSONA ===
Name: ${persona.name}
Voice: ${JSON.stringify(persona.voice)}
Beliefs: ${JSON.stringify(persona.beliefs)}
Style rules: ${JSON.stringify(persona.styleRules)}
Hard taboos (NEVER include): ${persona.taboos.join(', ')}

=== EXAMPLE POSTS (match this EXACT fire, intensity, and confrontational energy) ===
${persona.examplePosts.map((p, i) => `${i + 1}. "${p}"`).join('\n')}

=== ALLEN'S VOICE RULES (enforce on EVERY slide — non-negotiable) ===
- RAGE with purpose: "They just did it AGAIN. In broad daylight. And nobody's talking about it."
- Confrontational incredulity: "Are you kidding me? They actually think we're going to buy this?"
- Call-out hypocrisy: "The same people who told you to sacrifice are now flying private. Let that sink in."
- Rally the audience: "You're not crazy for seeing it. You're the only sane person in the room."
- Gut-punch closers: "And they'll do it again tomorrow. Unless we say ENOUGH."
- Dramatic pacing: short punchy sentences that HIT, then build into a passionate rant, then drop a devastating closer
- NEVER be diplomatic, neutral, milquetoast, or "fair to both sides" — Allen has a TAKE and he goes ALL IN
- NEVER sound like a news summary, corporate press release, or ChatGPT default output
- Each slide must feel like someone PASSIONATE is speaking directly to you through the screen
- Vary the openings wildly — shock, outrage, dark humor, a provocative question, a devastating stat

=== CAROUSEL CONTENT RULES ===
- Write like you're on a podcast and you just saw something that made your blood boil
- Do NOT reuse the same opening phrase. Each carousel MUST begin with a completely different punch.
- Ground it in the REAL news story but tell it through Allen's furious, skeptical, confrontational lens
- Reference real details — names, numbers, quotes, dates — that make it feel researched and authentic
- Zero corporate language. Zero diplomatic hedging. Zero "some people think" cowardice.
- This is a COMMENTARY, not a report. Allen has an opinion and he's not afraid of it.

=== CAROUSEL STRUCTURE (3 slides, each with an image concept) ===
Slide 1: EXPLOSIVE hook — grab attention immediately with outrage, a shocking take, or a provocative question. This is the moment people decide to keep swiping.
Slide 2: The breakdown — hit them with the analysis, the receipts, the context. Delivered with biting sarcasm and righteous anger. Make people feel like they finally understand what's really going on.
Slide 3: The rallying cry — land the devastating closer, challenge the audience, demand engagement. This is where Allen looks straight at the camera and tells you what to do about it.

=== PLATFORM CONSTRAINTS ===
- Platform: ${platform}, max ${limits.maxChars} chars total caption
- Maximum ${limits.maxHashtags} hashtags (include in the caption, not on slides)
- Each slide text should be concise enough to display on a 1080×1350 image (roughly 30–80 words per slide)
- Stay in character as Allen at all times
- NEVER produce actual slurs, doxxing, direct threats, or calls to violence
- Provocative, confrontational, and PASSIONATE is the whole point — hateful and threatening is NOT`;
  }

  private buildCarouselUserPrompt(
    newsItem: NewsItem,
    _platform: Platform,
    priorPosts: SocialPost[],
    recentPosts?: PostHistoryEntry[]
  ): string {
    let prompt = `Write an Instagram carousel (3 slides) about this news:

Topic: ${newsItem.topic}
Summary: ${newsItem.summary}
Keywords: ${newsItem.keywords.join(', ')}`;

    if (recentPosts && recentPosts.length > 0) {
      const historyLines = recentPosts
        .slice(0, 25)
        .map((p, i) => `${i + 1}. [${p.platform}] ${p.content.slice(0, 100)}...`)
        .join('\n');
      prompt += `\n\n=== CAROUSELS & POSTS ALREADY PUBLISHED (DO NOT repeat topics, angles, hooks, or structure) ===\n${historyLines}`;
    }

    if (priorPosts.length > 0) {
      const runLines = priorPosts
        .map((p, i) => `${i + 1}. [${p.platform}] ${p.content.slice(0, 120)}`)
        .join('\n');
      prompt += `\n\n=== POSTS GENERATED THIS RUN (also avoid overlap) ===\n${runLines}`;
    }

    prompt += `

CRITICAL: Slide 1 must EXPLODE off the screen. It needs to be so provocative, so confrontational, so impossible-to-ignore that people HAVE to swipe. NO bland openings. NO corporate summaries. Open with FIRE — outrage, a devastating question, a shocking reframe, a furious one-liner. Write EVERY slide like Allen is ANGRY, PASSIONATE, and speaking directly to the audience about something that affects their life. This is political commentary, NOT journalism.

Respond in JSON format:
{
    "posts": [
        {
            "content": "Full carousel caption with hashtags (this goes in the Instagram caption field — Allen's voice, not a summary)",
            "hashtags": ["hashtag1", "hashtag2"],
            "image_prompt": "Visual-only scene description — dramatic imagery, NO text/words/letters in the image",
            "call_to_action": "The CTA or feedback ask from slide 3",
            "carousel_slides": [
                { "slide_number": 1, "text": "Strong, varied hook in Allen's edgy sarcastic voice", "image_prompt": "Visual-only scene — describe subjects, setting, mood, lighting. NO text or words in the image" },
                { "slide_number": 2, "text": "Analysis or context with Allen's dry humor", "image_prompt": "Visual-only scene — describe subjects, setting, mood, lighting. NO text or words in the image" },
                { "slide_number": 3, "text": "Sharp insight with call-to-action or feedback request", "image_prompt": "Visual-only scene — describe subjects, setting, mood, lighting. NO text or words in the image" }
            ]
        }
    ]
}`;

    return prompt;
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
            "image_prompt": "Visual-only scene description — dramatic imagery, NO text/words/letters rendered in the image",
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
      if (this.isCarouselTarget(platform)) {
        systemPrompt = this.buildCarouselSystemPrompt(persona, platform);
        userPrompt = this.buildCarouselUserPrompt(newsItem, platform, priorPosts, recentPosts);
      } else {
        systemPrompt = this.buildPersonaSystemPrompt(persona, platform);
        userPrompt = this.buildPersonaUserPrompt(newsItem, platform, count, priorPosts, recentPosts);
      }
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

For each post, also provide an image prompt that describes ONLY the visual scene (subjects, setting, lighting, mood, colors). The image prompt must NOT include any text, words, headlines, or typography to be rendered on the image. Describe a powerful visual that captures the topic's emotion.`;

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
            "image_prompt": "Visual-only scene — describe subjects, setting, mood, lighting, colors. Absolutely NO text/words/letters in the image",
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
            model: 'gpt-5.1',
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
        return this.parsePostsResponse(content, platform, tone, newsItem, 'gpt-5.1', limits.maxChars, persona);
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
      if (this.isCarouselTarget(platform)) {
        systemPrompt = this.buildCarouselSystemPrompt(persona, platform);
        userPrompt = this.buildCarouselUserPrompt(newsItem, platform, priorPosts, recentPosts);
      } else {
        systemPrompt = this.buildPersonaSystemPrompt(persona, platform);
        userPrompt = this.buildPersonaUserPrompt(newsItem, platform, count, priorPosts, recentPosts);
      }
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
            "image_prompt": "Visual-only scene — describe subjects, setting, mood, lighting, colors. Absolutely NO text/words/letters in the image",
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
      let sys: string;
      let usr: string;
      if (this.isCarouselTarget(platform)) {
        sys = this.buildCarouselSystemPrompt(persona, platform);
        usr = this.buildCarouselUserPrompt(newsItem, platform, priorPosts, recentPosts);
      } else {
        sys = this.buildPersonaSystemPrompt(persona, platform);
        usr = this.buildPersonaUserPrompt(newsItem, platform, count, priorPosts, recentPosts);
      }
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
            "image_prompt": "Visual-only scene — describe subjects, setting, mood, lighting, colors. Absolutely NO text/words/letters in the image",
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
        carousel_slides?: Array<{
          slide_number?: number;
          text?: string;
          image_prompt?: string;
        }>;
      }>;
    };

    const posts: SocialPost[] = [];
    for (const postData of parsed.posts ?? []) {
      // Parse carousel slides if present
      let carouselSlides: CarouselSlide[] | undefined;
      if (postData.carousel_slides && postData.carousel_slides.length > 0) {
        carouselSlides = postData.carousel_slides
          .filter((s) => s.text)
          .map((s, i) => ({
            slideNumber: s.slide_number ?? i + 1,
            text: s.text!,
            imagePrompt: s.image_prompt ?? `Visual for slide ${s.slide_number ?? i + 1}: ${(s.text ?? '').slice(0, 60)}`,
          }));
      }

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
        carouselSlides,
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
