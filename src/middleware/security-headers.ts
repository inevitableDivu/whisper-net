import { Elysia } from "elysia";

/**
 * Hardened Security Headers Middleware
 *
 * Implements strict defense-in-depth HTTP headers for zero-knowledge environments.
 * Prevents clickjacking, MIME-confusion, cross-site leaks, and caching.
 *
 * Automatically permits Swagger/Scalar UI assets when accessing the documentation path.
 */
export const securityHeadersPlugin = new Elysia({ name: "security-headers" })
  .onRequest(({ request, set }) => {
    const url = new URL(request.url);
    const isDocPath = url.pathname.startsWith("/swagger");

    if (isDocPath) {
      // Allow CDN assets for Swagger / Scalar UI rendering
      set.headers["Content-Security-Policy"] =
        "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com https://cdn.jsdelivr.net; img-src 'self' data: https:; connect-src 'self' https: wss: ws:; object-src 'none'; frame-ancestors 'none'";
    } else {
      // Allow self and inline scripts/styles for React SPA and chat interface
      set.headers["Content-Security-Policy"] =
        "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' wss: ws: https:; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";
    }

    set.headers["Strict-Transport-Security"] =
      "max-age=63072000; includeSubDomains; preload";
    set.headers["X-Content-Type-Options"] = "nosniff";
    set.headers["X-Frame-Options"] = "DENY";
    set.headers["Referrer-Policy"] = "no-referrer";
    set.headers["Permissions-Policy"] =
      "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()";
    set.headers["Cross-Origin-Opener-Policy"] = "same-origin";
    set.headers["Cross-Origin-Resource-Policy"] = "cross-origin";

    // Zero-knowledge anti-caching headers: ensure no proxies or browsers store API responses
    if (!isDocPath) {
      set.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, proxy-revalidate";
      set.headers["Pragma"] = "no-cache";
      set.headers["Expires"] = "0";
    }
  });
