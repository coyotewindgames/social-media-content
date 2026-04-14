/**
 * Tests for content deduplication via SHA-256 hashing.
 * Validates the normalization and hashing logic used in post history.
 */

import { createHash } from 'crypto';

/**
 * Replicates the normalization logic used in orchestrator.recordPostHistory().
 */
function normalizeContent(content: string): string {
  return content.toLowerCase().replace(/\s+/g, ' ').trim();
}

function hashContent(content: string): string {
  const normalized = normalizeContent(content);
  return createHash('sha256').update(normalized).digest('hex');
}

describe('Content Deduplication', () => {
  describe('normalizeContent', () => {
    it('should lowercase all text', () => {
      expect(normalizeContent('Hello WORLD')).toBe('hello world');
    });

    it('should collapse multiple spaces to one', () => {
      expect(normalizeContent('hello   world')).toBe('hello world');
    });

    it('should collapse tabs and newlines', () => {
      expect(normalizeContent('hello\t\nworld')).toBe('hello world');
    });

    it('should trim leading/trailing whitespace', () => {
      expect(normalizeContent('  hello world  ')).toBe('hello world');
    });

    it('should handle empty string', () => {
      expect(normalizeContent('')).toBe('');
    });
  });

  describe('hashContent', () => {
    it('should produce consistent hashes for identical content', () => {
      const a = hashContent('The economy is strong today!');
      const b = hashContent('The economy is strong today!');
      expect(a).toBe(b);
    });

    it('should produce same hash regardless of casing', () => {
      const a = hashContent('THE ECONOMY IS STRONG');
      const b = hashContent('the economy is strong');
      expect(a).toBe(b);
    });

    it('should produce same hash regardless of whitespace differences', () => {
      const a = hashContent('hello   world');
      const b = hashContent('hello world');
      const c = hashContent('  hello\tworld  ');
      expect(a).toBe(b);
      expect(b).toBe(c);
    });

    it('should produce different hashes for different content', () => {
      const a = hashContent('Post about economics');
      const b = hashContent('Post about technology');
      expect(a).not.toBe(b);
    });

    it('should produce a 64-character hex string (SHA-256)', () => {
      const hash = hashContent('test content');
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should detect near-duplicates after normalization', () => {
      const original = hashContent('Breaking: Fed raises rates by 0.25%. More pain ahead?');
      const variant = hashContent('BREAKING: Fed raises rates by 0.25%.  More pain ahead?');
      expect(original).toBe(variant);
    });

    it('should NOT match posts with different wording', () => {
      const a = hashContent('Fed raises rates today');
      const b = hashContent('Federal Reserve increases interest rates today');
      expect(a).not.toBe(b);
    });
  });

  describe('dedup window integration', () => {
    it('should identify duplicates in a sliding window of posts', () => {
      const postHistory = [
        'Post about AI advancements in healthcare',
        'Federal Reserve monetary policy update',
        'Climate change legislation debate',
      ].map((content) => ({
        content,
        hash: hashContent(content),
      }));

      const newPost = 'Post about AI advancements in healthcare';
      const newHash = hashContent(newPost);

      const isDuplicate = postHistory.some((p) => p.hash === newHash);
      expect(isDuplicate).toBe(true);
    });

    it('should not flag unique posts as duplicates', () => {
      const postHistory = [
        'Post about AI advancements in healthcare',
        'Federal Reserve monetary policy update',
      ].map((content) => ({
        content,
        hash: hashContent(content),
      }));

      const newPost = 'New trade agreements reshape global markets';
      const newHash = hashContent(newPost);

      const isDuplicate = postHistory.some((p) => p.hash === newHash);
      expect(isDuplicate).toBe(false);
    });
  });
});
