import { mkdirSync, existsSync, writeFileSync, watch } from "fs";
import { join } from "path";
import { build as viteBuild } from "vite";
import { config } from "../config.ts";

const liveReloadClients = new Set<any>();

const LIVE_RELOAD_SCRIPT = `
(function () {
  if (
    location.hostname === "localhost" ||
    location.hostname === "127.0.0.1" ||
    location.hostname === "0.0.0.0"
  ) {
    function setupLiveReload() {
      try {
        var proto = location.protocol === "https:" ? "wss:" : "ws:";
        var ws = new WebSocket(proto + "//" + location.host + "/dev/live-reload");
        ws.onmessage = function (event) {
          if (event.data === "reload") {
            console.log("[DevLiveReload] Frontend changed. Reloading...");
            location.reload();
          }
        };
        ws.onclose = function () {
          setTimeout(setupLiveReload, 2000);
        };
      } catch (e) {
        // Ignore in environments where WS is not needed
      }
    }
    setupLiveReload();
  }
})();
`;

/**
 * Compile and bundle the React 19 frontend into public/dist using Vite
 */
export async function buildFrontend(): Promise<{ success: boolean; durationMs: number }> {
  const t0 = performance.now();
  const outdir = join(process.cwd(), "public", "dist");

  if (!existsSync(outdir)) {
    mkdirSync(outdir, { recursive: true });
  }

  // Ensure external live-reload script is present in public/dist
  writeFileSync(join(outdir, "live-reload.js"), LIVE_RELOAD_SCRIPT.trim());

  try {
    await viteBuild({
      configFile: join(process.cwd(), "vite.config.ts"),
      logLevel: "warn",
    });
    const durationMs = Math.round((performance.now() - t0) * 100) / 100;
    return { success: true, durationMs };
  } catch (err) {
    console.error("[Vite Bundler] Frontend build error:", err);
    const durationMs = Math.round((performance.now() - t0) * 100) / 100;
    return { success: false, durationMs };
  }
}

/**
 * Register a client WebSocket for live-reload notifications
 */
export function registerLiveReloadClient(ws: any): void {
  liveReloadClients.add(ws);
}

/**
 * Unregister a client WebSocket
 */
export function unregisterLiveReloadClient(ws: any): void {
  liveReloadClients.delete(ws);
}

/**
 * Broadcast reload signal to all connected browser tabs
 */
export function broadcastLiveReload(): void {
  for (const client of liveReloadClients) {
    try {
      client.send("reload");
    } catch {
      liveReloadClients.delete(client);
    }
  }
}

let watcherInitialized = false;

/**
 * Watch src/frontend for changes in development mode and trigger hot/live reload
 */
export function startFrontendWatcher(): void {
  if (watcherInitialized || config.env === "production") return;
  watcherInitialized = true;

  const frontendDir = join(process.cwd(), "src", "frontend");
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  try {
    watch(frontendDir, { recursive: true }, (_eventType, filename) => {
      if (!filename || filename.endsWith("~") || filename.includes(".git")) return;

      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        const res = await buildFrontend();
        if (res.success) {
          console.log(`[Vite Bundler] Rebuilt frontend in ${res.durationMs}ms (${filename}). Notifying browser...`);
          broadcastLiveReload();
        }
      }, 50);
    });
    console.log("[Vite Bundler] Live-reload watcher active for src/frontend/");
  } catch (err) {
    console.warn("[Vite Bundler] Could not initialize file watcher:", err);
  }
}
