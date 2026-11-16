import { Elysia, t } from "elysia";
import { roomManager } from "../services/room-manager.ts";
import { httpRateLimiter } from "../services/rate-limiter.ts";
import { getClientIp } from "../middleware/rate-limit.ts";
import { config } from "../config.ts";
import {
  CreateRoomBodySchema,
  CreateRoomResponseSchema,
  RoomStatusResponseSchema,
} from "../types/contracts.ts";

export const roomRoutes = new Elysia({ prefix: "/api/rooms" })
  .post(
    "/",
    async ({ body, request, set }) => {
      const ip = getClientIp(request);
      const rateLimitCheck = httpRateLimiter.check(
        `create-room:${ip}`,
        config.rateLimit.roomCreationsPerMinute,
        60_000
      );

      if (!rateLimitCheck.allowed) {
        set.status = 429;
        set.headers["Retry-After"] = String(Math.ceil(rateLimitCheck.resetMs / 1000));
        throw new Error("RATE_LIMITED: Exceeded room creation rate limit");
      }

      const ttlMs = body.ttlSeconds ? body.ttlSeconds * 1000 : config.security.roomTtlMs;

      const room = roomManager.createRoom({
        customId: body.roomId,
        maxPeers: body.maxPeers,
        authVerifierHash: body.authVerifierHash,
        ttlMs,
      });

      set.status = 201;
      return {
        success: true,
        roomId: room.id,
        expiresAt: room.expiresAt,
        maxPeers: room.maxPeers,
        hasPassword: Boolean(room.authVerifierHash),
      };
    },
    {
      body: CreateRoomBodySchema,
      response: {
        201: CreateRoomResponseSchema,
      },
      detail: {
        tags: ["Rooms"],
        summary: "Create an ephemeral zero-knowledge chat room",
        description:
          "Registers a new chat room record. If a room password is used, the client device derives `authVerifierHash = SHA-256(authProof)` using window.crypto.subtle (PBKDF2 100k rounds) and submits it. The server never receives or derives the password.",
      },
    }
  )
  .get(
    "/:roomId/status",
    ({ params, set }) => {
      const { roomId } = params;

      if (roomManager.isTombstoned(roomId)) {
        return {
          exists: false,
          isBurned: true,
          peerCount: 0,
          maxPeers: 0,
          requiresAuth: false,
          expiresAt: null,
        };
      }

      const room = roomManager.getRoom(roomId);
      if (!room) {
        set.status = 404;
        return {
          exists: false,
          isBurned: false,
          peerCount: 0,
          maxPeers: 0,
          requiresAuth: false,
          expiresAt: null,
        };
      }

      return {
        exists: true,
        isBurned: room.isBurned,
        peerCount: room.peers.size,
        maxPeers: room.maxPeers,
        requiresAuth: Boolean(room.authVerifierHash),
        expiresAt: room.expiresAt,
      };
    },
    {
      params: t.Object({
        roomId: t.String({ pattern: "^[A-Za-z0-9_-]{16,64}$" }),
      }),
      response: {
        200: RoomStatusResponseSchema,
        404: RoomStatusResponseSchema,
      },
      detail: {
        tags: ["Rooms"],
        summary: "Query room status",
        description:
          "Retrieves sanitized room status: whether the room exists, whether it was burned, current active peer count, capacity limit, and whether zero-knowledge password authentication is required.",
      },
    }
  );
