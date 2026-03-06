/**
 * Provider Fallback Orchestration Module for Node.js
 * 
 * Implements provider-fallback orchestration for LLM generation.
 * Fallback priority: OpenAI (primary) → Claude (secondary) → Ollama (final fallback)
 */

/**
 * Enum representing available LLM providers.
 */
export enum Provider {
  OPENAI = 'openai',
  CLAUDE = 'claude',
  OLLAMA = 'ollama',
}

/**
 * Error types that trigger fallback behavior.
 */
export enum ProviderErrorType {
  NETWORK_ERROR = 'network_error',
  TIMEOUT = 'timeout',
  RATE_LIMIT = 'rate_limit',
  INVALID_API_KEY = 'invalid_api_key',
  PROVIDER_ERROR = 'provider_error',
  UNKNOWN = 'unknown',
}

/**
 * Custom error class for provider-specific errors.
 */
export class ProviderError extends Error {
  public readonly provider: Provider;
  public readonly errorType: ProviderErrorType;
  public readonly statusCode?: number;
  public readonly originalError?: Error;

  constructor(
    message: string,
    provider: Provider,
    errorType: ProviderErrorType,
    statusCode?: number,
    originalError?: Error
  ) {
    super(message);
    this.name = 'ProviderError';
    this.provider = provider;
    this.errorType = errorType;
    this.statusCode = statusCode;
    this.originalError = originalError;
  }
}

/**
 * Configuration options for generation requests.
 */
export interface GenerationOptions {
  /** Custom system prompt */
  systemPrompt?: string;
  /** Temperature for generation (0-2) */
  temperature?: number;
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** Timeout in milliseconds */
  timeout?: number;
  /** Model to use for each provider */
  models?: {
    openai?: string;
    claude?: string;
    ollama?: string;
  };
  /** API keys (optional, falls back to environment variables) */
  apiKeys?: {
    openai?: string;
    anthropic?: string;
  };
  /** Ollama endpoint (default: http://localhost:11434) */
  ollamaEndpoint?: string;
}

/**
 * Result from a successful generation.
 */
export interface ProviderResult {
  /** Generated content */
  content: string;
  /** Provider that successfully generated the content */
  provider: Provider;
  /** Model used for generation */
  model: string;
  /** Token usage information if available */
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  /** Providers that were attempted before success */
  attemptedProviders: Provider[];
  /** Errors encountered during fallback */
  errors: ProviderError[];
}

/**
 * Default configuration values.
 */
const DEFAULT_OPTIONS: Required<Omit<GenerationOptions, 'apiKeys' | 'systemPrompt'>> & {
  apiKeys: NonNullable<GenerationOptions['apiKeys']>;
} = {
  temperature: 0.7,
  maxTokens: 1024,
  timeout: 30000,
  models: {
    openai: 'gpt-4',
    claude: 'claude-3-sonnet-20240229',
    ollama: 'llama2',
  },
  apiKeys: {},
  ollamaEndpoint: 'http://localhost:11434',
};

/**
 * Provider priority order for fallback.
 */
const PROVIDER_PRIORITY: Provider[] = [
  Provider.OPENAI,
  Provider.CLAUDE,
  Provider.OLLAMA,
];

/**
 * Detect the type of error from an API response or exception.
 */
export function detectErrorType(
  error: unknown,
  statusCode?: number
): ProviderErrorType {
  // Check for network/connection errors
  if (error instanceof TypeError) {
    const message = error.message.toLowerCase();
    if (
      message.includes('fetch') ||
      message.includes('network') ||
      message.includes('connection') ||
      message.includes('econnrefused') ||
      message.includes('enotfound')
    ) {
      return ProviderErrorType.NETWORK_ERROR;
    }
  }

  // Check for AbortError (timeout)
  if (error instanceof Error && error.name === 'AbortError') {
    return ProviderErrorType.TIMEOUT;
  }

  // Check for timeout in error message
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (message.includes('timeout') || message.includes('timed out')) {
      return ProviderErrorType.TIMEOUT;
    }
    if (
      message.includes('econnrefused') ||
      message.includes('enotfound') ||
      message.includes('network')
    ) {
      return ProviderErrorType.NETWORK_ERROR;
    }
  }

  // Check status codes
  if (statusCode) {
    // Rate limiting
    if (statusCode === 429) {
      return ProviderErrorType.RATE_LIMIT;
    }
    // Authentication errors
    if (statusCode === 401 || statusCode === 403) {
      return ProviderErrorType.INVALID_API_KEY;
    }
    // Server errors (5xx)
    if (statusCode >= 500 && statusCode < 600) {
      return ProviderErrorType.PROVIDER_ERROR;
    }
  }

  return ProviderErrorType.UNKNOWN;
}

/**
 * Check if an error should trigger a fallback to the next provider.
 */
export function shouldFallback(errorType: ProviderErrorType): boolean {
  return [
    ProviderErrorType.NETWORK_ERROR,
    ProviderErrorType.TIMEOUT,
    ProviderErrorType.RATE_LIMIT,
    ProviderErrorType.INVALID_API_KEY,
    ProviderErrorType.PROVIDER_ERROR,
  ].includes(errorType);
}

/**
 * Generate content using OpenAI API.
 */
async function generateWithOpenAI(
  prompt: string,
  options: Required<Omit<GenerationOptions, 'apiKeys' | 'systemPrompt'>> & {
    apiKeys: NonNullable<GenerationOptions['apiKeys']>;
    systemPrompt?: string;
  }
): Promise<{ content: string; model: string; usage?: ProviderResult['usage'] }> {
  const apiKey = options.apiKeys.openai || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new ProviderError(
      'OpenAI API key not configured',
      Provider.OPENAI,
      ProviderErrorType.INVALID_API_KEY
    );
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeout);

  try {
    const messages: Array<{ role: string; content: string }> = [];
    if (options.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: options.models.openai,
        messages,
        temperature: options.temperature,
        max_tokens: options.maxTokens,
      }),
      signal: controller.signal,
    });

    const statusCode = response.status;

    if (!response.ok) {
      const errorText = await response.text();
      const errorType = detectErrorType(new Error(errorText), statusCode);
      throw new ProviderError(
        `OpenAI API error: ${statusCode} - ${errorText}`,
        Provider.OPENAI,
        errorType,
        statusCode
      );
    }

    const data = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      };
    };

    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new ProviderError(
        'No content in OpenAI response',
        Provider.OPENAI,
        ProviderErrorType.PROVIDER_ERROR
      );
    }

    return {
      content,
      model: options.models.openai!,
      usage: data.usage
        ? {
            promptTokens: data.usage.prompt_tokens,
            completionTokens: data.usage.completion_tokens,
            totalTokens: data.usage.total_tokens,
          }
        : undefined,
    };
  } catch (error) {
    if (error instanceof ProviderError) {
      throw error;
    }
    const errorType = detectErrorType(error);
    throw new ProviderError(
      `OpenAI request failed: ${error instanceof Error ? error.message : String(error)}`,
      Provider.OPENAI,
      errorType,
      undefined,
      error instanceof Error ? error : undefined
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Generate content using Claude (Anthropic) API.
 */
async function generateWithClaude(
  prompt: string,
  options: Required<Omit<GenerationOptions, 'apiKeys' | 'systemPrompt'>> & {
    apiKeys: NonNullable<GenerationOptions['apiKeys']>;
    systemPrompt?: string;
  }
): Promise<{ content: string; model: string; usage?: ProviderResult['usage'] }> {
  const apiKey = options.apiKeys.anthropic || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new ProviderError(
      'Anthropic API key not configured',
      Provider.CLAUDE,
      ProviderErrorType.INVALID_API_KEY
    );
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeout);

  try {
    const requestBody: {
      model: string;
      max_tokens: number;
      messages: Array<{ role: string; content: string }>;
      system?: string;
    } = {
      model: options.models.claude!,
      max_tokens: options.maxTokens,
      messages: [{ role: 'user', content: prompt }],
    };

    if (options.systemPrompt) {
      requestBody.system = options.systemPrompt;
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    const statusCode = response.status;

    if (!response.ok) {
      const errorText = await response.text();
      const errorType = detectErrorType(new Error(errorText), statusCode);
      throw new ProviderError(
        `Claude API error: ${statusCode} - ${errorText}`,
        Provider.CLAUDE,
        errorType,
        statusCode
      );
    }

    const data = await response.json() as {
      content?: Array<{ text?: string; type?: string }>;
      usage?: {
        input_tokens?: number;
        output_tokens?: number;
      };
    };

    const content = data.content?.find((c) => c.type === 'text')?.text;
    if (!content) {
      throw new ProviderError(
        'No content in Claude response',
        Provider.CLAUDE,
        ProviderErrorType.PROVIDER_ERROR
      );
    }

    return {
      content,
      model: options.models.claude!,
      usage: data.usage
        ? {
            promptTokens: data.usage.input_tokens,
            completionTokens: data.usage.output_tokens,
            totalTokens:
              (data.usage.input_tokens ?? 0) + (data.usage.output_tokens ?? 0),
          }
        : undefined,
    };
  } catch (error) {
    if (error instanceof ProviderError) {
      throw error;
    }
    const errorType = detectErrorType(error);
    throw new ProviderError(
      `Claude request failed: ${error instanceof Error ? error.message : String(error)}`,
      Provider.CLAUDE,
      errorType,
      undefined,
      error instanceof Error ? error : undefined
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Generate content using Ollama (local instance).
 */
async function generateWithOllama(
  prompt: string,
  options: Required<Omit<GenerationOptions, 'apiKeys' | 'systemPrompt'>> & {
    apiKeys: NonNullable<GenerationOptions['apiKeys']>;
    systemPrompt?: string;
  }
): Promise<{ content: string; model: string; usage?: ProviderResult['usage'] }> {
  const endpoint = options.ollamaEndpoint;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeout);

  try {
    const fullPrompt = options.systemPrompt
      ? `${options.systemPrompt}\n\n${prompt}`
      : prompt;

    const response = await fetch(`${endpoint}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: options.models.ollama,
        prompt: fullPrompt,
        stream: false,
        options: {
          temperature: options.temperature,
          num_predict: options.maxTokens,
        },
      }),
      signal: controller.signal,
    });

    const statusCode = response.status;

    if (!response.ok) {
      const errorText = await response.text();
      const errorType = detectErrorType(new Error(errorText), statusCode);
      throw new ProviderError(
        `Ollama API error: ${statusCode} - ${errorText}`,
        Provider.OLLAMA,
        errorType,
        statusCode
      );
    }

    const data = await response.json() as {
      response?: string;
      model?: string;
      prompt_eval_count?: number;
      eval_count?: number;
    };

    const content = data.response;
    if (!content) {
      throw new ProviderError(
        'No content in Ollama response',
        Provider.OLLAMA,
        ProviderErrorType.PROVIDER_ERROR
      );
    }

    return {
      content,
      model: data.model || options.models.ollama!,
      usage: {
        promptTokens: data.prompt_eval_count,
        completionTokens: data.eval_count,
        totalTokens:
          (data.prompt_eval_count ?? 0) + (data.eval_count ?? 0),
      },
    };
  } catch (error) {
    if (error instanceof ProviderError) {
      throw error;
    }
    const errorType = detectErrorType(error);
    throw new ProviderError(
      `Ollama request failed: ${error instanceof Error ? error.message : String(error)}`,
      Provider.OLLAMA,
      errorType,
      undefined,
      error instanceof Error ? error : undefined
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Generate content with automatic provider fallback.
 * 
 * Attempts generation in order: OpenAI → Claude → Ollama
 * Falls back to the next provider on network failures, timeouts,
 * rate limits, or invalid API keys.
 * 
 * @param prompt - The prompt to send to the LLM
 * @param options - Optional configuration for the generation request
 * @returns Promise resolving to the generation result with metadata
 * @throws ProviderError if all providers fail
 * 
 * @example
 * ```ts
 * const result = await generateWithFallback(
 *   "Write a tweet about AI",
 *   { temperature: 0.8, maxTokens: 280 }
 * );
 * console.log(result.content);
 * console.log(`Generated by: ${result.provider}`);
 * ```
 */
export async function generateWithFallback(
  prompt: string,
  options?: GenerationOptions
): Promise<ProviderResult> {
  const mergedOptions = {
    ...DEFAULT_OPTIONS,
    ...options,
    models: {
      ...DEFAULT_OPTIONS.models,
      ...options?.models,
    },
    apiKeys: {
      ...DEFAULT_OPTIONS.apiKeys,
      ...options?.apiKeys,
    },
  };

  const attemptedProviders: Provider[] = [];
  const errors: ProviderError[] = [];

  const providerFunctions: Record<
    Provider,
    (
      prompt: string,
      opts: typeof mergedOptions
    ) => Promise<{ content: string; model: string; usage?: ProviderResult['usage'] }>
  > = {
    [Provider.OPENAI]: generateWithOpenAI,
    [Provider.CLAUDE]: generateWithClaude,
    [Provider.OLLAMA]: generateWithOllama,
  };

  for (const provider of PROVIDER_PRIORITY) {
    attemptedProviders.push(provider);

    try {
      console.log(`Attempting generation with ${provider}...`);
      const result = await providerFunctions[provider](prompt, mergedOptions);

      return {
        content: result.content,
        provider,
        model: result.model,
        usage: result.usage,
        attemptedProviders,
        errors,
      };
    } catch (error) {
      const providerError =
        error instanceof ProviderError
          ? error
          : new ProviderError(
              `${provider} failed: ${error instanceof Error ? error.message : String(error)}`,
              provider,
              ProviderErrorType.UNKNOWN,
              undefined,
              error instanceof Error ? error : undefined
            );

      errors.push(providerError);
      console.warn(
        `Provider ${provider} failed with ${providerError.errorType}: ${providerError.message}`
      );

      // Check if we should fallback to next provider
      if (!shouldFallback(providerError.errorType)) {
        console.error(`Error type ${providerError.errorType} does not trigger fallback`);
        throw providerError;
      }

      // Continue to next provider
      console.log(`Falling back from ${provider} to next provider...`);
    }
  }

  // All providers failed
  const finalError = new ProviderError(
    `All providers failed. Errors: ${errors.map((e) => `${e.provider}: ${e.message}`).join('; ')}`,
    Provider.OLLAMA, // Last attempted
    ProviderErrorType.PROVIDER_ERROR
  );

  throw finalError;
}

/**
 * Test connection to a specific provider.
 */
export async function testProviderConnection(
  provider: Provider,
  options?: Pick<GenerationOptions, 'apiKeys' | 'ollamaEndpoint' | 'timeout'>
): Promise<boolean> {
  const timeout = options?.timeout ?? 5000;

  try {
    switch (provider) {
      case Provider.OPENAI: {
        const apiKey =
          options?.apiKeys?.openai || process.env.OPENAI_API_KEY;
        if (!apiKey) return false;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        try {
          const response = await fetch('https://api.openai.com/v1/models', {
            headers: { Authorization: `Bearer ${apiKey}` },
            signal: controller.signal,
          });
          return response.ok;
        } finally {
          clearTimeout(timeoutId);
        }
      }

      case Provider.CLAUDE: {
        const apiKey =
          options?.apiKeys?.anthropic || process.env.ANTHROPIC_API_KEY;
        if (!apiKey) return false;

        // Anthropic doesn't have a simple health endpoint, so we check if key format is valid
        // A proper check would require making an actual API call
        return apiKey.startsWith('sk-ant-');
      }

      case Provider.OLLAMA: {
        const endpoint =
          options?.ollamaEndpoint ?? DEFAULT_OPTIONS.ollamaEndpoint;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        try {
          const response = await fetch(`${endpoint}/api/tags`, {
            method: 'GET',
            signal: controller.signal,
          });
          return response.ok;
        } finally {
          clearTimeout(timeoutId);
        }
      }

      default:
        return false;
    }
  } catch {
    return false;
  }
}

/**
 * Get list of available providers based on configuration.
 */
export async function getAvailableProviders(
  options?: Pick<GenerationOptions, 'apiKeys' | 'ollamaEndpoint' | 'timeout'>
): Promise<Provider[]> {
  const available: Provider[] = [];

  for (const provider of PROVIDER_PRIORITY) {
    if (await testProviderConnection(provider, options)) {
      available.push(provider);
    }
  }

  return available;
}
