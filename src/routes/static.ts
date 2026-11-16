import { Elysia, t } from "elysia";
import { join } from "path";
import {
  registerLiveReloadClient,
  unregisterLiveReloadClient,
} from "../frontend/bundler.ts";

/**
 * Static asset and SPA serving plugin for Elysia
 */
export const staticRoutes = new Elysia({ name: "static-routes" })
  // 1. Serve primary HTML index
  .get("/", () => {
    const indexPath = join(process.cwd(), "public", "index.html");
    return Bun.file(indexPath);
  })

  // Favicon (Clean SVG shield icon preventing 404s)
  .get("/favicon.ico", ({ set }) => {
    set.headers["Content-Type"] = "image/svg+xml; charset=utf-8";
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`;
  })

  // 2. Serve bundled assets from public/dist/
  .get(
    "/dist/:file",
    ({ params, set }) => {
      const safeFilename = params.file.replace(/[^a-zA-Z0-9._-]/g, "");
      const filePath = join(process.cwd(), "public", "dist", safeFilename);
      const file = Bun.file(filePath);

      if (safeFilename.endsWith(".js")) {
        set.headers["Content-Type"] = "application/javascript; charset=utf-8";
      } else if (safeFilename.endsWith(".css")) {
        set.headers["Content-Type"] = "text/css; charset=utf-8";
      }

      return file;
    },
    {
      params: t.Object({
        file: t.String(),
      }),
    }
  )

  // 3. Live reload WebSocket endpoint for frontend development
  .ws("/dev/live-reload", {
    open(ws) {
      registerLiveReloadClient(ws);
    },
    close(ws) {
      unregisterLiveReloadClient(ws);
    },
  });
