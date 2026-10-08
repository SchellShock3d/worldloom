/**
 * Small in-memory rate limiter for sign-in and sign-up. Good for a single
 * server process; put a shared store (e.g. Redis) behind the same interface
 * when running several instances.
 */
const buckets = new Map<string, number[]>();

export function hit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfterMs: number } {
  const now = Date.now();
  const recent = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    buckets.set(key, recent);
    return { ok: false, retryAfterMs: windowMs - (now - recent[0]!) };
  }
  recent.push(now);
  buckets.set(key, recent);
  if (buckets.size > 50_000) {
    // Drop stale keys so memory stays bounded.
    for (const [k, v] of buckets) if (!v.some((t) => now - t < windowMs)) buckets.delete(k);
  }
  return { ok: true, retryAfterMs: 0 };
}

export function clear(key: string) {
  buckets.delete(key);
}
