/**
 * High-Precision In-Memory Sliding-Window Rate Limiter
 *
 * Protects HTTP endpoints and WebSocket connections against brute-force
 * and denial-of-service message flooding.
 */

export interface RateLimitResult {
  readonly allowed: boolean;
  readonly remaining: number;
  readonly resetMs: number;
  readonly currentCount: number;
}

export class SlidingWindowRateLimiter {
  private readonly hits = new Map<string, number[]>();
  private readonly cleanupInterval: ReturnType<typeof setInterval>;

  constructor(cleanupIntervalMs: number = 60_000) {
    this.cleanupInterval = setInterval(() => this.cleanup(), cleanupIntervalMs);
    // Unref so this timer does not prevent process exit
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  /**
   * Check whether an action for a given key is permitted within the sliding window.
   */
  public check(key: string, limit: number, windowMs: number): RateLimitResult {
    const now = Date.now();
    const windowStart = now - windowMs;

    let timestamps = this.hits.get(key);
    if (!timestamps) {
      timestamps = [];
      this.hits.set(key, timestamps);
    }

    // Filter out expired timestamps
    const validTimestamps = timestamps.filter((t) => t > windowStart);
    this.hits.set(key, validTimestamps);

    if (validTimestamps.length >= limit) {
      const oldestValid = validTimestamps[0] ?? now;
      const resetMs = Math.max(0, oldestValid + windowMs - now);
      return {
        allowed: false,
        remaining: 0,
        resetMs,
        currentCount: validTimestamps.length,
      };
    }

    validTimestamps.push(now);
    const remaining = Math.max(0, limit - validTimestamps.length);
    const resetMs = windowMs;

    return {
      allowed: true,
      remaining,
      resetMs,
      currentCount: validTimestamps.length,
    };
  }

  /**
   * Reset rate limit state for a key (e.g. after authorized authentication)
   */
  public reset(key: string): void {
    this.hits.delete(key);
  }

  /**
   * Purge all expired keys from the tracking map to prevent memory leaks
   */
  public cleanup(maxAgeMs: number = 300_000): void {
    const threshold = Date.now() - maxAgeMs;
    for (const [key, timestamps] of this.hits.entries()) {
      const fresh = timestamps.filter((t) => t > threshold);
      if (fresh.length === 0) {
        this.hits.delete(key);
      } else {
        this.hits.set(key, fresh);
      }
    }
  }

  /**
   * Stop the background cleanup timer
   */
  public destroy(): void {
    clearInterval(this.cleanupInterval);
    this.hits.clear();
  }
}

// Global shared instances
export const httpRateLimiter = new SlidingWindowRateLimiter(60_000);
export const wsRateLimiter = new SlidingWindowRateLimiter(30_000);
