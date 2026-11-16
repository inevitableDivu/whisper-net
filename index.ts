import { Elysia } from "elysia";
import { existsSync } from "fs";
import { join } from "path";
import { config } from "./src/config.ts";
import { securityHeadersPlugin } from "./src/middleware/security-headers.ts";
import { corsPlugin } from "./src/middleware/cors.ts";
import { httpRateLimitPlugin } from "./src/middleware/rate-limit.ts";
import { swaggerPlugin } from "./src/plugins/swagger.ts";
import { healthRoutes } from "./src/routes/health.ts";
import { roomRoutes } from "./src/routes/rooms.ts";
import { wsRoute, shutdownWebSocketService } from "./src/routes/ws.ts";
import { staticRoutes } from "./src/routes/static.ts";
import { buildFrontend, startFrontendWatcher } from "./src/frontend/bundler.ts";
import { roomManager } from "./src/services/room-manager.ts";
import { cleanupCron } from "./src/services/cleanup-cron.ts";
import { chatRepository } from "./src/db/chat-repository.ts";
import { httpRateLimiter, wsRateLimiter } from "./src/services/rate-limiter.ts";

/**
 * Instantiate and configure Elysia application
 */
export const app = new Elysia()
  // Global Error Handler - strictly sanitized to prevent information disclosure
  .onError(({ code, error, set }) => {
    if (code === "VALIDATION") {
      set.status = 400;
      return {
        error: "VALIDATION_ERROR",
        message: "Invalid request payload, query, or parameters",
      };
    }
    if (code === "NOT_FOUND") {
      set.status = 404;
      return {
        error: "NOT_FOUND",
        message: "The requested endpoint does not exist",
      };
    }

    // Default internal server error (never leak raw error messages or stack traces)
    set.status = 500;
    return {
      error: "INTERNAL_ERROR",
      message: "An unexpected error occurred",
    };
  })
  // Hardened Middleware
  .use(securityHeadersPlugin)
  .use(corsPlugin)
  .use(httpRateLimitPlugin)
  // OpenAPI & Swagger Documentation UI (/swagger & /swagger/json)
  .use(swaggerPlugin)
  // Feature Routes
  .use(healthRoutes)
  .use(roomRoutes)
  .use(wsRoute)
  // Static Page & React Frontend Distribution
  .use(staticRoutes);

/**
 * Graceful application shutdown
 */
export function shutdown(): void {
  console.log("\nInitiating graceful shutdown...");
  cleanupCron.stop();
  shutdownWebSocketService();
  roomManager.destroy();
  chatRepository.close();
  httpRateLimiter.destroy();
  wsRateLimiter.destroy();
  app.stop();
  console.log("Zero-knowledge chat backend successfully stopped.");
}

// Attach OS process signals (SIGINT / SIGTERM)
process.on("SIGINT", () => {
  shutdown();
  process.exit(0);
});

process.on("SIGTERM", () => {
  shutdown();
  process.exit(0);
});

// Start listening and cron service if executed directly
if (import.meta.main) {
  // 1. Build React frontend bundle
  await buildFrontend();

  // 2. Start frontend watcher for dev hot/live reload
  if (config.env === "development") {
    startFrontendWatcher();
  }

  // 3. Start the SQLite retention cleanup cron job
  cleanupCron.start();

  const certPath = join(process.cwd(), config.tls.certFile);
  const keyPath = join(process.cwd(), config.tls.keyFile);
  const isTlsActive = config.tls.enabled && existsSync(certPath) && existsSync(keyPath);

  const listenOptions: any = {
    hostname: config.host,
    port: config.port,
  };

  if (isTlsActive) {
    listenOptions.tls = {
      cert: Bun.file(certPath),
      key: Bun.file(keyPath),
    };
  }

  const proto = isTlsActive ? "https" : "http";
  const wsProto = isTlsActive ? "wss" : "ws";

  app.listen(
    listenOptions,
    ({ hostname, port }) => {
      console.log(`
╔════════════════════════════════════════════════════════════════╗
║   🔒 SECURE ZERO-KNOWLEDGE E2EE CHAT BACKEND (ELYSIA + BUN)   ║
╠════════════════════════════════════════════════════════════════╣
║  • Web App (React): ${proto}://${hostname}:${port}
║  • Swagger UI:      ${proto}://${hostname}:${port}/swagger
║  • OpenAPI Doc:     ${proto}://${hostname}:${port}/swagger/json
║  • WebSocket Relay: ${wsProto}://${hostname}:${port}/ws
║  • Health Probe:    ${proto}://${hostname}:${port}/health
║  • Database:        SQLite (${config.db.path})
║  • Hot Reload:      Enabled (Backend: bun --watch, Frontend: Live-Reload)
║  • TLS / HTTPS:     ${isTlsActive ? "ACTIVE (Secure Context for LAN IP access)" : "DISABLED (Access via localhost or run with HTTPS=true)"}
╚════════════════════════════════════════════════════════════════╝
      `);
    }
  );
}
