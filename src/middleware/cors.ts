import { Elysia } from "elysia";
import { config } from "../config.ts";

/**
 * Strict Zero-Knowledge CORS Plugin
 */
export const corsPlugin = new Elysia({ name: "cors" })
  .onRequest(({ request, set }) => {
    const origin = request.headers.get("origin");
    const allowed = config.security.allowedOrigins;

    let allowOriginHeader = "";

    if (allowed.includes("*")) {
      allowOriginHeader = "*";
    } else if (origin && allowed.includes(origin)) {
      allowOriginHeader = origin;
    }

    if (allowOriginHeader) {
      set.headers["Access-Control-Allow-Origin"] = allowOriginHeader;
      set.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
      set.headers["Access-Control-Allow-Headers"] =
        "Content-Type, Authorization, X-Requested-With";
      set.headers["Access-Control-Max-Age"] = "86400";
    }

    if (request.method === "OPTIONS") {
      set.status = 204;
      return new Response(null, {
        status: 204,
        headers: set.headers as Record<string, string>,
      });
    }
  });
