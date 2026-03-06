/**
 * Unit tests for Provider Fallback orchestration.
 */

import {
  Provider,
  ProviderErrorType,
  ProviderError,
  detectErrorType,
  shouldFallback,
  generateWithFallback,
} from '../src/providerFallback';

// Mock fetch globally
const originalFetch = global.fetch;

describe('ProviderFallback', () => {
  beforeEach(() => {
    // Reset environment variables
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    jest.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('ProviderError', () => {
    it('should create error with correct properties', () => {
      const error = new ProviderError(
        'Test error',
        Provider.OPENAI,
        ProviderErrorType.NETWORK_ERROR,
        500
      );

      expect(error.message).toBe('Test error');
      expect(error.provider).toBe(Provider.OPENAI);
      expect(error.errorType).toBe(ProviderErrorType.NETWORK_ERROR);
      expect(error.statusCode).toBe(500);
      expect(error.name).toBe('ProviderError');
    });

    it('should preserve original error', () => {
      const originalError = new Error('Original');
      const error = new ProviderError(
        'Wrapped error',
        Provider.CLAUDE,
        ProviderErrorType.TIMEOUT,
        undefined,
        originalError
      );

      expect(error.originalError).toBe(originalError);
    });
  });

  describe('detectErrorType', () => {
    it('should detect rate limit from status code 429', () => {
      const result = detectErrorType(new Error('Rate limited'), 429);
      expect(result).toBe(ProviderErrorType.RATE_LIMIT);
    });

    it('should detect invalid API key from status code 401', () => {
      const result = detectErrorType(new Error('Unauthorized'), 401);
      expect(result).toBe(ProviderErrorType.INVALID_API_KEY);
    });

    it('should detect invalid API key from status code 403', () => {
      const result = detectErrorType(new Error('Forbidden'), 403);
      expect(result).toBe(ProviderErrorType.INVALID_API_KEY);
    });

    it('should detect provider error from 5xx status codes', () => {
      expect(detectErrorType(new Error('Server error'), 500)).toBe(
        ProviderErrorType.PROVIDER_ERROR
      );
      expect(detectErrorType(new Error('Server error'), 502)).toBe(
        ProviderErrorType.PROVIDER_ERROR
      );
      expect(detectErrorType(new Error('Server error'), 503)).toBe(
        ProviderErrorType.PROVIDER_ERROR
      );
    });

    it('should detect timeout from AbortError', () => {
      const error = new Error('Aborted');
      error.name = 'AbortError';
      const result = detectErrorType(error);
      expect(result).toBe(ProviderErrorType.TIMEOUT);
    });

    it('should detect timeout from error message', () => {
      const result = detectErrorType(new Error('Request timed out'));
      expect(result).toBe(ProviderErrorType.TIMEOUT);
    });

    it('should detect network error from TypeError with fetch message', () => {
      const error = new TypeError('Failed to fetch');
      const result = detectErrorType(error);
      expect(result).toBe(ProviderErrorType.NETWORK_ERROR);
    });

    it('should detect network error from ECONNREFUSED', () => {
      const error = new Error('connect ECONNREFUSED 127.0.0.1:11434');
      const result = detectErrorType(error);
      expect(result).toBe(ProviderErrorType.NETWORK_ERROR);
    });

    it('should return unknown for unrecognized errors', () => {
      const result = detectErrorType(new Error('Something unexpected'));
      expect(result).toBe(ProviderErrorType.UNKNOWN);
    });
  });

  describe('shouldFallback', () => {
    it('should return true for network errors', () => {
      expect(shouldFallback(ProviderErrorType.NETWORK_ERROR)).toBe(true);
    });

    it('should return true for timeout errors', () => {
      expect(shouldFallback(ProviderErrorType.TIMEOUT)).toBe(true);
    });

    it('should return true for rate limit errors', () => {
      expect(shouldFallback(ProviderErrorType.RATE_LIMIT)).toBe(true);
    });

    it('should return true for invalid API key errors', () => {
      expect(shouldFallback(ProviderErrorType.INVALID_API_KEY)).toBe(true);
    });

    it('should return true for provider errors', () => {
      expect(shouldFallback(ProviderErrorType.PROVIDER_ERROR)).toBe(true);
    });

    it('should return false for unknown errors', () => {
      expect(shouldFallback(ProviderErrorType.UNKNOWN)).toBe(false);
    });
  });

  describe('generateWithFallback', () => {
    it('should attempt providers in priority order: OpenAI → Claude → Ollama', async () => {
      const attemptedProviders: Provider[] = [];

      // Mock fetch to track providers and simulate failures
      global.fetch = jest.fn().mockImplementation((url: string) => {
        if (url.includes('openai.com')) {
          attemptedProviders.push(Provider.OPENAI);
          return Promise.reject(new TypeError('Failed to fetch'));
        }
        if (url.includes('anthropic.com')) {
          attemptedProviders.push(Provider.CLAUDE);
          return Promise.reject(new TypeError('Failed to fetch'));
        }
        if (url.includes('localhost:11434')) {
          attemptedProviders.push(Provider.OLLAMA);
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                response: 'Generated content',
                model: 'llama2',
              }),
          });
        }
        return Promise.reject(new Error('Unknown URL'));
      });

      // Provide API keys to ensure all providers are attempted
      const result = await generateWithFallback('Test prompt', {
        apiKeys: {
          openai: 'test-openai-key',
          anthropic: 'test-anthropic-key',
        },
      });

      expect(attemptedProviders).toEqual([
        Provider.OPENAI,
        Provider.CLAUDE,
        Provider.OLLAMA,
      ]);
      expect(result.provider).toBe(Provider.OLLAMA);
      expect(result.content).toBe('Generated content');
    });

    it('should return result from first successful provider', async () => {
      // Mock fetch to succeed with OpenAI
      global.fetch = jest.fn().mockImplementation((url: string) => {
        if (url.includes('openai.com')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                choices: [{ message: { content: 'OpenAI response' } }],
                usage: {
                  prompt_tokens: 10,
                  completion_tokens: 20,
                  total_tokens: 30,
                },
              }),
          });
        }
        return Promise.reject(new Error('Should not reach here'));
      });

      const result = await generateWithFallback('Test prompt', {
        apiKeys: { openai: 'test-key' },
      });

      expect(result.provider).toBe(Provider.OPENAI);
      expect(result.content).toBe('OpenAI response');
      expect(result.attemptedProviders).toEqual([Provider.OPENAI]);
      expect(result.errors.length).toBe(0);
    });

    it('should track errors from failed providers', async () => {
      global.fetch = jest.fn().mockImplementation((url: string) => {
        if (url.includes('openai.com')) {
          return Promise.resolve({
            ok: false,
            status: 429,
            text: () => Promise.resolve('Rate limited'),
          });
        }
        if (url.includes('anthropic.com')) {
          return Promise.resolve({
            ok: false,
            status: 500,
            text: () => Promise.resolve('Server error'),
          });
        }
        if (url.includes('localhost:11434')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                response: 'Ollama response',
                model: 'llama2',
              }),
          });
        }
        return Promise.reject(new Error('Unknown URL'));
      });

      const result = await generateWithFallback('Test prompt', {
        apiKeys: {
          openai: 'test-openai-key',
          anthropic: 'test-anthropic-key',
        },
      });

      expect(result.provider).toBe(Provider.OLLAMA);
      expect(result.errors.length).toBe(2);
      expect(result.errors[0].provider).toBe(Provider.OPENAI);
      expect(result.errors[0].errorType).toBe(ProviderErrorType.RATE_LIMIT);
      expect(result.errors[1].provider).toBe(Provider.CLAUDE);
      expect(result.errors[1].errorType).toBe(ProviderErrorType.PROVIDER_ERROR);
    });

    it('should throw error if all providers fail', async () => {
      global.fetch = jest.fn().mockImplementation(() => {
        return Promise.reject(new TypeError('Failed to fetch'));
      });

      await expect(
        generateWithFallback('Test prompt', {
          apiKeys: {
            openai: 'test-openai-key',
            anthropic: 'test-anthropic-key',
          },
        })
      ).rejects.toThrow('All providers failed');
    });

    it('should skip providers without API keys', async () => {
      // No API keys configured, only Ollama should be attempted
      const attemptedProviders: Provider[] = [];

      global.fetch = jest.fn().mockImplementation((url: string) => {
        if (url.includes('openai.com')) {
          attemptedProviders.push(Provider.OPENAI);
        }
        if (url.includes('anthropic.com')) {
          attemptedProviders.push(Provider.CLAUDE);
        }
        if (url.includes('localhost:11434')) {
          attemptedProviders.push(Provider.OLLAMA);
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                response: 'Ollama response',
                model: 'llama2',
              }),
          });
        }
        // Return invalid API key error for OpenAI/Claude when no key
        return Promise.reject(new Error('Invalid API key'));
      });

      const result = await generateWithFallback('Test prompt', {
        apiKeys: {}, // No keys
      });

      // OpenAI and Claude should fail immediately due to missing keys
      // Ollama should succeed
      expect(result.provider).toBe(Provider.OLLAMA);
      expect(result.content).toBe('Ollama response');
    });

    it('should use custom options when provided', async () => {
      let capturedBody: unknown = null;

      global.fetch = jest.fn().mockImplementation((_url: string, options: RequestInit) => {
        capturedBody = JSON.parse(options.body as string);
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              choices: [{ message: { content: 'Response' } }],
            }),
        });
      });

      await generateWithFallback('Test prompt', {
        apiKeys: { openai: 'test-key' },
        temperature: 0.9,
        maxTokens: 500,
        models: { openai: 'gpt-3.5-turbo' },
      });

      expect(capturedBody).toMatchObject({
        model: 'gpt-3.5-turbo',
        temperature: 0.9,
        max_tokens: 500,
      });
    });

    it('should include system prompt when provided', async () => {
      let capturedBody: { messages?: Array<{ role: string; content: string }> } = {};

      global.fetch = jest.fn().mockImplementation((_url: string, options: RequestInit) => {
        capturedBody = JSON.parse(options.body as string);
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              choices: [{ message: { content: 'Response' } }],
            }),
        });
      });

      await generateWithFallback('Test prompt', {
        apiKeys: { openai: 'test-key' },
        systemPrompt: 'You are a helpful assistant.',
      });

      expect(capturedBody.messages).toContainEqual({
        role: 'system',
        content: 'You are a helpful assistant.',
      });
    });
  });

  describe('Provider enum', () => {
    it('should have correct values', () => {
      expect(Provider.OPENAI).toBe('openai');
      expect(Provider.CLAUDE).toBe('claude');
      expect(Provider.OLLAMA).toBe('ollama');
    });
  });

  describe('ProviderErrorType enum', () => {
    it('should have all error types', () => {
      expect(ProviderErrorType.NETWORK_ERROR).toBe('network_error');
      expect(ProviderErrorType.TIMEOUT).toBe('timeout');
      expect(ProviderErrorType.RATE_LIMIT).toBe('rate_limit');
      expect(ProviderErrorType.INVALID_API_KEY).toBe('invalid_api_key');
      expect(ProviderErrorType.PROVIDER_ERROR).toBe('provider_error');
      expect(ProviderErrorType.UNKNOWN).toBe('unknown');
    });
  });
});
