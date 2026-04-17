/**
 * Image Generation Agent - Creates images using Grok (xAI) with Unsplash fallback.
 */

import { BaseAgent } from './baseAgent';
import { Config } from '../config';
import { SocialPost, ImageSet, GeneratedImage, ImageDimensions, PLATFORM_DIMENSIONS } from '../models';
import { RateLimiter, retryWithBackoff } from '../utils';

// Unsplash fallback images by category
const UNSPLASH_FALLBACKS = [
  'https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=1200', // News
  'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=1200', // Social
  'https://images.unsplash.com/photo-1557804506-669a67965ba0?w=1200', // Business
  'https://images.unsplash.com/photo-1518770660439-4636190af475?w=1200', // Tech
  'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1200', // Analytics
];

export class ImageAgent extends BaseAgent {
  private config: Config;
  private useGrok: boolean;
  private useDalle: boolean;
  private useStability: boolean;

  constructor(config: Config, rateLimiter?: RateLimiter) {
    super('image_agent', rateLimiter);
    this.config = config;
    this.useGrok = !!config.xaiApiKey;
    this.useDalle = !!config.openaiApiKey;
    this.useStability = !!config.stabilityApiKey;
  }

  async execute(posts: SocialPost[], imagesPerPost = 1): Promise<ImageSet[]> {
    imagesPerPost = Math.min(Math.max(imagesPerPost, 1), 3);

    const provider = this.useGrok ? 'Grok' : this.useDalle ? 'DALL-E' : this.useStability ? 'Stability' : 'Unsplash fallback';
    this.logger.info(`Generating images for ${posts.length} posts using ${provider}`);

    const imageSets: ImageSet[] = [];
    const batchSize = 5;

    // Process posts in batches
    for (let i = 0; i < posts.length; i += batchSize) {
      const batch = posts.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map((post) => this.generateImagesForPost(post, imagesPerPost))
      );

      for (let j = 0; j < batch.length; j++) {
        const result = results[j];
        const post = batch[j];

        if (result.status === 'fulfilled') {
          imageSets.push(result.value);
        } else {
          this.logger.error(`Image generation failed for ${post.postId}: ${result.reason}`);
          imageSets.push(this.getUnsplashFallback(post));
        }
      }
    }

    this.logger.info(`Generated ${imageSets.length} image sets`);
    return imageSets;
  }

  private async generateImagesForPost(post: SocialPost, count: number): Promise<ImageSet> {
    if (!post.imagePrompt) {
      this.logger.debug(`No image prompt for post ${post.postId}`);
      return this.getUnsplashFallback(post);
    }

    const dimensions = PLATFORM_DIMENSIONS[post.platform] ?? [{ width: 1024, height: 1024 }];
    const images: GeneratedImage[] = [];

    // For carousel posts, generate one image per slide using each slide's prompt
    if (post.carouselSlides && post.carouselSlides.length > 0) {
      const carouselDim = dimensions.find((d) => d.width === 1080 && d.height === 1350) ?? dimensions[0];
      this.logger.info(`Generating ${post.carouselSlides.length} carousel slide images for ${post.postId}`);

      for (const slide of post.carouselSlides) {
        try {
          const image = await this.generateSingleImage(slide.imagePrompt, carouselDim);
          images.push({ ...image, altText: `Slide ${slide.slideNumber}: ${slide.text.slice(0, 80)}` });
        } catch (e) {
          this.logger.warn(`Carousel slide ${slide.slideNumber} image failed, using fallback: ${e}`);
          images.push(this.getUnsplashImage(carouselDim, slide.slideNumber));
        }
      }

      return { postId: post.postId, images, createdAt: new Date() };
    }

    // Standard single-image flow
    for (let i = 0; i < count; i++) {
      const dim = dimensions[i % dimensions.length];

      try {
        if (this.useGrok) {
          const image = await this.generateWithGrok(post.imagePrompt, dim);
          images.push(image);
        } else if (this.useDalle) {
          const image = await this.generateWithDalle(post.imagePrompt, dim);
          images.push(image);
        } else if (this.useStability) {
          const image = await this.generateWithStability(post.imagePrompt, dim);
          images.push(image);
        } else {
          images.push(this.getUnsplashImage(dim, i));
        }
      } catch (e) {
        this.logger.warn(`AI image generation failed, falling back to Unsplash: ${e}`);
        images.push(this.getUnsplashImage(dim, i));
      }
    }

    return {
      postId: post.postId,
      images,
      createdAt: new Date(),
    };
  }

  /**
   * Generate a single image using the best available provider.
   */
  private async generateSingleImage(prompt: string, dim: ImageDimensions): Promise<GeneratedImage> {
    if (this.useGrok) {
      return this.generateWithGrok(prompt, dim);
    } else if (this.useDalle) {
      return this.generateWithDalle(prompt, dim);
    } else if (this.useStability) {
      return this.generateWithStability(prompt, dim);
    }
    throw new Error('No image provider configured');
  }

  private async generateWithGrok(prompt: string, dimensions: ImageDimensions): Promise<GeneratedImage> {
    if (!(await this.rateLimiter.acquire('xai_grok'))) {
      throw new Error('Grok rate limited');
    }

    return retryWithBackoff(
      async () => {
        const response = await fetch('https://api.x.ai/v1/images/generations', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.config.xaiApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            prompt: this.enhancePrompt(prompt),
            model: 'grok-imagine-image',
            n: 1,
            response_format: 'url',
          }),
          signal: AbortSignal.timeout(120000),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Grok API error: ${response.status} - ${errorText}`);
        }

        const data = await response.json() as {
          data?: Array<{ url?: string; b64_json?: string }>;
        };

        const imageData = data.data?.[0];
        const imageUrl = imageData?.url ?? '';

        if (!imageUrl) {
          throw new Error('No image URL returned from Grok API');
        }

        return {
          url: imageUrl,
          format: 'png' as const,
          dimensions,
          altText: prompt.slice(0, 200),
        };
      },
      { maxRetries: 2, baseDelayMs: 5000 }
    );
  }

  private async generateWithDalle(prompt: string, dimensions: ImageDimensions): Promise<GeneratedImage> {
    if (!(await this.rateLimiter.acquire('openai_dalle'))) {
      throw new Error('DALL-E rate limited');
    }

    const aspectRatio = dimensions.width / dimensions.height;
    let size: string;
    if (aspectRatio > 1.5) {
      size = '1792x1024';
    } else if (aspectRatio < 0.7) {
      size = '1024x1792';
    } else {
      size = '1024x1024';
    }

    return retryWithBackoff(
      async () => {
        const response = await fetch('https://api.openai.com/v1/images/generations', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.config.openaiApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'dall-e-3',
            prompt: this.enhancePrompt(prompt),
            n: 1,
            size,
            quality: 'standard',
            response_format: 'url',
          }),
          signal: AbortSignal.timeout(120000),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`DALL-E API error: ${response.status} - ${errorText}`);
        }

        const data = await response.json() as {
          data?: Array<{ url?: string }>;
        };
        const imageUrl = data.data?.[0]?.url ?? '';

        const [width, height] = size.split('x').map(Number);

        return {
          url: imageUrl,
          format: 'png' as const,
          dimensions: { width, height },
          altText: prompt.slice(0, 200),
        };
      },
      { maxRetries: 2, baseDelayMs: 5000 }
    );
  }

  private async generateWithStability(prompt: string, dimensions: ImageDimensions): Promise<GeneratedImage> {
    if (!(await this.rateLimiter.acquire('stability'))) {
      throw new Error('Stability AI rate limited');
    }

    return retryWithBackoff(
      async () => {
        const response = await fetch(
          'https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image',
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${this.config.stabilityApiKey}`,
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
            body: JSON.stringify({
              text_prompts: [{ text: this.enhancePrompt(prompt), weight: 1.0 }],
              cfg_scale: 7,
              height: Math.min(dimensions.height, 1024),
              width: Math.min(dimensions.width, 1024),
              samples: 1,
              steps: 30,
            }),
            signal: AbortSignal.timeout(120000),
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Stability API error: ${response.status} - ${errorText}`);
        }

        const data = await response.json() as {
          artifacts?: Array<{ base64?: string }>;
        };
        const base64Data = data.artifacts?.[0]?.base64 ?? '';

        return {
          url: `data:image/png;base64,${base64Data}`,
          format: 'png' as const,
          dimensions,
          altText: prompt.slice(0, 200),
        };
      },
      { maxRetries: 2, baseDelayMs: 5000 }
    );
  }

  private enhancePrompt(prompt: string): string {
    // Strip any text/quote/headline instructions that leaked into the prompt
    const cleaned = prompt
      .replace(/[""\u201C\u201D].{5,}?[""\u201C\u201D]/g, '')
      .replace(/with (?:the )?(?:text|words|headline|title|caption|slogan|quote|phrase|overlay).*/gi, '')
      .replace(/(?:text|headline|title|caption|slogan|typography|words|letters)\s*(?:overlay|reading|saying|that says).*/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
    const base = cleaned.includes('high quality') ? cleaned : `${cleaned}, high quality, professional, detailed, vibrant colors`;
    return `${base}. Photorealistic or cinematic illustration. Absolutely NO text, NO words, NO letters, NO numbers, NO typography, NO headlines, NO captions, NO watermarks anywhere in the image. The image must contain ZERO readable characters of any kind. Pure visual imagery only.`;
  }

  private getUnsplashImage(dimensions: ImageDimensions, index = 0): GeneratedImage {
    const stockUrl = UNSPLASH_FALLBACKS[index % UNSPLASH_FALLBACKS.length];

    let finalUrl = stockUrl;
    try {
      const parsed = new URL(stockUrl);
      if (parsed.hostname === 'images.unsplash.com') {
        finalUrl = `${stockUrl}&h=${dimensions.height}&w=${dimensions.width}&fit=crop`;
      }
    } catch {
      // If URL parsing fails, use original URL
    }

    return {
      url: finalUrl,
      format: 'jpeg',
      dimensions,
      altText: 'Unsplash stock image',
    };
  }

  private getUnsplashFallback(post: SocialPost): ImageSet {
    const dimensions = PLATFORM_DIMENSIONS[post.platform]?.[0] ?? { width: 1024, height: 1024 };

    return {
      postId: post.postId,
      images: [this.getUnsplashImage(dimensions)],
      createdAt: new Date(),
    };
  }
}
