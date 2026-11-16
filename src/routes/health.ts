import { Elysia, t } from "elysia";
import { roomManager } from "../services/room-manager.ts";

export const healthRoutes = new Elysia({ prefix: "/health" })
  .get(
    "/",
    () => ({
      status: "pass",
      timestamp: Date.now(),
      uptimeSeconds: Math.floor(process.uptime()),
    }),
    {
      detail: {
        tags: ["Health & Diagnostics"],
        summary: "Service liveness probe",
        description: "Returns health status and process uptime.",
      },
    }
  )
  .get(
    "/stats",
    () => {
      const memory = process.memoryUsage();
      const stats = roomManager.getStats();

      return {
        status: "ok",
        timestamp: Date.now(),
        metrics: {
          activeRooms: stats.activeRooms,
          activePeers: stats.activePeers,
          tombstonedRooms: stats.tombstonedRooms,
          memory: {
            heapUsedMb: Math.round((memory.heapUsed / 1024 / 1024) * 100) / 100,
            rssMb: Math.round((memory.rss / 1024 / 1024) * 100) / 100,
          },
        },
      };
    },
    {
      detail: {
        tags: ["Health & Diagnostics"],
        summary: "Blinded server metrics without PII",
        description: "Returns anonymized active rooms, active peers, and memory diagnostics without revealing IP addresses or user data.",
      },
    }
  );
