/**
 * Content Refinement Service — Calls GPT-5.4 to refine generated social posts.
 *
 * Uses the same cascade pattern as ContentAgent:
 *   OpenAI (gpt-5.4) → Anthropic → Ollama
 */

import { Config } from '../config';
import { PersonaProfile, PLATFORM_LIMITS, Platform } from '../models';
import { RateLimiter, retryWithBackoff } from './apiHelpers';
import { getLogger } from './logger';

const logger = getLogger('refinement-service');

export interface RefinementResult {
  refinedContent: string;
  notes: string;
}

/**
 * Refine a piece of content using GPT-5.4 (with Anthropic/Ollama fallback).
 *
 * @param originalContent  The post text to refine (may already be a prior refinement).
 * @param refinementPrompt The user's instruction (e.g. "make this more concise").
 * @param platform         The target platform — used to enforce character limits.
 * @param persona          The active persona — keeps the refined text in-character.
 * @param config           Server config (API keys, endpoints).
 * @param rateLimiter      Optional shared rate limiter.
 */
export async function refineContent(
  originalContent: string,
  refinementPrompt: string,
  platform: Platform,
  persona: PersonaProfile,
  config: Config,
  rateLimiter?: RateLimiter,
): Promise<RefinementResult> {
  const limits = PLATFORM_LIMITS[platform];

  const systemPrompt = buildSystemPrompt(persona, platform, limits.maxChars);
  const userPrompt = buildUserPrompt(originalContent, refinementPrompt, limits.maxChars);

  // Cascade: OpenAI → Anthropic → Ollama
  if (config.openaiApiKey) {
    try {
      return await refineWithOpenAI(systemPrompt, userPrompt, config, rateLimiter);
    } catch (e) {
      logger.warn(`OpenAI refinement failed: ${e}. Falling back.`);
    }
  }

  if (config.anthropicApiKey) {
    try {
      return await refineWithAnthropic(systemPrompt, userPrompt, config, rateLimiter);
    } catch (e) {
      logger.warn(`Anthropic refinement failed: ${e}. Falling back to Ollama.`);
    }
  }

  return refineWithOllama(systemPrompt, userPrompt, config);
}

// ─── Prompt builders ────────────────────────────────────────────────────────

function buildSystemPrompt(persona: PersonaProfile, platform: Platform, maxChars: number): string {
  return `You are a content refinement specialist working on posts for ${persona.name}.

Your job is to improve an existing social media post according to the user's refinement instructions while STRICTLY preserving:
1. The persona's voice, tone, and style (see below)
2. The factual claims and core message of the original post
3. Platform constraints (${platform}, max ${maxChars} characters)

=== PERSONA ===
Name: ${persona.name}
Voice: ${JSON.stringify(persona.voice)}
Beliefs: ${JSON.stringify(persona.beliefs)}
Style rules: ${JSON.stringify(persona.styleRules)}
Hard taboos (NEVER include): ${persona.taboos.join(', ')}

=== RULES ===
- The refined post MUST still sound like ${persona.name} wrote it
- Improve clarity, structure, flow, and impact per the user's instruction
- Do NOT add new factual claims that weren't in the original
- Do NOT soften the persona's edge unless explicitly asked
- Stay within the ${maxChars} character limit
- Preserve hashtag style and count unless the instruction says otherwise

Respond ONLY with valid JSON:
{
  "refined_content": "The improved post text",
  "notes": "Brief explanation of what was changed and why (1-2 sentences)"
}`;
}

function buildUserPrompt(originalContent: string, refinementPrompt: string, maxChars: number): string {
  return `Here is the original post to refine:

---
${originalContent}
---

Refinement instruction: ${refinementPrompt}

Remember: stay within ${maxChars} characters. Return ONLY valid JSON with "refined_content" and "notes" fields.`;
}

// ─── Parse helper ───────────────────────────────────────────────────────────

function parseRefinementResponse(raw: string): RefinementResult {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No JSON object found in LLM response');
  }

  const parsed = JSON.parse(jsonMatch[0]) as { refined_content?: string; notes?: string };

  if (!parsed.refined_content || typeof parsed.refined_content !== 'string') {
    throw new Error('Response missing "refined_content" field');
  }

  return {
    refinedContent: parsed.refined_content,
    notes: parsed.notes ?? '',
  };
}

// ─── OpenAI (gpt-5.4) ──────────────────────────────────────────────────────

async function refineWithOpenAI(
  systemPrompt: string,
  userPrompt: string,
  config: Config,
  rateLimiter?: RateLimiter,
): Promise<RefinementResult> {
  if (rateLimiter && !(await rateLimiter.acquire('openai'))) {
    throw new Error('OpenAI rate limited');
  }

  return retryWithBackoff(
    async () => {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.openaiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-5.4',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.5,
          response_format: { type: 'json_object' },
        }),
        signal: AbortSignal.timeout(60_000),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`OpenAI API error: ${response.status} - ${errText}`);
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = data.choices?.[0]?.message?.content ?? '{}';
      return parseRefinementResponse(content);
    },
    { maxRetries: 3, baseDelayMs: 2000 },
  );
}

// ─── Anthropic ──────────────────────────────────────────────────────────────

async function refineWithAnthropic(
  systemPrompt: string,
  userPrompt: string,
  config: Config,
  rateLimiter?: RateLimiter,
): Promise<RefinementResult> {
  if (rateLimiter && !(await rateLimiter.acquire('anthropic'))) {
    throw new Error('Anthropic rate limited');
  }

  return retryWithBackoff(
    async () => {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': config.anthropicApiKey!,
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-3-sonnet-20240229',
          max_tokens: 1024,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        }),
        signal: AbortSignal.timeout(60_000),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Anthropic API error: ${response.status} - ${errText}`);
      }

      const data = (await response.json()) as {
        content?: Array<{ text?: string }>;
      };
      const content = data.content?.[0]?.text ?? '';
      return parseRefinementResponse(content);
    },
    { maxRetries: 3, baseDelayMs: 2000 },
  );
}

// ─── Ollama (local fallback) ────────────────────────────────────────────────

async function refineWithOllama(
  systemPrompt: string,
  userPrompt: string,
  config: Config,
): Promise<RefinementResult> {
  const endpoint = config.ollamaEndpoint || 'http://localhost:11434';
  const model = config.ollamaModel || 'llama3.2';

  return retryWithBackoff(
    async () => {
      const response = await fetch(`${endpoint}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt: `${systemPrompt}\n\n${userPrompt}\n\nRespond ONLY with valid JSON, no other text.`,
          stream: false,
        }),
        signal: AbortSignal.timeout(120_000),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Ollama API error: ${response.status} - ${errText}`);
      }

      const data = (await response.json()) as { response?: string };
      return parseRefinementResponse(data.response ?? '');
    },
    { maxRetries: 2, baseDelayMs: 3000 },
  );
}
