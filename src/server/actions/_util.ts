import { unstable_rethrow } from "next/navigation";
import { ZodError } from "zod";
import type { ActionResult } from "@/lib/utils";

/** Run a server action body, converting thrown errors into a friendly result. */
export async function run<T>(fn: () => Promise<T>, message?: string): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { ok: true, data, message };
  } catch (err) {
    unstable_rethrow(err);
    if (err instanceof ZodError) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of err.issues) {
        const key = issue.path.join(".") || "form";
        fieldErrors[key] ??= issue.message;
      }
      const first = err.issues[0];
      return { ok: false, error: first ? `${first.path.join(".") ? first.path.join(".") + ": " : ""}${first.message}` : "Invalid input", fieldErrors };
    }
    // Our own errors carry user-facing messages; database/driver errors must not leak SQL or internals.
    if (isInternalError(err)) {
      console.error("[action]", err);
      return { ok: false, error: "Something went wrong saving that. Please try again." };
    }
    if (process.env.NODE_ENV !== "production") console.error("[action]", err);
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong" };
  }
}

function isInternalError(err: unknown) {
  if (!(err instanceof Error)) return true;
  if (err.name === "DrizzleQueryError" || err.name === "PostgresError" || err.message.startsWith("Failed query")) return true;
  // Driver errors carry a SQLSTATE code (e.g. "23505"); app errors don't.
  const code = (err as { code?: unknown }).code;
  return typeof code === "string" && /^[0-9A-Z]{5}$/.test(code);
}
