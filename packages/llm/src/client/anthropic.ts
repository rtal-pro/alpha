import Anthropic from "@anthropic-ai/sdk";

export const MODELS = {
  SONNET: "claude-sonnet-4-5-20250929",
  HAIKU: "claude-haiku-4-5-20251001",
} as const;

export type ModelId = (typeof MODELS)[keyof typeof MODELS];

interface GenerateResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  model: ModelId;
}

const DEFAULT_MAX_RETRIES = 3;
const BASE_DELAY_MS = 1_000;

function isRateLimitError(error: unknown): boolean {
  if (error instanceof Anthropic.APIError) {
    return error.status === 429;
  }
  return false;
}

function isRetryableError(error: unknown): boolean {
  if (error instanceof Anthropic.APIError) {
    return error.status === 429 || error.status === 500 || error.status === 529;
  }
  return false;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class AnthropicClient {
  private client: Anthropic;

  constructor(apiKey?: string) {
    this.client = new Anthropic({
      apiKey: apiKey ?? process.env.ANTHROPIC_API_KEY,
    });
  }

  /**
   * Generate a complete response with retry and exponential backoff.
   */
  async generate(
    model: ModelId,
    systemPrompt: string,
    userPrompt: string,
    maxTokens: number = 4096,
  ): Promise<GenerateResult> {
    let lastError: unknown;

    for (let attempt = 0; attempt < DEFAULT_MAX_RETRIES; attempt++) {
      try {
        const response = await this.client.messages.create({
          model,
          max_tokens: maxTokens,
          system: systemPrompt,
          messages: [{ role: "user", content: userPrompt }],
        });

        const textBlock = response.content.find(
          (block) => block.type === "text",
        );

        if (!textBlock || textBlock.type !== "text") {
          throw new Error("No text content in Anthropic response");
        }

        return {
          text: textBlock.text,
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          model,
        };
      } catch (error: unknown) {
        lastError = error;

        if (!isRetryableError(error)) {
          throw error;
        }

        const delayMs = isRateLimitError(error)
          ? BASE_DELAY_MS * Math.pow(3, attempt) // more aggressive backoff for rate limits
          : BASE_DELAY_MS * Math.pow(2, attempt);

        await sleep(delayMs);
      }
    }

    throw lastError;
  }

  /**
   * Stream a response, yielding text chunks as they arrive.
   * Returns an async iterable of text chunks.
   */
  async *stream(
    model: ModelId,
    systemPrompt: string,
    userPrompt: string,
    maxTokens: number = 4096,
  ): AsyncIterable<string> {
    let lastError: unknown;

    for (let attempt = 0; attempt < DEFAULT_MAX_RETRIES; attempt++) {
      try {
        const stream = this.client.messages.stream({
          model,
          max_tokens: maxTokens,
          system: systemPrompt,
          messages: [{ role: "user", content: userPrompt }],
        });

        for await (const event of stream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            yield event.delta.text;
          }
        }

        // If we get here, streaming completed successfully
        return;
      } catch (error: unknown) {
        lastError = error;

        if (!isRetryableError(error)) {
          throw error;
        }

        const delayMs = isRateLimitError(error)
          ? BASE_DELAY_MS * Math.pow(3, attempt)
          : BASE_DELAY_MS * Math.pow(2, attempt);

        await sleep(delayMs);
      }
    }

    throw lastError;
  }
}
