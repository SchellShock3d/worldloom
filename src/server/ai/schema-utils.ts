import type { z } from "zod";

/**
 * Non-strict tool output may leave out empty arrays or blank fields. Fill those from the schema
 * (empty array, empty string, 0, false, first enum option) so only real mistakes fail validation.
 */
export function fillDefaults(schema: z.ZodType, value: unknown): unknown {
  const def = (schema as unknown as { def: { type: string } }).def;
  switch (def.type) {
    case "object": {
      if (typeof value === "string") value = tryJson(value);
      if (value === null || typeof value !== "object" || Array.isArray(value)) value = {};
      const shape = (schema as unknown as z.ZodObject).shape as Record<string, z.ZodType>;
      const out: Record<string, unknown> = { ...(value as Record<string, unknown>) };
      for (const [k, sub] of Object.entries(shape)) out[k] = fillDefaults(sub, out[k]);
      return out;
    }
    case "array": {
      // Large tool inputs sometimes arrive with nested arrays serialised as strings ("" or "[...]").
      if (typeof value === "string") value = value.trim() === "" ? [] : tryJson(value);
      return Array.isArray(value) ? value.map((v) => fillDefaults((schema as unknown as z.ZodArray<z.ZodType>).element, v)) : value === undefined || value === null ? [] : value;
    }
    case "string":
      return value === undefined || value === null ? "" : value;
    case "number":
      return value === undefined || value === null ? 0 : value;
    case "boolean":
      return value === undefined || value === null ? false : value;
    case "enum":
      return value === undefined || value === null ? (schema as unknown as z.ZodEnum).options[0] : value;
    default:
      return value;
  }
}

function tryJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
