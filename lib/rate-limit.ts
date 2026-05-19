import { LRUCache } from "lru-cache";
import { NextRequest, NextResponse } from "next/server";

interface RateLimitOptions {
  /** Max requests allowed in the window */
  limit: number;
  /** Window duration in milliseconds */
  windowMs: number;
}

// Module-level cache persists across requests within the same serverless instance.
// Not distributed — does not coordinate across Vercel instances — but still blocks
// the common case of a single client hammering one instance.
const cache = new LRUCache<string, number[]>({
  max: 5000,
  ttl: 60 * 60 * 1000, // 1 hour max TTL
});

export function rateLimit(req: NextRequest, opts: RateLimitOptions): NextResponse | null {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  const key = `${req.nextUrl.pathname}::${ip}`;
  const now = Date.now();
  const windowStart = now - opts.windowMs;

  const timestamps = (cache.get(key) ?? []).filter((t) => t > windowStart);
  timestamps.push(now);
  cache.set(key, timestamps);

  if (timestamps.length > opts.limit) {
    const retryAfter = Math.ceil(opts.windowMs / 1000);
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfter),
          "X-RateLimit-Limit": String(opts.limit),
          "X-RateLimit-Remaining": "0",
        },
      },
    );
  }

  return null; // allowed
}
