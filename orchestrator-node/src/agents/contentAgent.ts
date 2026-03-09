/**
 * Content Generation Agent - Creates social media posts using LLMs.
 */

import { v4 as uuidv4 } from 'uuid';
import { BaseAgent } from './baseAgent';
import { Config } from '../config';
import { NewsItem, SocialPost, Platform, Tone, PLATFORM_LIMITS, createSocialPost } from '../models';
import { RateLimiter, retryWithBackoff } from '../utils';

// Template fallbacks for when LLM is unavailable
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
    _postsPerItem = 1
  ): Promise<SocialPost[]> {
    const targetPlatforms = platforms ?? Object.values(Platform);
    const maxPosts = this.config.maxPostsPerRun || 3;
    // Use up to maxPosts distinct news items so each post covers a different story
    const selectedNews = newsItems.slice(0, maxPosts);

    this.logger.info(
      `Generating ${maxPosts} unique posts from ${selectedNews.length} news items`
    );

    const allPosts: SocialPost[] = [];

    for (let i = 0; i < selectedNews.length && allPosts.length < maxPosts; i++) {
      const newsItem = selectedNews[i];
      // Round-robin across platforms so each post targets a different one
      const platform = targetPlatforms[i % targetPlatforms.length];
      try {
        const posts = await this.generatePosts(newsItem, platform, tone, 1, allPosts);
        allPosts.push(...posts.slice(0, 1));
      } catch (e) {
        this.logger.error(`Error generating post: ${e}`);
        const post = this.generateTemplatePost(newsItem, platform, tone);
        allPosts.push(post);
      }
    }

    this.logger.info(`Generated ${allPosts.length} unique posts`);
    return allPosts.slice(0, maxPosts);
  }

  private buildPriorPostsContext(priorPosts: SocialPost[]): string {
    if (priorPosts.length === 0) return '';
    const summaries = priorPosts.map((p, i) =>
      `Post ${i + 1} (${p.platform}): ${p.content.slice(0, 120)}`
    ).join('\n');
    return `\n\nIMPORTANT — Posts already generated in this run (DO NOT repeat similar topics, angles, or phrasing):\n${summaries}\n\nMake your post substantially different in topic focus, angle, and wording from the above.`;
  }

  private async generatePosts(
    newsItem: NewsItem,
    platform: Platform,
    tone: Tone,
    count: number,
    priorPosts: SocialPost[] = []
  ): Promise<SocialPost[]> {
    if (this.useOpenAI) {
      try {
        return await this.generateWithOpenAI(newsItem, platform, tone, count, priorPosts);
      } catch (e) {
        this.logger.warn(`OpenAI failed after retries: ${e}. Falling back to Ollama.`);
        return this.generateWithOllama(newsItem, platform, tone, count, priorPosts);
      }
    } else if (this.useAnthropic) {
      try {
        return await this.generateWithAnthropic(newsItem, platform, tone, count, priorPosts);
      } catch (e) {
        this.logger.warn(`Anthropic failed after retries: ${e}. Falling back to Ollama.`);
        return this.generateWithOllama(newsItem, platform, tone, count, priorPosts);
      }
    } else {
      return this.generateWithOllama(newsItem, platform, tone, count, priorPosts);
    }
  }

  private async generateWithOpenAI(
    newsItem: NewsItem,
    platform: Platform,
    tone: Tone,
    count: number,
    priorPosts: SocialPost[] = []
  ): Promise<SocialPost[]> {
    if (!(await this.rateLimiter.acquire('openai'))) {
      this.logger.warn('OpenAI rate limited, using templates');
      return [this.generateTemplatePost(newsItem, platform, tone)];
    }

    const limits = PLATFORM_LIMITS[platform];
    const priorContext = this.buildPriorPostsContext(priorPosts);

    const systemPrompt = `You are a social media content expert. Generate engaging ${platform} posts.

Rules:
- Maximum ${limits.maxChars} characters
- Maximum ${5} hashtags
- Tone: ${tone}
- Include a call-to-action when appropriate
- Make content platform-appropriate
- Each post must have a unique angle — never repeat a topic or style already used

For each post, also provide an image prompt that could be used with DALL-E to generate a relevant image.`;

    const userPrompt = `Create ${count} unique ${platform} post(s) about this news:

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

    return retryWithBackoff(
      async () => {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.config.openaiApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
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
        const parsed = JSON.parse(content) as {
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
            tone,
            callToAction: postData.call_to_action,
            newsSource: newsItem.url,
            generatedBy: 'gpt-4o-mini',
            createdAt: new Date(),
          });

          // Validate length and truncate if needed
          if (post.content.length > limits.maxChars) {
            const truncatedPost = this.truncatePost(post, limits.maxChars);
            posts.push(truncatedPost);
          } else {
            posts.push(post);
          }
        }

        return posts;
      },
      { maxRetries: 3, baseDelayMs: 2000 }
    );
  }

  private async generateWithAnthropic(
    newsItem: NewsItem,
    platform: Platform,
    tone: Tone,
    count: number,
    priorPosts: SocialPost[] = []
  ): Promise<SocialPost[]> {
    if (!(await this.rateLimiter.acquire('anthropic'))) {
      this.logger.warn('Anthropic rate limited, using templates');
      return [this.generateTemplatePost(newsItem, platform, tone)];
    }

    const limits = PLATFORM_LIMITS[platform];
    const priorContext = this.buildPriorPostsContext(priorPosts);

    const prompt = `Generate ${count} unique ${platform} post(s) about this news.

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
            messages: [{ role: 'user', content: prompt }],
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

        // Extract JSON from response
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error('No JSON found in response');
        }

        const parsed = JSON.parse(jsonMatch[0]) as {
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
            tone,
            callToAction: postData.call_to_action,
            newsSource: newsItem.url,
            generatedBy: 'claude-3-sonnet',
            createdAt: new Date(),
          });

          if (post.content.length > limits.maxChars) {
            posts.push(this.truncatePost(post, limits.maxChars));
          } else {
            posts.push(post);
          }
        }

        return posts;
      },
      { maxRetries: 3, baseDelayMs: 2000 }
    );
  }

  private async generateWithOllama(
    newsItem: NewsItem,
    platform: Platform,
    tone: Tone,
    count: number,
    priorPosts: SocialPost[] = []
  ): Promise<SocialPost[]> {
    const endpoint = this.config.ollamaEndpoint || 'http://localhost:11434';
    const model = this.config.ollamaModel || 'llama3.2';
    const limits = PLATFORM_LIMITS[platform];
    const priorContext = this.buildPriorPostsContext(priorPosts);

    const prompt = `You are a social media content expert. Generate ${count} unique ${platform} post(s).

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

      // Extract JSON from response
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in Ollama response');
      }

      const parsed = JSON.parse(jsonMatch[0]) as {
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
          tone,
          callToAction: postData.call_to_action,
          newsSource: newsItem.url,
          generatedBy: `ollama/${model}`,
          createdAt: new Date(),
        });

        if (post.content.length > limits.maxChars) {
          posts.push(this.truncatePost(post, limits.maxChars));
        } else {
          posts.push(post);
        }
      }

      if (posts.length > 0) {
        this.logger.info(`Ollama generated ${posts.length} posts successfully`);
        return posts;
      }

      throw new Error('Ollama returned no posts');
    } catch (e) {
      this.logger.warn(`Ollama fallback failed: ${e}. Using templates.`);
      return Array.from({ length: count }, () =>
        this.generateTemplatePost(newsItem, platform, tone)
      );
    }
  }

  private generateTemplatePost(newsItem: NewsItem, platform: Platform, tone: Tone): SocialPost {
    const templates = TEMPLATE_POSTS[tone] ?? TEMPLATE_POSTS[Tone.PROFESSIONAL];
    const template = templates[Math.floor(Math.random() * templates.length)];

    // Generate hashtags from keywords
    const hashtags = newsItem.keywords.slice(0, 5).map((kw) => `#${kw.replace(/\s+/g, '')}`);
    const hashtagsStr = hashtags.join(' ');

    // Format the template
    const content = template
      .replace('{topic}', newsItem.topic.slice(0, 100))
      .replace('{hashtags}', hashtagsStr);

    // Generate simple image prompt
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

  private truncatePost(post: SocialPost, maxChars: number): SocialPost {
    if (post.content.length <= maxChars) {
      return post;
    }

    // Remove hashtags from content first
    let content = post.content;
    for (const hashtag of post.hashtags) {
      content = content.replace(`#${hashtag}`, '').trim();
    }

    // Truncate and add ellipsis
    const truncated = content.slice(0, maxChars - 3).split(' ').slice(0, -1).join(' ') + '...';

    return createSocialPost({
      ...post,
      content: truncated,
      hashtags: post.hashtags.slice(0, 3),
    });
  }
}
