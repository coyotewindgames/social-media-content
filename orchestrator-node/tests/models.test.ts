/**
 * Unit tests for data models.
 */

import {
  Platform,
  Tone,
  AgentStatus,
  PublishStatus,
  PLATFORM_LIMITS,
  PLATFORM_DIMENSIONS,
  validatePostLength,
  createSocialPost,
} from '../src/models';

describe('Enums', () => {
  describe('Platform', () => {
    it('should have all expected platforms', () => {
      expect(Platform.TWITTER).toBe('twitter');
      expect(Platform.LINKEDIN).toBe('linkedin');
      expect(Platform.INSTAGRAM).toBe('instagram');
      expect(Platform.FACEBOOK).toBe('facebook');
      expect(Platform.TIKTOK).toBe('tiktok');
    });
  });

  describe('Tone', () => {
    it('should have all expected tones', () => {
      expect(Tone.CASUAL).toBe('casual');
      expect(Tone.PROFESSIONAL).toBe('professional');
      expect(Tone.PLAYFUL).toBe('playful');
      expect(Tone.INSPIRATIONAL).toBe('inspirational');
      expect(Tone.INFORMATIVE).toBe('informative');
    });
  });

  describe('AgentStatus', () => {
    it('should have all expected statuses', () => {
      expect(AgentStatus.PENDING).toBe('pending');
      expect(AgentStatus.RUNNING).toBe('running');
      expect(AgentStatus.SUCCESS).toBe('success');
      expect(AgentStatus.FAILED).toBe('failed');
      expect(AgentStatus.RETRYING).toBe('retrying');
    });
  });

  describe('PublishStatus', () => {
    it('should have all expected statuses', () => {
      expect(PublishStatus.QUEUED).toBe('queued');
      expect(PublishStatus.PUBLISHED).toBe('published');
      expect(PublishStatus.FAILED).toBe('failed');
      expect(PublishStatus.PENDING_REVIEW).toBe('pending_review');
      expect(PublishStatus.SCHEDULED).toBe('scheduled');
    });
  });
});

describe('PLATFORM_LIMITS', () => {
  it('should have limits for all platforms', () => {
    for (const platform of Object.values(Platform)) {
      expect(PLATFORM_LIMITS[platform]).toBeDefined();
      expect(PLATFORM_LIMITS[platform].maxChars).toBeGreaterThan(0);
      expect(PLATFORM_LIMITS[platform].maxHashtags).toBeGreaterThan(0);
      expect(typeof PLATFORM_LIMITS[platform].imageRequired).toBe('boolean');
    }
  });

  it('should have correct Twitter limits', () => {
    expect(PLATFORM_LIMITS[Platform.TWITTER].maxChars).toBe(280);
    expect(PLATFORM_LIMITS[Platform.TWITTER].maxHashtags).toBe(5);
    expect(PLATFORM_LIMITS[Platform.TWITTER].imageRequired).toBe(false);
  });

  it('should have correct Instagram limits', () => {
    expect(PLATFORM_LIMITS[Platform.INSTAGRAM].maxChars).toBe(2200);
    expect(PLATFORM_LIMITS[Platform.INSTAGRAM].maxHashtags).toBe(30);
    expect(PLATFORM_LIMITS[Platform.INSTAGRAM].imageRequired).toBe(true);
  });
});

describe('PLATFORM_DIMENSIONS', () => {
  it('should have dimensions for all platforms', () => {
    for (const platform of Object.values(Platform)) {
      expect(PLATFORM_DIMENSIONS[platform]).toBeDefined();
      expect(PLATFORM_DIMENSIONS[platform].length).toBeGreaterThan(0);
    }
  });

  it('should have valid dimensions', () => {
    for (const platform of Object.values(Platform)) {
      for (const dim of PLATFORM_DIMENSIONS[platform]) {
        expect(dim.width).toBeGreaterThan(0);
        expect(dim.height).toBeGreaterThan(0);
      }
    }
  });
});

describe('validatePostLength', () => {
  it('should return true for valid length', () => {
    expect(validatePostLength('Short post', Platform.TWITTER)).toBe(true);
    expect(validatePostLength('A'.repeat(280), Platform.TWITTER)).toBe(true);
  });

  it('should return false for too long content', () => {
    expect(validatePostLength('A'.repeat(281), Platform.TWITTER)).toBe(false);
    expect(validatePostLength('A'.repeat(3001), Platform.LINKEDIN)).toBe(false);
  });
});

describe('createSocialPost', () => {
  it('should create post with calculated character count', () => {
    const post = createSocialPost({
      postId: 'test-id',
      content: 'Hello world!',
      platform: Platform.TWITTER,
      hashtags: [],
      tone: Tone.CASUAL,
      createdAt: new Date(),
    });

    expect(post.characterCount).toBe(12);
  });

  it('should include all provided fields', () => {
    const post = createSocialPost({
      postId: 'test-id',
      content: 'Test content',
      platform: Platform.LINKEDIN,
      hashtags: ['test', 'post'],
      imagePrompt: 'Generate an image',
      tone: Tone.PROFESSIONAL,
      callToAction: 'Learn more',
      newsSource: 'https://example.com',
      createdAt: new Date(),
    });

    expect(post.postId).toBe('test-id');
    expect(post.platform).toBe(Platform.LINKEDIN);
    expect(post.hashtags).toEqual(['test', 'post']);
    expect(post.imagePrompt).toBe('Generate an image');
    expect(post.callToAction).toBe('Learn more');
    expect(post.newsSource).toBe('https://example.com');
  });
});
