import type { ZodSchema, ZodTypeDef } from "zod";
import { AnthropicClient, MODELS } from "../client/anthropic.js";

interface ParseResult<T> {
  data: T;
  attempts: number;
}

/**
 * Generic output parser with a 3-layer recovery strategy:
 * 1. Extract JSON from markdown fences or raw braces
 * 2. Repair common JSON issues (trailing commas, control chars, etc.)
 * 3. Ask Haiku to fix the JSON
 */
export class OutputParser<T> {
  private schema: ZodSchema<T, ZodTypeDef, unknown>;
  private client: AnthropicClient;

  constructor(schema: ZodSchema<T, ZodTypeDef, unknown>, client?: AnthropicClient) {
    this.schema = schema;
    this.client = client ?? new AnthropicClient();
  }

  /**
   * Parse raw LLM output into a validated, typed object.
   */
  async parse(rawResponse: string): Promise<ParseResult<T>> {
    // Layer 1: Extract JSON and try direct parse
    const extracted = this.extractJson(rawResponse);
    const layer1Result = this.tryParse(extracted);
    if (layer1Result.success) {
      return { data: layer1Result.data, attempts: 1 };
    }

    // Layer 2: Repair JSON and try again
    const repaired = this.repairJson(extracted);
    const layer2Result = this.tryParse(repaired);
    if (layer2Result.success) {
      return { data: layer2Result.data, attempts: 2 };
    }

    // Layer 3: Ask Haiku to fix the JSON
    const fixed = await this.askHaikuToFix(extracted, layer1Result.error);
    const layer3Result = this.tryParse(fixed);
    if (layer3Result.success) {
      return { data: layer3Result.data, attempts: 3 };
    }

    throw new Error(
      `Failed to parse LLM output after 3 attempts. Last error: ${layer3Result.error}`,
    );
  }

  /**
   * Layer 1: Extract JSON content from markdown code fences or raw braces.
   */
  private extractJson(raw: string): string {
    // Try to extract from ```json ... ``` blocks
    const jsonBlockMatch = raw.match(/```json\s*([\s\S]*?)```/);
    if (jsonBlockMatch?.[1]) {
      return jsonBlockMatch[1].trim();
    }

    // Try to extract from generic ``` ... ``` blocks
    const codeBlockMatch = raw.match(/```\s*([\s\S]*?)```/);
    if (codeBlockMatch?.[1]) {
      const content = codeBlockMatch[1].trim();
      if (content.startsWith("{") || content.startsWith("[")) {
        return content;
      }
    }

    // Try to find raw JSON object or array
    const firstBrace = raw.indexOf("{");
    const lastBrace = raw.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      return raw.slice(firstBrace, lastBrace + 1);
    }

    const firstBracket = raw.indexOf("[");
    const lastBracket = raw.lastIndexOf("]");
    if (firstBracket !== -1 && lastBracket > firstBracket) {
      return raw.slice(firstBracket, lastBracket + 1);
    }

    // Return the raw string as-is; let downstream parsing attempt handle it
    return raw.trim();
  }

  /**
   * Layer 2: Repair common JSON issues.
   */
  private repairJson(json: string): string {
    let result = json;

    // Remove trailing commas before } or ]
    result = result.replace(/,\s*([}\]])/g, "$1");

    // Replace control characters (except \n, \r, \t) with spaces
    result = result.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, " ");

    // Fix unescaped newlines inside JSON string values
    // This is a best-effort approach: replace literal newlines that appear
    // between quote-delimited values with escaped newlines
    result = result.replace(
      /"([^"]*?)"/g,
      (_match: string, content: string) => {
        const escaped = content
          .replace(/\\/g, "\\\\")
          .replace(/\n/g, "\\n")
          .replace(/\r/g, "\\r")
          .replace(/\t/g, "\\t");
        return `"${escaped}"`;
      },
    );

    // Fix single quotes used as JSON delimiters (only at key/value boundaries)
    // This is conservative to avoid breaking strings that legitimately contain single quotes
    result = result.replace(/'/g, '"');

    return result;
  }

  /**
   * Layer 3: Ask Claude Haiku to fix the JSON.
   */
  private async askHaikuToFix(
    brokenJson: string,
    parseError: string,
  ): Promise<string> {
    const systemPrompt =
      "You are a JSON repair tool. You receive broken JSON and a parse error. " +
      "Return ONLY the fixed, valid JSON with no explanation, no markdown fences, no extra text.";

    const userPrompt =
      `Fix this JSON. The parse error was: ${parseError}\n\n` +
      `Broken JSON:\n${brokenJson}`;

    const response = await this.client.generate(
      MODELS.HAIKU,
      systemPrompt,
      userPrompt,
      4096,
    );

    return this.extractJson(response.text);
  }

  /**
   * Attempt to parse JSON and validate against the Zod schema.
   */
  private tryParse(
    json: string,
  ): { success: true; data: T } | { success: false; error: string } {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: `JSON parse error: ${message}` };
    }

    const result = this.schema.safeParse(parsed);
    if (result.success) {
      return { success: true, data: result.data };
    }

    const errors = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    return { success: false, error: `Validation error: ${errors}` };
  }
}
