import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { SlidingWindowRateLimiter } from "../src/services/rate-limiter.ts";

describe("SlidingWindowRateLimiter", () => {
  let limiter: SlidingWindowRateLimiter;

  beforeEach(() => {
    limiter = new SlidingWindowRateLimiter(60_000);
  });

  afterEach(() => {
    limiter.destroy();
  });

  it("should allow requests under the limit", () => {
    const key = "test-client";
    const res1 = limiter.check(key, 3, 1000);
    expect(res1.allowed).toBe(true);
    expect(res1.remaining).toBe(2);

    const res2 = limiter.check(key, 3, 1000);
    expect(res2.allowed).toBe(true);
    expect(res2.remaining).toBe(1);

    const res3 = limiter.check(key, 3, 1000);
    expect(res3.allowed).toBe(true);
    expect(res3.remaining).toBe(0);
  });

  it("should reject requests exceeding the limit", () => {
    const key = "flooder";
    limiter.check(key, 2, 1000);
    limiter.check(key, 2, 1000);

    const resOver = limiter.check(key, 2, 1000);
    expect(resOver.allowed).toBe(false);
    expect(resOver.remaining).toBe(0);
    expect(resOver.resetMs).toBeGreaterThan(0);
  });

  it("should reset rate limit on explicit reset()", () => {
    const key = "reset-target";
    limiter.check(key, 1, 1000);
    expect(limiter.check(key, 1, 1000).allowed).toBe(false);

    limiter.reset(key);
    expect(limiter.check(key, 1, 1000).allowed).toBe(true);
  });
});
