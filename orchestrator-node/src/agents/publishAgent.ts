/**
 * Publishing Agent - Posts content to social media platforms.
 */

import { BaseAgent } from './baseAgent';
import { Config } from '../config';
import { SocialPost, ImageSet, PublishResult, PublishStatus, Platform } from '../models';
import { RateLimiter, retryWithBackoff, sleep } from '../utils';

export class PublishAgent extends BaseAgent {
  private config: Config;
  private maxRetries = 3;
  private manualReviewQueue: PublishResult[] = [];

  constructor(config: Config, rateLimiter?: RateLimiter) {
    super('publish_agent', rateLimiter);
    this.config = config;
  }

  async execute(
    posts: SocialPost[],
    imageSets: ImageSet[],
    dryRun = false
  ): Promise<PublishResult[]> {
    this.logger.info(`Publishing ${posts.length} posts (dryRun=${dryRun})`);

    // Create image lookup
    const imagesByPost = new Map<string, ImageSet>();
    for (const imageSet of imageSets) {
      imagesByPost.set(imageSet.postId, imageSet);
    }

    const results: PublishResult[] = [];

    for (const post of posts) {
      const images = imagesByPost.get(post.postId);

      if (dryRun) {
        results.push(this.simulatePublish(post, images));
      } else {
        const result = await this.publishPost(post, images);
        results.push(result);

        // Stagger posts to avoid spam appearance
        await sleep(2000);
      }
    }

    // Log summary
    const successCount = results.filter((r) => r.status === PublishStatus.PUBLISHED).length;
    const failedCount = results.filter((r) => r.status === PublishStatus.FAILED).length;
    const reviewCount = results.filter((r) => r.status === PublishStatus.PENDING_REVIEW).length;

    this.logger.info(
      `Publishing complete: ${successCount} success, ${failedCount} failed, ${reviewCount} pending review`
    );

    return results;
  }

  private async publishPost(post: SocialPost, images?: ImageSet): Promise<PublishResult> {
    const platformHandlers: Record<Platform, (p: SocialPost, i?: ImageSet) => Promise<PublishResult>> = {
      [Platform.TWITTER]: (p, i) => this.publishTwitter(p, i),
      [Platform.LINKEDIN]: (p, i) => this.publishLinkedIn(p, i),
      [Platform.INSTAGRAM]: (p, i) => this.publishInstagram(p, i),
      [Platform.FACEBOOK]: (p, i) => this.publishFacebook(p, i),
      [Platform.TIKTOK]: (p, i) => this.publishTikTok(p, i),
    };

    const handler = platformHandlers[post.platform];
    if (!handler) {
      return {
        postId: post.postId,
        platform: post.platform,
        status: PublishStatus.FAILED,
        errorMessage: `Unsupported platform: ${post.platform}`,
        retryCount: 0,
      };
    }

    let lastError: string | undefined;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const result = await handler(post, images);
        if (result.status === PublishStatus.PUBLISHED) {
          return result;
        }
        lastError = result.errorMessage;
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e);
        this.logger.warn(`Publish attempt ${attempt + 1} failed for ${post.postId}: ${lastError}`);

        if (attempt < this.maxRetries - 1) {
          await sleep(5000 * (attempt + 1));
        }
      }
    }

    // All retries failed - queue for manual review
    const result: PublishResult = {
      postId: post.postId,
      platform: post.platform,
      status: PublishStatus.PENDING_REVIEW,
      errorMessage: `Max retries exceeded: ${lastError}`,
      retryCount: this.maxRetries,
    };
    this.manualReviewQueue.push(result);
    return result;
  }

  private async publishTwitter(post: SocialPost, _images?: ImageSet): Promise<PublishResult> {
    if (!this.config.twitterAccessToken) {
      return {
        postId: post.postId,
        platform: Platform.TWITTER,
        status: PublishStatus.FAILED,
        errorMessage: 'Twitter credentials not configured',
        retryCount: 0,
      };
    }

    if (!(await this.rateLimiter.acquire('twitter_post'))) {
      return {
        postId: post.postId,
        platform: Platform.TWITTER,
        status: PublishStatus.FAILED,
        errorMessage: 'Twitter rate limited',
        retryCount: 0,
      };
    }

    return retryWithBackoff(
      async () => {
        const tweetData: { text: string; media?: { media_ids: string[] } } = {
          text: post.content,
        };

        // Note: Media upload requires additional implementation
        // This is a simplified version

        const response = await fetch('https://api.twitter.com/2/tweets', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.config.twitterAccessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(tweetData),
          signal: AbortSignal.timeout(30000),
        });

        if (response.status === 201) {
          const data = await response.json() as { data?: { id?: string } };
          const tweetId = data.data?.id ?? '';
          return {
            postId: post.postId,
            platform: Platform.TWITTER,
            status: PublishStatus.PUBLISHED,
            postUrl: `https://twitter.com/i/web/status/${tweetId}`,
            retryCount: 0,
            publishedAt: new Date(),
          };
        } else {
          const errorText = await response.text();
          return {
            postId: post.postId,
            platform: Platform.TWITTER,
            status: PublishStatus.FAILED,
            errorMessage: `Twitter API error: ${response.status} - ${errorText}`,
            retryCount: 0,
          };
        }
      },
      { maxRetries: 2, baseDelayMs: 3000 }
    );
  }

  private async publishLinkedIn(post: SocialPost, _images?: ImageSet): Promise<PublishResult> {
    if (!this.config.linkedinAccessToken) {
      return {
        postId: post.postId,
        platform: Platform.LINKEDIN,
        status: PublishStatus.FAILED,
        errorMessage: 'LinkedIn credentials not configured',
        retryCount: 0,
      };
    }

    if (!(await this.rateLimiter.acquire('linkedin_post'))) {
      return {
        postId: post.postId,
        platform: Platform.LINKEDIN,
        status: PublishStatus.FAILED,
        errorMessage: 'LinkedIn rate limited',
        retryCount: 0,
      };
    }

    return retryWithBackoff(
      async () => {
        // First get user URN
        const meResponse = await fetch('https://api.linkedin.com/v2/me', {
          headers: {
            Authorization: `Bearer ${this.config.linkedinAccessToken}`,
          },
          signal: AbortSignal.timeout(30000),
        });

        if (!meResponse.ok) {
          return {
            postId: post.postId,
            platform: Platform.LINKEDIN,
            status: PublishStatus.FAILED,
            errorMessage: 'Failed to get LinkedIn user info',
            retryCount: 0,
          };
        }

        const userData = await meResponse.json() as { id?: string };
        const userUrn = `urn:li:person:${userData.id}`;

        // Create post
        const postData = {
          author: userUrn,
          lifecycleState: 'PUBLISHED',
          specificContent: {
            'com.linkedin.ugc.ShareContent': {
              shareCommentary: { text: post.content },
              shareMediaCategory: 'NONE',
            },
          },
          visibility: {
            'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
          },
        };

        const response = await fetch('https://api.linkedin.com/v2/ugcPosts', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.config.linkedinAccessToken}`,
            'Content-Type': 'application/json',
            'X-Restli-Protocol-Version': '2.0.0',
          },
          body: JSON.stringify(postData),
          signal: AbortSignal.timeout(30000),
        });

        if (response.status === 201) {
          const data = await response.json() as { id?: string };
          const postUrn = data.id ?? '';
          return {
            postId: post.postId,
            platform: Platform.LINKEDIN,
            status: PublishStatus.PUBLISHED,
            postUrl: `https://www.linkedin.com/feed/update/${postUrn}`,
            retryCount: 0,
            publishedAt: new Date(),
          };
        } else {
          const errorText = await response.text();
          return {
            postId: post.postId,
            platform: Platform.LINKEDIN,
            status: PublishStatus.FAILED,
            errorMessage: `LinkedIn API error: ${response.status} - ${errorText}`,
            retryCount: 0,
          };
        }
      },
      { maxRetries: 2, baseDelayMs: 3000 }
    );
  }

  private async publishInstagram(post: SocialPost, images?: ImageSet): Promise<PublishResult> {
    if (!this.config.instagramAccessToken || !this.config.instagramBusinessId) {
      return {
        postId: post.postId,
        platform: Platform.INSTAGRAM,
        status: PublishStatus.FAILED,
        errorMessage: 'Instagram credentials not configured',
        retryCount: 0,
      };
    }

    if (!images || images.images.length === 0) {
      return {
        postId: post.postId,
        platform: Platform.INSTAGRAM,
        status: PublishStatus.FAILED,
        errorMessage: 'Instagram requires an image',
        retryCount: 0,
      };
    }

    if (!(await this.rateLimiter.acquire('instagram_post'))) {
      return {
        postId: post.postId,
        platform: Platform.INSTAGRAM,
        status: PublishStatus.FAILED,
        errorMessage: 'Instagram rate limited',
        retryCount: 0,
      };
    }

    // Step 1: Create media container
    const containerUrl = new URL(
      `https://graph.facebook.com/v18.0/${this.config.instagramBusinessId}/media`
    );
    containerUrl.searchParams.set('image_url', images.images[0].url);
    containerUrl.searchParams.set('caption', post.content);
    containerUrl.searchParams.set('access_token', this.config.instagramAccessToken);

    const containerResponse = await fetch(containerUrl.toString(), {
      method: 'POST',
      signal: AbortSignal.timeout(60000),
    });

    if (!containerResponse.ok) {
      const errorText = await containerResponse.text();
      return {
        postId: post.postId,
        platform: Platform.INSTAGRAM,
        status: PublishStatus.FAILED,
        errorMessage: `Instagram container error: ${errorText}`,
        retryCount: 0,
      };
    }

    const containerData = await containerResponse.json() as { id?: string };
    const containerId = containerData.id;

    // Step 2: Publish the container
    const publishUrl = new URL(
      `https://graph.facebook.com/v18.0/${this.config.instagramBusinessId}/media_publish`
    );
    publishUrl.searchParams.set('creation_id', containerId ?? '');
    publishUrl.searchParams.set('access_token', this.config.instagramAccessToken);

    const publishResponse = await fetch(publishUrl.toString(), {
      method: 'POST',
      signal: AbortSignal.timeout(60000),
    });

    if (publishResponse.ok) {
      const data = await publishResponse.json() as { id?: string };
      const mediaId = data.id ?? '';
      return {
        postId: post.postId,
        platform: Platform.INSTAGRAM,
        status: PublishStatus.PUBLISHED,
        postUrl: `https://www.instagram.com/p/${mediaId}`,
        retryCount: 0,
        publishedAt: new Date(),
      };
    } else {
      const errorText = await publishResponse.text();
      return {
        postId: post.postId,
        platform: Platform.INSTAGRAM,
        status: PublishStatus.FAILED,
        errorMessage: `Instagram publish error: ${errorText}`,
        retryCount: 0,
      };
    }
  }

  private async publishFacebook(post: SocialPost, images?: ImageSet): Promise<PublishResult> {
    if (!this.config.facebookAccessToken || !this.config.facebookPageId) {
      return {
        postId: post.postId,
        platform: Platform.FACEBOOK,
        status: PublishStatus.FAILED,
        errorMessage: 'Facebook credentials not configured',
        retryCount: 0,
      };
    }

    if (!(await this.rateLimiter.acquire('facebook_post'))) {
      return {
        postId: post.postId,
        platform: Platform.FACEBOOK,
        status: PublishStatus.FAILED,
        errorMessage: 'Facebook rate limited',
        retryCount: 0,
      };
    }

    const formData = new URLSearchParams();
    formData.append('message', post.content);
    formData.append('access_token', this.config.facebookAccessToken);

    if (images && images.images.length > 0) {
      formData.append('link', images.images[0].url);
    }

    const response = await fetch(
      `https://graph.facebook.com/v18.0/${this.config.facebookPageId}/feed`,
      {
        method: 'POST',
        body: formData,
        signal: AbortSignal.timeout(30000),
      }
    );

    if (response.ok) {
      const data = await response.json() as { id?: string };
      const fbPostId = data.id ?? '';
      return {
        postId: post.postId,
        platform: Platform.FACEBOOK,
        status: PublishStatus.PUBLISHED,
        postUrl: `https://www.facebook.com/${fbPostId}`,
        retryCount: 0,
        publishedAt: new Date(),
      };
    } else {
      const errorText = await response.text();
      return {
        postId: post.postId,
        platform: Platform.FACEBOOK,
        status: PublishStatus.FAILED,
        errorMessage: `Facebook API error: ${response.status} - ${errorText}`,
        retryCount: 0,
      };
    }
  }

  private async publishTikTok(post: SocialPost, _images?: ImageSet): Promise<PublishResult> {
    // TikTok's Content Posting API has limited availability
    return {
      postId: post.postId,
      platform: Platform.TIKTOK,
      status: PublishStatus.PENDING_REVIEW,
      errorMessage: 'TikTok posting requires manual upload or approved API access',
      retryCount: 0,
    };
  }

  private simulatePublish(post: SocialPost, images?: ImageSet): PublishResult {
    this.logger.info(`[DRY RUN] Would publish to ${post.platform}:`);
    this.logger.info(`  Content: ${post.content.slice(0, 100)}...`);
    if (images && images.images.length > 0) {
      this.logger.info(`  Images: ${images.images.length}`);
    }

    return {
      postId: post.postId,
      platform: post.platform,
      status: PublishStatus.PUBLISHED,
      postUrl: `https://example.com/dry-run/${post.postId}`,
      retryCount: 0,
      publishedAt: new Date(),
    };
  }

  getManualReviewQueue(): PublishResult[] {
    return [...this.manualReviewQueue];
  }

  clearManualReviewQueue(): void {
    this.manualReviewQueue = [];
  }
}
