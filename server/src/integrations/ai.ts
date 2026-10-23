/**
 * One text-generation door with several providers behind it.
 *
 * Whichever free key is configured is used: Groq (Llama) first, then Gemini
 * through its Interactions API. With neither, callers fall back to their own
 * templates — the app never depends on a model being reachable.
 */

import { env } from '../lib/env.js';
import { AppError, serviceUnavailable, tooManyRequests } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

export type Provider = 'groq' | 'gemini';

export function activeProvider(): Provider | null {
  if (env.GROQ_API_KEY) return 'groq';
  if (env.GEMINI_API_KEY) return 'gemini';
  return null;
}

/** Groq retires model names without notice; the first that exists is used. */
const GROQ_MODELS = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'qwen/qwen3.8-27b'];
const GEMINI_MODEL = 'gemini-3.8-flash';

function toAppError(provider: Provider, status: number, body: string): AppError {
  if (status === 429) return tooManyRequests(`The AI service (${provider}) is rate-limited right now. Try again in a minute.`);
  if (status === 401 || status === 403) return serviceUnavailable(`The ${provider} API key was rejected or the project has no access. Check the key.`);
  logger.warn({ provider, status, body: body.slice(0, 300) }, 'AI request failed');
  return serviceUnavailable('The AI service is unavailable right now. Please try again shortly.');
}

/** Plain text from a system instruction and a prompt. */
export async function generateText(system: string, prompt: string, options: { json?: boolean } = {}): Promise<string> {
  const provider = activeProvider();
  if (!provider) throw serviceUnavailable('No AI provider is configured.');

  if (provider === 'groq') {
    let lastError: AppError | null = null;
    for (const model of GROQ_MODELS) {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: `${system}\nOutput only the requested text.` },
            { role: 'user', content: prompt },
          ],
          temperature: 0.7,
          max_tokens: 900,
          // These models think before answering; a little is enough for copy.
          reasoning_effort: 'low',
          ...(options.json ? { response_format: { type: 'json_object' } } : {}),
        }),
      });
      let text = await response.text();
      if (response.status === 404 || (response.status === 400 && /model_not_found|does not exist/.test(text))) {
        lastError = toAppError('groq', response.status, text);
        continue;
      }
      // Strict JSON mode fails when the model prefers to explain itself; the
      // plain reply usually still contains the object, so ask again without it.
      if (response.status === 400 && options.json && /json_validate_failed/.test(text)) {
        const retry = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: `${system}\nOutput only a JSON object, nothing else.` },
              { role: 'user', content: prompt },
            ],
            temperature: 0.5,
            max_tokens: 900,
            reasoning_effort: 'low',
          }),
        });
        text = await retry.text();
        if (!retry.ok) throw toAppError('groq', retry.status, text);
      } else if (!response.ok) {
        throw toAppError('groq', response.status, text);
      }
      const data = JSON.parse(text) as { choices?: { message?: { content?: string } }[] };
      const content = data.choices?.[0]?.message?.content?.trim();
      if (!content) throw new Error('The AI returned an empty response.');
      return content;
    }
    throw lastError ?? serviceUnavailable('No Groq model is available to this key.');
  }

  const response = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
    method: 'POST',
    headers: { 'x-goog-api-key': env.GEMINI_API_KEY!, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: GEMINI_MODEL,
      input: `${system}\n\n${prompt}${options.json ? '\n\nRespond with JSON only.' : ''}`,
    }),
  });
  const text = await response.text();
  if (!response.ok) throw toAppError('gemini', response.status, text);
  const data = JSON.parse(text) as { output_text?: string; steps?: { content?: { text?: string }[] }[] };
  const content =
    data.output_text?.trim() ??
    (data.steps ?? [])
      .flatMap((s) => s.content ?? [])
      .map((c) => c.text ?? '')
      .join('')
      .trim();
  if (!content) throw new Error('The AI returned an empty response.');
  return content;
}

/** Pulls a JSON object out of a model reply that may be wrapped in prose or fences. */
export function parseJson<T>(text: string): T {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1)) as T;
    throw new Error('The AI reply was not valid JSON.');
  }
}
