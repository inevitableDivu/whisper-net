import { Elysia, getSchemaValidator } from "elysia";
import { config } from "../config.ts";
import { generatePeerId, validateTimestamp } from "../crypto/server-crypto.ts";
import { roomManager } from "../services/room-manager.ts";
import { wsRateLimiter } from "../services/rate-limiter.ts";
import { chatRepository } from "../db/chat-repository.ts";
import {
  ClientMessageSchema,
  type ClientMessage,
  type ServerMessage,
  type JoinedEvent,
  type HistoryEvent,
  type PeerJoinedEvent,
  type PeerLeftEvent,
  type RelayedMessageEvent,
  type RelayedKeyExchangeEvent,
  type BurnedEvent,
  type PongEvent,
  type ErrorEvent,
} from "../types/contracts.ts";

interface WsSession {
  readonly peerId: string;
  readonly ip: string;
  readonly connectedAt: number;
  currentRoomId: string | null;
  lastSequence: number;
  lastActive: number;
  isAlive: boolean;
  ws: any;
}

// Validator compiled ahead-of-time for maximum throughput
const clientMessageValidator = getSchemaValidator(ClientMessageSchema);

// Connection registries keyed by stable Elysia ws.id and peerId
const sessionByWsId = new Map<string, WsSession>();
const sessionByPeerId = new Map<string, WsSession>();

/**
 * Send a strongly-typed server message to a client socket
 */
function sendToSocket(ws: any, message: ServerMessage): void {
  try {
    ws.send(message);
  } catch {
    // Socket might be closing or detached
  }
}

/**
 * Send a typed error frame to a client socket
 */
function sendError(ws: any, code: ErrorEvent["code"], message: string): void {
  sendToSocket(ws, {
    type: "error",
    code,
    message,
    timestamp: Date.now(),
  });
}

/**
 * Leave a room cleanly and notify remaining peers
 */
function handleLeave(ws: any, session: WsSession): void {
  const roomId = session.currentRoomId;
  if (!roomId) return;

  session.currentRoomId = null;
  ws.unsubscribe(`room:${roomId}`);

  const { remainingPeers } = roomManager.leaveRoom(roomId, session.peerId);
  const leftEvent: PeerLeftEvent = {
    type: "peer_left",
    peerId: session.peerId,
    peerCount: remainingPeers,
    timestamp: Date.now(),
  };

  try {
    ws.publish(`room:${roomId}`, leftEvent);
  } catch {
    // Ignore publish errors on closed topics
  }
}

/**
 * Execute the zero-knowledge burn protocol:
 * 1. Broadcasts burned event to topic
 * 2. Purges room from memory and deletes all encrypted messages from SQLite immediately
 * 3. Forcefully terminates all sockets in the room
 */
function executeRoomBurn(ws: any, session: WsSession, roomId: string, reason?: string): void {
  const burnNotice: BurnedEvent = {
    type: "burned",
    roomId,
    message: reason || "Room memory and encrypted history destroyed by peer burn request",
    timestamp: Date.now(),
  };

  // Broadcast to peers
  try {
    ws.publish(`room:${roomId}`, burnNotice);
  } catch {
    // ignore
  }

  // Send to caller
  sendToSocket(ws, burnNotice);

  // Burn on server, wipe SQLite messages, and evict all peers
  const { evictedPeerIds } = roomManager.burnRoom(roomId);

  for (const peerId of evictedPeerIds) {
    const peerSession = sessionByPeerId.get(peerId);
    if (peerSession) {
      peerSession.currentRoomId = null;
      try {
        peerSession.ws.unsubscribe(`room:${roomId}`);
        peerSession.ws.close(4000, "Room Burned");
      } catch {
        // ignore
      }
    }
  }
}

// Background heartbeat to prune genuinely dead sockets and keep active ones alive
const heartbeatTimer = setInterval(() => {
  const now = Date.now();
  for (const session of sessionByWsId.values()) {
    // Only terminate if completely unresponsive for > 90 seconds (3 missed cycles)
    if (now - session.lastActive > 90_000) {
      try {
        session.ws.close(1001, "Heartbeat timeout");
      } catch {
        // ignore
      }
      continue;
    }
    // Ping client to verify socket health
    sendToSocket(session.ws, { type: "ping", timestamp: now });
  }
}, config.heartbeat.pingIntervalMs);

if (heartbeatTimer.unref) {
  heartbeatTimer.unref();
}

/**
 * Cleanup function for server shutdown
 */
export function shutdownWebSocketService(): void {
  clearInterval(heartbeatTimer);
  for (const session of sessionByWsId.values()) {
    try {
      session.ws.close(1000, "Server shutting down");
    } catch {
      // ignore
    }
  }
  sessionByWsId.clear();
  sessionByPeerId.clear();
}

/**
 * WebSocket Elysia Route
 */
export const wsRoute = new Elysia().ws("/ws", {
  open(ws) {
    const peerId = generatePeerId();
    const ip = ws.remoteAddress || "unknown";

    const session: WsSession = {
      peerId,
      ip,
      connectedAt: Date.now(),
      currentRoomId: null,
      lastSequence: -1,
      lastActive: Date.now(),
      isAlive: true,
      ws,
    };

    sessionByWsId.set(ws.id, session);
    sessionByPeerId.set(peerId, session);
  },

  async message(ws, raw) {
    const session = sessionByWsId.get(ws.id);
    if (!session) {
      return;
    }

    session.ws = ws; // update reference
    session.isAlive = true;
    session.lastActive = Date.now();
    roomManager.touchPeer(session.peerId);

    // 1. Rate limiting check per connection
    const rateCheck = wsRateLimiter.check(
      session.peerId,
      config.rateLimit.wsMessagesPerWindow,
      config.rateLimit.wsWindowMs
    );
    if (!rateCheck.allowed) {
      sendError(ws, "RATE_LIMITED", "Message rate limit exceeded. Please slow down.");
      return;
    }

    // 2. Parse and validate message
    let parsed: unknown;
    if (typeof raw === "string") {
      if (raw.length > config.security.maxPayloadBytes) {
        sendError(ws, "PAYLOAD_TOO_LARGE", "WebSocket message exceeded maximum payload size");
        return;
      }
      try {
        parsed = JSON.parse(raw);
      } catch {
        sendError(ws, "INVALID_PAYLOAD", "Malformed JSON payload");
        return;
      }
    } else if (typeof raw === "object" && raw !== null) {
      parsed = raw;
    } else {
      sendError(ws, "INVALID_PAYLOAD", "Payload must be a JSON object or string");
      return;
    }

    if (!clientMessageValidator.Check(parsed)) {
      const firstError = [...clientMessageValidator.Errors(parsed)][0];
      const errorMessage = firstError
        ? `Field '${firstError.path}': ${firstError.message}`
        : "Payload does not conform to protocol schema";
      sendError(ws, "INVALID_PAYLOAD", errorMessage);
      return;
    }

    const msg = parsed as ClientMessage;

    // 3. Dispatch action based on message type
    switch (msg.type) {
      case "ping": {
        const pong: PongEvent = {
          type: "pong",
          timestamp: Date.now(),
        };
        sendToSocket(ws, pong);
        break;
      }

      case "pong": {
        // Client heartbeat response
        session.isAlive = true;
        session.lastActive = Date.now();
        break;
      }

      case "join": {
        if (session.currentRoomId) {
          sendError(ws, "ALREADY_JOINED", `Client is already connected to room ${session.currentRoomId}`);
          return;
        }

        const joinResult = await roomManager.joinRoom(msg.roomId, session.peerId, msg.authProof);
        if (!joinResult.success) {
          const errorMessage =
            joinResult.error === "ROOM_BURNED"
              ? "This room was permanently burned and deleted. The room ID and password are invalid."
              : `Unable to join room: ${joinResult.error}`;
          sendError(ws, joinResult.error, errorMessage);
          return;
        }

        session.currentRoomId = msg.roomId;
        ws.subscribe(`room:${msg.roomId}`);

        // Fetch recent encrypted chat history from SQLite for accidental page reload recovery
        const history = chatRepository.getRoomHistory(msg.roomId, config.retention.maxHistoryPerRoom);

        // Acknowledge join to the sender with recent encrypted history
        const joinedNotice: JoinedEvent = {
          type: "joined",
          peerId: session.peerId,
          roomId: msg.roomId,
          peerCount: joinResult.peerCount,
          peers: joinResult.peers,
          maxPeers: joinResult.room.maxPeers,
          timestamp: Date.now(),
          history,
        };
        sendToSocket(ws, joinedNotice);

        // Notify other room participants
        const peerJoinedNotice: PeerJoinedEvent = {
          type: "peer_joined",
          peerId: session.peerId,
          peerCount: joinResult.peerCount,
          timestamp: Date.now(),
        };
        ws.publish(`room:${msg.roomId}`, peerJoinedNotice);
        break;
      }

      case "sync_history": {
        if (session.currentRoomId !== msg.roomId) {
          sendError(ws, "NOT_IN_ROOM", "Cannot sync history for an unjoined room");
          return;
        }

        const history = chatRepository.getRoomHistory(
          msg.roomId,
          msg.limit ?? config.retention.maxHistoryPerRoom
        );

        const historyEvent: HistoryEvent = {
          type: "history",
          roomId: msg.roomId,
          messages: history,
          timestamp: Date.now(),
        };
        sendToSocket(ws, historyEvent);
        break;
      }

      case "message": {
        if (session.currentRoomId !== msg.roomId) {
          sendError(ws, "NOT_IN_ROOM", "Cannot send message to an unjoined room");
          return;
        }

        if (!validateTimestamp(msg.timestamp, config.security.maxTimestampDriftMs)) {
          sendError(
            ws,
            "TIMESTAMP_DRIFT_EXCEEDED",
            "Message timestamp drift exceeded acceptable threshold"
          );
          return;
        }

        if (msg.sequence !== undefined) {
          if (msg.sequence <= session.lastSequence) {
            sendError(
              ws,
              "INVALID_PAYLOAD",
              "Monotonic sequence check failed (possible replay attack)"
            );
            return;
          }
          session.lastSequence = msg.sequence;
        }

        // Store encrypted message in SQLite with TTL for accidental page reload recovery
        chatRepository.saveMessage({
          roomId: msg.roomId,
          senderId: session.peerId,
          iv: msg.iv,
          ciphertext: msg.ciphertext,
          sequence: msg.sequence,
          clientTimestamp: msg.timestamp,
          expiresAt: Date.now() + config.retention.chatTtlMs,
        });

        // Blind relay: server forwards ciphertext directly to peers without decrypting
        const relayedMessage: RelayedMessageEvent = {
          type: "message",
          roomId: msg.roomId,
          senderId: session.peerId,
          iv: msg.iv,
          ciphertext: msg.ciphertext,
          timestamp: msg.timestamp,
          sequence: msg.sequence,
        };

        ws.publish(`room:${msg.roomId}`, relayedMessage);
        break;
      }

      case "key_exchange": {
        if (session.currentRoomId !== msg.roomId) {
          sendError(ws, "NOT_IN_ROOM", "Cannot exchange keys in an unjoined room");
          return;
        }

        const relayedKey: RelayedKeyExchangeEvent = {
          type: "key_exchange",
          roomId: msg.roomId,
          senderId: session.peerId,
          publicKey: msg.publicKey,
          timestamp: Date.now(),
        };

        ws.publish(`room:${msg.roomId}`, relayedKey);
        break;
      }

      case "leave": {
        if (session.currentRoomId !== msg.roomId) {
          sendError(ws, "NOT_IN_ROOM", "Cannot leave an unjoined room");
          return;
        }
        handleLeave(ws, session);
        break;
      }

      case "burn": {
        if (session.currentRoomId !== msg.roomId) {
          sendError(ws, "NOT_IN_ROOM", "Cannot burn an unjoined room");
          return;
        }
        executeRoomBurn(ws, session, msg.roomId, msg.reason);
        break;
      }
    }
  },

  close(ws) {
    const session = sessionByWsId.get(ws.id);
    if (!session) return;

    if (session.currentRoomId) {
      handleLeave(ws, session);
    }

    sessionByWsId.delete(ws.id);
    sessionByPeerId.delete(session.peerId);
  },
});
