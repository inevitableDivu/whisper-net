import { Elysia } from "elysia";
import { httpRateLimiter } from "../services/rate-limiter.ts";
import { config } from "../config.ts";

/**
 * Extract client IP with proxy-aware fallback
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const cfConnectingIp = request.headers.get("cf-connecting-ip");
  if (cfConnectingIp) {
    return cfConnectingIp.trim();
  }
  return "unknown-client";
}

/**
 * HTTP Rate Limit Middleware for Elysia
 */
export const httpRateLimitPlugin = new Elysia({ name: "http-rate-limit" })
  .onBeforeHandle(({ request, set }) => {
    const ip = getClientIp(request);
    const key = `http:${ip}`;
    const result = httpRateLimiter.check(
      key,
      config.rateLimit.httpRequestsPerMinute,
      60_000
    );

    set.headers["X-RateLimit-Limit"] = String(config.rateLimit.httpRequestsPerMinute);
    set.headers["X-RateLimit-Remaining"] = String(result.remaining);
    set.headers["X-RateLimit-Reset"] = String(Math.ceil(result.resetMs / 1000));

    if (!result.allowed) {
      set.status = 429;
      set.headers["Retry-After"] = String(Math.ceil(result.resetMs / 1000));
      return {
        error: "RATE_LIMITED",
        message: "Too many requests. Please try again later.",
      };
    }
  });
