import { t, type Static } from "elysia";

/**
 * Standard Error Codes for Secure Chat WebSocket and REST APIs
 */
export const ErrorCodeEnum = {
  INVALID_PAYLOAD: "INVALID_PAYLOAD",
  UNAUTHORIZED: "UNAUTHORIZED",
  ROOM_NOT_FOUND: "ROOM_NOT_FOUND",
  ROOM_FULL: "ROOM_FULL",
  ROOM_BURNED: "ROOM_BURNED",
  ALREADY_JOINED: "ALREADY_JOINED",
  NOT_IN_ROOM: "NOT_IN_ROOM",
  RATE_LIMITED: "RATE_LIMITED",
  PAYLOAD_TOO_LARGE: "PAYLOAD_TOO_LARGE",
  TIMESTAMP_DRIFT_EXCEEDED: "TIMESTAMP_DRIFT_EXCEEDED",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type ErrorCode = (typeof ErrorCodeEnum)[keyof typeof ErrorCodeEnum];

export const ErrorCodeSchema = t.Union([
  t.Literal("INVALID_PAYLOAD"),
  t.Literal("UNAUTHORIZED"),
  t.Literal("ROOM_NOT_FOUND"),
  t.Literal("ROOM_FULL"),
  t.Literal("ROOM_BURNED"),
  t.Literal("ALREADY_JOINED"),
  t.Literal("NOT_IN_ROOM"),
  t.Literal("RATE_LIMITED"),
  t.Literal("PAYLOAD_TOO_LARGE"),
  t.Literal("TIMESTAMP_DRIFT_EXCEEDED"),
  t.Literal("INTERNAL_ERROR"),
]);

/**
 * Regex for room ID: 16 to 64 alphanumeric characters, underscores, or hyphens.
 */
export const ROOM_ID_REGEX = /^[A-Za-z0-9_-]{16,64}$/;

/**
 * Base64 validation regex for IV and ciphertext.
 */
export const BASE64_REGEX = /^[A-Za-z0-9+/=]+$/;

// ==========================================
// Encrypted Message History Schemas (for accidental page reload restoration)
// ==========================================

export const EncryptedHistoryItemSchema = t.Object({
  id: t.Number(),
  senderId: t.String(),
  iv: t.String(),
  ciphertext: t.String(),
  timestamp: t.Number(),
  sequence: t.Optional(t.Number()),
});

export type EncryptedHistoryItem = Static<typeof EncryptedHistoryItemSchema>;

// ==========================================
// Client-to-Server WebSocket Schemas
// ==========================================

export const JoinPayloadSchema = t.Object({
  type: t.Literal("join"),
  roomId: t.String({
    pattern: "^[A-Za-z0-9_-]{16,64}$",
    description: "Cryptographically generated room ID",
  }),
  authProof: t.Optional(
    t.String({
      minLength: 16,
      maxLength: 128,
      description: "Optional zero-knowledge auth proof for password-protected rooms",
    })
  ),
});

export const EncryptedMessagePayloadSchema = t.Object({
  type: t.Literal("message"),
  roomId: t.String({ pattern: "^[A-Za-z0-9_-]{16,64}$" }),
  iv: t.String({
    minLength: 16,
    maxLength: 24,
    pattern: "^[A-Za-z0-9+/=]+$",
    description: "Base64 encoded 96-bit AES-GCM IV",
  }),
  ciphertext: t.String({
    minLength: 22,
    maxLength: 88000,
    pattern: "^[A-Za-z0-9+/=]+$",
    description: "Base64 encoded AES-256-GCM ciphertext + 16-byte auth tag",
  }),
  timestamp: t.Number({
    minimum: 0,
    description: "Epoch milliseconds when encrypted on sender device",
  }),
  sequence: t.Optional(
    t.Number({
      minimum: 0,
      description: "Monotonic sender sequence number for replay defense",
    })
  ),
});

export const KeyExchangePayloadSchema = t.Object({
  type: t.Literal("key_exchange"),
  roomId: t.String({ pattern: "^[A-Za-z0-9_-]{16,64}$" }),
  publicKey: t.String({
    minLength: 20,
    maxLength: 2048,
    pattern: "^[A-Za-z0-9+/=]+$",
    description: "Base64 encoded client public key (SPKI or raw ECDH P-256/X25519)",
  }),
  timestamp: t.Number({ minimum: 0 }),
});

export const SyncHistoryPayloadSchema = t.Object({
  type: t.Literal("sync_history"),
  roomId: t.String({ pattern: "^[A-Za-z0-9_-]{16,64}$" }),
  limit: t.Optional(t.Number({ minimum: 1, maximum: 200 })),
});

export const LeavePayloadSchema = t.Object({
  type: t.Literal("leave"),
  roomId: t.String({ pattern: "^[A-Za-z0-9_-]{16,64}$" }),
});

export const BurnPayloadSchema = t.Object({
  type: t.Literal("burn"),
  roomId: t.String({ pattern: "^[A-Za-z0-9_-]{16,64}$" }),
  reason: t.Optional(t.String({ maxLength: 128 })),
});

export const PingPayloadSchema = t.Object({
  type: t.Literal("ping"),
  timestamp: t.Optional(t.Number({ minimum: 0 })),
});

export const PongPayloadSchema = t.Object({
  type: t.Literal("pong"),
  timestamp: t.Optional(t.Number({ minimum: 0 })),
});

/**
 * Tagged union of all valid client messages over WebSocket
 */
export const ClientMessageSchema = t.Union([
  JoinPayloadSchema,
  EncryptedMessagePayloadSchema,
  KeyExchangePayloadSchema,
  SyncHistoryPayloadSchema,
  LeavePayloadSchema,
  BurnPayloadSchema,
  PingPayloadSchema,
  PongPayloadSchema,
]);

export type JoinPayload = Static<typeof JoinPayloadSchema>;
export type EncryptedMessagePayload = Static<typeof EncryptedMessagePayloadSchema>;
export type KeyExchangePayload = Static<typeof KeyExchangePayloadSchema>;
export type SyncHistoryPayload = Static<typeof SyncHistoryPayloadSchema>;
export type LeavePayload = Static<typeof LeavePayloadSchema>;
export type BurnPayload = Static<typeof BurnPayloadSchema>;
export type PingPayload = Static<typeof PingPayloadSchema>;
export type PongPayload = Static<typeof PongPayloadSchema>;
export type ClientMessage = Static<typeof ClientMessageSchema>;

// ==========================================
// Server-to-Client WebSocket Schemas
// ==========================================

export const JoinedEventSchema = t.Object({
  type: t.Literal("joined"),
  peerId: t.String(),
  roomId: t.String(),
  peerCount: t.Number(),
  peers: t.Array(t.String()),
  maxPeers: t.Number(),
  timestamp: t.Number(),
  history: t.Array(EncryptedHistoryItemSchema), // Delivers past encrypted messages for accidental reload recovery
});

export const HistoryEventSchema = t.Object({
  type: t.Literal("history"),
  roomId: t.String(),
  messages: t.Array(EncryptedHistoryItemSchema),
  timestamp: t.Number(),
});

export const PeerJoinedEventSchema = t.Object({
  type: t.Literal("peer_joined"),
  peerId: t.String(),
  peerCount: t.Number(),
  timestamp: t.Number(),
});

export const PeerLeftEventSchema = t.Object({
  type: t.Literal("peer_left"),
  peerId: t.String(),
  peerCount: t.Number(),
  timestamp: t.Number(),
});

export const RelayedMessageEventSchema = t.Object({
  type: t.Literal("message"),
  roomId: t.String(),
  senderId: t.String(),
  iv: t.String(),
  ciphertext: t.String(),
  timestamp: t.Number(),
  sequence: t.Optional(t.Number()),
});

export const RelayedKeyExchangeEventSchema = t.Object({
  type: t.Literal("key_exchange"),
  roomId: t.String(),
  senderId: t.String(),
  publicKey: t.String(),
  timestamp: t.Number(),
});

export const BurnedEventSchema = t.Object({
  type: t.Literal("burned"),
  roomId: t.String(),
  message: t.String(),
  timestamp: t.Number(),
});

export const PongEventSchema = t.Object({
  type: t.Literal("pong"),
  timestamp: t.Number(),
});

export const PingEventSchema = t.Object({
  type: t.Literal("ping"),
  timestamp: t.Number(),
});

export const ErrorEventSchema = t.Object({
  type: t.Literal("error"),
  code: ErrorCodeSchema,
  message: t.String(),
  timestamp: t.Number(),
});

export const ServerMessageSchema = t.Union([
  JoinedEventSchema,
  HistoryEventSchema,
  PeerJoinedEventSchema,
  PeerLeftEventSchema,
  RelayedMessageEventSchema,
  RelayedKeyExchangeEventSchema,
  BurnedEventSchema,
  PongEventSchema,
  PingEventSchema,
  ErrorEventSchema,
]);

export type JoinedEvent = Static<typeof JoinedEventSchema>;
export type HistoryEvent = Static<typeof HistoryEventSchema>;
export type PeerJoinedEvent = Static<typeof PeerJoinedEventSchema>;
export type PeerLeftEvent = Static<typeof PeerLeftEventSchema>;
export type RelayedMessageEvent = Static<typeof RelayedMessageEventSchema>;
export type RelayedKeyExchangeEvent = Static<typeof RelayedKeyExchangeEventSchema>;
export type BurnedEvent = Static<typeof BurnedEventSchema>;
export type PongEvent = Static<typeof PongEventSchema>;
export type PingEvent = Static<typeof PingEventSchema>;
export type ErrorEvent = Static<typeof ErrorEventSchema>;
export type ServerMessage = Static<typeof ServerMessageSchema>;

// ==========================================
// HTTP API Schemas
// ==========================================

export const CreateRoomBodySchema = t.Object({
  roomId: t.Optional(
    t.String({
      pattern: "^[A-Za-z0-9_-]{16,64}$",
      description: "Optional client-generated secure room ID",
    })
  ),
  maxPeers: t.Optional(t.Number({ minimum: 2, maximum: 20 })),
  authVerifierHash: t.Optional(
    t.String({
      minLength: 64,
      maxLength: 64,
      pattern: "^[a-fA-F0-9]{64}$",
      description: "SHA-256 hex string of zero-knowledge auth verifier for password protection",
    })
  ),
  ttlSeconds: t.Optional(t.Number({ minimum: 60, maximum: 86400 })),
});

export const CreateRoomResponseSchema = t.Object({
  success: t.Boolean(),
  roomId: t.String(),
  expiresAt: t.Number(),
  maxPeers: t.Number(),
  hasPassword: t.Boolean(),
});

export const RoomStatusResponseSchema = t.Object({
  exists: t.Boolean(),
  isBurned: t.Boolean(),
  peerCount: t.Number(),
  maxPeers: t.Number(),
  requiresAuth: t.Boolean(),
  expiresAt: t.Nullable(t.Number()),
});

export type CreateRoomBody = Static<typeof CreateRoomBodySchema>;
export type CreateRoomResponse = Static<typeof CreateRoomResponseSchema>;
export type RoomStatusResponse = Static<typeof RoomStatusResponseSchema>;
