import type { ZodSchema, ZodTypeDef } from "zod";
import { ProblemValidationSchema } from "../prompts/sections/01-problem.js";

/**
 * Registry mapping section keys to their Zod schemas.
 * Expand this as more sections are added.
 */
const SECTION_SCHEMAS: Record<string, ZodSchema<unknown, ZodTypeDef, unknown>> = {
  "01-problem": ProblemValidationSchema,
};

export interface ValidationResult {
  valid: boolean;
  errors?: string[];
}

/**
 * Validate section output data against the section's registered Zod schema.
 */
export function validateSectionOutput(
  sectionKey: string,
  data: unknown,
): ValidationResult {
  const schema = SECTION_SCHEMAS[sectionKey];

  if (!schema) {
    return {
      valid: false,
      errors: [`No schema registered for section: ${sectionKey}`],
    };
  }

  const result = schema.safeParse(data);

  if (result.success) {
    return { valid: true };
  }

  const errors = result.error.issues.map(
    (issue) => `[${issue.path.join(".")}] ${issue.message}`,
  );

  return { valid: false, errors };
}
