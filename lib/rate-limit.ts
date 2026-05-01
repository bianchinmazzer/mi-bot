// Simple in-memory rate limiter. Good enough for a portfolio bot.
// Note: in serverless this resets on cold starts — for stricter limits use Upstash.

const WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_REQUESTS = 20;

const buckets = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(ip: string): { ok: boolean; remaining: number } {
  const now = Date.now();
  const bucket = buckets.get(ip);

  if (!bucket || bucket.resetAt < now) {
    buckets.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return { ok: true, remaining: MAX_REQUESTS - 1 };
  }

  if (bucket.count >= MAX_REQUESTS) {
    return { ok: false, remaining: 0 };
  }

  bucket.count++;
  return { ok: true, remaining: MAX_REQUESTS - bucket.count };
}