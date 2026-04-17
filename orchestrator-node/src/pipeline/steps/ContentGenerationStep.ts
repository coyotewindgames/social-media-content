/**
 * ContentGenerationStep — generates social media posts from ranked news items.
 *
 * Non-fatal: falls back to template-based posts on failure.
 */

import { v4 as uuidv4 } from 'uuid';
import { AbstractPipelineStep, StepResult } from '../PipelineStep';
import { PipelineContext } from '../PipelineContext';
import { ContentAgent } from '../../agents';
import { Config } from '../../config';
import {
  NewsItem,
  SocialPost,
  Platform,
  Tone,
  PersonaProfile,
} from '../../models';

export class ContentGenerationStep extends AbstractPipelineStep {
  readonly name = 'content_agent';

  constructor(
    private contentAgent: ContentAgent,
    private config: Config,
  ) {
    super();
  }

  async execute(ctx: PipelineContext): Promise<StepResult> {
    const platforms = ctx.options.platforms ?? Object.values(Platform);
    const tone = ctx.options.tone ?? Tone.PROFESSIONAL;
    const postsPerItem = ctx.options.postsPerItem ?? this.config.postsPerNewsItem;
    const persona = ctx.persona;
    const recentPosts = ctx.recentPosts ?? [];

    try {
      const posts = await this.contentAgent.run<SocialPost[]>(
        ctx.newsItems,
        platforms,
        tone,
        postsPerItem,
        persona,
        recentPosts,
      );
      ctx.posts = posts;
      this.logger.info(`Content agent completed: ${posts.length} posts`);
      return this.success();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      ctx.errorLog.push(`Content agent error (using templates): ${errorMessage}`);
      this.logger.warn(`Content agent failed, using template fallback: ${errorMessage}`);

      // Fallback: Generate template-based posts
      const posts: SocialPost[] = [];
      const selectedNews = ctx.newsItems.slice(0, this.config.maxPostsPerRun || 3);
      for (let i = 0; i < selectedNews.length; i++) {
        const platform = platforms[i % platforms.length];
        posts.push(this.generateTemplatePost(selectedNews[i], platform, tone, persona));
      }
      ctx.posts = posts;
      return this.success();
    }
  }

  private generateTemplatePost(
    newsItem: NewsItem,
    platform: Platform,
    tone: Tone,
    persona?: PersonaProfile,
  ): SocialPost {
    if (persona) {
      const openingPatterns = persona.styleRules.opening_patterns;
      const signaturePhrases = persona.styleRules.signature_phrases;
      const opening = openingPatterns.length > 0
        ? openingPatterns[Math.floor(Math.random() * openingPatterns.length)]
        : 'Here\'s the thing:';
      const signature = signaturePhrases.length > 0
        ? signaturePhrases[Math.floor(Math.random() * signaturePhrases.length)]
        : '';
      const hashtags = newsItem.keywords.slice(0, 3).map((kw) => `#${kw.replace(/\s+/g, '')}`);
      const content = `${opening} ${newsItem.topic.slice(0, 100)}. ${signature} ${hashtags.join(' ')}`.trim();

      return {
        postId: uuidv4(),
        content,
        platform,
        hashtags: hashtags.map((h) => h.replace('#', '')),
        imagePrompt: `Professional illustration representing: ${newsItem.topic.slice(0, 50)}`,
        personaId: persona.id,
        characterCount: content.length,
        newsSource: newsItem.url,
        generatedBy: 'template-persona',
        createdAt: new Date(),
      };
    }

    // Legacy tone-based templates
    const templates: Record<Tone, string[]> = {
      [Tone.CASUAL]: ['Check this out! {topic} \u{1F525}'],
      [Tone.PROFESSIONAL]: ['Key insight: {topic}. Learn more about how this impacts our industry.'],
      [Tone.PLAYFUL]: ['POV: You just discovered {topic} \u{1F60E}'],
      [Tone.INSPIRATIONAL]: ['The future is being shaped by {topic}. Be part of the change. \u2728'],
      [Tone.INFORMATIVE]: ['Did you know? {topic}. Here are the key facts. \u{1F4CA}'],
    };

    const templateList = templates[tone] ?? templates[Tone.PROFESSIONAL];
    const template = templateList[Math.floor(Math.random() * templateList.length)];
    const content = template.replace('{topic}', newsItem.topic.slice(0, 100));

    return {
      postId: uuidv4(),
      content,
      platform,
      hashtags: newsItem.keywords.slice(0, 5),
      imagePrompt: `Professional illustration representing: ${newsItem.topic.slice(0, 50)}`,
      tone,
      characterCount: content.length,
      newsSource: newsItem.url,
      createdAt: new Date(),
    };
  }
}
