/**
 * API helper utilities including rate limiting, caching, and retry logic.
 */

import { getLogger } from './logger';

const logger = getLogger('api-helpers');

/**
 * Token bucket rate limiter for API calls.
 */
export class RateLimiter {
  private callsPerMinute: number;
  private callsPerDay: number;
  private minuteTokens: Map<string, Date[]> = new Map();
  private dayTokens: Map<string, Date[]> = new Map();

  constructor(callsPerMinute = 60, callsPerDay = 1000) {
    this.callsPerMinute = callsPerMinute;
    this.callsPerDay = callsPerDay;
  }

  /**
   * Acquire a rate limit token for the specified API.
   */
  async acquire(apiName: string): Promise<boolean> {
    const now = new Date();
    const minuteAgo = new Date(now.getTime() - 60 * 1000);
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Clean old tokens
    const minuteTokens = (this.minuteTokens.get(apiName) ?? []).filter((t) => t > minuteAgo);
    const dayTokens = (this.dayTokens.get(apiName) ?? []).filter((t) => t > dayAgo);

    // Check limits
    if (minuteTokens.length >= this.callsPerMinute) {
      logger.warn(`Rate limited (minute): ${apiName}`);
      return false;
    }

    if (dayTokens.length >= this.callsPerDay) {
      logger.warn(`Rate limited (day): ${apiName}`);
      return false;
    }

    // Acquire token
    minuteTokens.push(now);
    dayTokens.push(now);
    this.minuteTokens.set(apiName, minuteTokens);
    this.dayTokens.set(apiName, dayTokens);

    return true;
  }

  /**
   * Wait for a rate limit token to become available.
   */
  async waitForToken(apiName: string, maxWaitMs = 60000): Promise<boolean> {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
      if (await this.acquire(apiName)) {
        return true;
      }
      await sleep(1000);
    }

    return false;
  }
}

/**
 * Simple in-memory cache for API responses.
 */
export class ResponseCache {
  private cache: Map<string, { value: unknown; expiry: Date }> = new Map();
  private defaultTtl: number;

  constructor(defaultTtlMs = 300000) {
    // 5 minutes default
    this.defaultTtl = defaultTtlMs;
  }

  /**
   * Generate cache key from arguments.
   */
  makeKey(...args: unknown[]): string {
    const keyData = JSON.stringify(args);
    // Simple hash using string charCode sum
    let hash = 0;
    for (let i = 0; i < keyData.length; i++) {
      const char = keyData.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }

  /**
   * Get cached value if not expired.
   */
  get<T>(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (entry && entry.expiry > new Date()) {
      logger.debug(`Cache hit: ${key.substring(0, 8)}...`);
      return entry.value as T;
    }

    if (entry) {
      this.cache.delete(key);
    }

    return undefined;
  }

  /**
   * Set cache value with TTL.
   */
  set(key: string, value: unknown, ttlMs?: number): void {
    const expiry = new Date(Date.now() + (ttlMs ?? this.defaultTtl));
    this.cache.set(key, { value, expiry });
    logger.debug(`Cached: ${key.substring(0, 8)}...`);
  }

  /**
   * Clear all cached values.
   */
  clear(): void {
    this.cache.clear();
  }
}

/**
 * Sleep for specified milliseconds.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff.
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    onRetry?: (attempt: number, error: Error) => void;
  } = {}
): Promise<T> {
  const { maxRetries = 3, baseDelayMs = 1000, maxDelayMs = 60000, onRetry } = options;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < maxRetries) {
        const delay = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs);
        logger.warn(`Retry ${attempt + 1}/${maxRetries}: ${lastError.message}`);

        if (onRetry) {
          onRetry(attempt + 1, lastError);
        }

        await sleep(delay);
      } else {
        logger.error(`Max retries exceeded: ${lastError.message}`);
      }
    }
  }

  throw lastError;
}

/**
 * Make an HTTP request with optional rate limiting.
 */
export async function makeApiRequest<T>(
  url: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
    timeout?: number;
    rateLimiter?: RateLimiter;
    apiName?: string;
  } = {}
): Promise<T> {
  const { method = 'GET', headers = {}, body, timeout = 30000, rateLimiter, apiName } = options;

  if (rateLimiter && apiName) {
    const acquired = await rateLimiter.waitForToken(apiName);
    if (!acquired) {
      throw new Error(`Rate limit exceeded for ${apiName}`);
    }
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const fetchOptions: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      signal: controller.signal,
    };

    if (body) {
      fetchOptions.body = JSON.stringify(body);
    }

    const response = await fetch(url, fetchOptions);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timeoutId);
  }
}

// Global cache instance
export const globalCache = new ResponseCache();
