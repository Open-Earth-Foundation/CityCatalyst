// Simple in-memory rate limiter for Next.js
export class RateLimiter {
  private requests = new Map<string, { count: number; resetTime: number }>();
  private windowMs: number;
  private maxRequests: number;

  constructor(windowMs: number = 60 * 1000, maxRequests: number = 60) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
  }

  checkLimit(key: string): boolean {
    const now = Date.now();
    const record = this.requests.get(key);

    if (!record || now > record.resetTime) {
      // First request or window expired
      this.requests.set(key, {
        count: 1,
        resetTime: now + this.windowMs,
      });
      return true; // Allow request
    }

    if (record.count >= this.maxRequests) {
      return false; // Rate limited
    }

    record.count++;
    return true; // Allow request
  }

  cleanup() {
    const now = Date.now();
    for (const [key, record] of this.requests.entries()) {
      if (now > record.resetTime) {
        this.requests.delete(key);
      }
    }
  }

  // Get current stats for a key (useful for debugging/monitoring)
  getStats(key: string) {
    const record = this.requests.get(key);
    if (!record) return null;

    const now = Date.now();
    const remaining = Math.max(0, record.resetTime - now);
    return {
      count: record.count,
      remainingMs: remaining,
      isExpired: now > record.resetTime,
    };
  }
}
