/**
 * ImageGenerationStep — generates images for each post.
 *
 * Non-fatal: falls back to stock Unsplash images on failure.
 */

import { AbstractPipelineStep, StepResult } from '../PipelineStep';
import { PipelineContext } from '../PipelineContext';
import { ImageAgent } from '../../agents';
import { Config } from '../../config';
import { ImageSet } from '../../models';

export class ImageGenerationStep extends AbstractPipelineStep {
  readonly name = 'image_agent';

  constructor(
    private imageAgent: ImageAgent,
    private config: Config,
  ) {
    super();
  }

  async execute(ctx: PipelineContext): Promise<StepResult> {
    const imagesPerPost = ctx.options.imagesPerPost ?? this.config.imagesPerPost;

    try {
      const imageSets = await this.imageAgent.run<ImageSet[]>(ctx.posts, imagesPerPost);
      ctx.imageSets = imageSets;
      this.logger.info(`Image agent completed: ${imageSets.length} image sets`);
      return this.success();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      ctx.errorLog.push(`Image agent error (using stock images): ${errorMessage}`);
      this.logger.warn(`Image agent failed, using stock images: ${errorMessage}`);

      // Fallback: stock image sets
      ctx.imageSets = ctx.posts.map((post) => ({
        postId: post.postId,
        images: [
          {
            url: 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=1200',
            format: 'jpeg',
            dimensions: { width: 1200, height: 675 },
            altText: 'Stock image',
          },
        ],
        createdAt: new Date(),
      }));
      return this.success();
    }
  }
}
