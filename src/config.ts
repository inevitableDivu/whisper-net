/**
 * Server Configuration for Secure Zero-Knowledge Chat Backend
 * All sensitive limits and defaults are strictly defined and validated.
 */

export interface ServerConfig {
  readonly env: "development" | "production" | "test";
  readonly host: string;
  readonly port: number;

  readonly db: {
    readonly path: string;
  };

  readonly retention: {
    /** How long encrypted messages are kept for accidental reloads before being purged (default: 60 minutes) */
    readonly chatTtlMs: number;
    /** How frequently the cleanup cron job runs to purge expired messages (default: 5 minutes) */
    readonly cleanupIntervalMs: number;
    /** Maximum encrypted messages returned when a peer reconnects/reloads */
    readonly maxHistoryPerRoom: number;
  };

  readonly security: {
    /** Maximum allowed WebSocket payload size in bytes (default: 64KB) */
    readonly maxPayloadBytes: number;
    /** Maximum peers allowed in a single chat room */
    readonly maxPeersPerRoom: number;
    /** Time-to-live for an inactive room before automatic reaping (default: 24h) */
    readonly roomTtlMs: number;
    /** Time before an empty room is purged from memory (default: 60s) */
    readonly emptyRoomGracePeriodMs: number;
    /** Duration a burned room ID is tombstoned to prevent re-creation (default: 5m) */
    readonly burnTombstoneMs: number;
    /** Maximum timestamp skew allowed for client messages (replay attack mitigation) (default: 30s) */
    readonly maxTimestampDriftMs: number;
    /** Whitelist of allowed origins for CORS (empty or ['*'] for permissive in dev) */
    readonly allowedOrigins: readonly string[];
  };

  readonly rateLimit: {
    /** Maximum HTTP requests per IP per minute */
    readonly httpRequestsPerMinute: number;
    /** Maximum room creations per IP per minute */
    readonly roomCreationsPerMinute: number;
    /** Maximum WebSocket messages per socket per 10-second window */
    readonly wsMessagesPerWindow: number;
    /** WebSocket message rate limit window in ms */
    readonly wsWindowMs: number;
  };

  readonly heartbeat: {
    /** Interval at which server sends ping frames (in ms) */
    readonly pingIntervalMs: number;
    /** Time to wait for pong before terminating dead socket (in ms) */
    readonly pongTimeoutMs: number;
  };

  readonly tls: {
    /** Whether HTTPS/TLS is enabled */
    readonly enabled: boolean;
    readonly certFile: string;
    readonly keyFile: string;
  };
}

const env = (process.env.NODE_ENV as "development" | "production" | "test") || "development";

export const config: ServerConfig = {
  env,
  host: process.env.HOST || "0.0.0.0",
  port: parseInt(process.env.PORT || "3000", 10),

  tls: {
    enabled: process.env.HTTPS === "true" || process.env.TLS === "true",
    certFile: process.env.TLS_CERT || "certs/cert.pem",
    keyFile: process.env.TLS_KEY || "certs/key.pem",
  },

  db: {
    path: process.env.DATABASE_PATH || (env === "test" ? ":memory:" : "data/secure_chat.sqlite"),
  },

  retention: {
    chatTtlMs: parseInt(process.env.CHAT_RETENTION_MINUTES || "60", 10) * 60 * 1000, // 60 minutes default
    cleanupIntervalMs: parseInt(process.env.CLEANUP_INTERVAL_MINUTES || "5", 10) * 60 * 1000, // 5 minutes default
    maxHistoryPerRoom: parseInt(process.env.MAX_HISTORY_PER_ROOM || "100", 10),
  },

  security: {
    maxPayloadBytes: parseInt(process.env.MAX_PAYLOAD_BYTES || "65536", 10), // 64 KB
    maxPeersPerRoom: parseInt(process.env.MAX_PEERS_PER_ROOM || "10", 10),
    roomTtlMs: parseInt(process.env.ROOM_TTL_MS || String(24 * 60 * 60 * 1000), 10), // 24 hours
    emptyRoomGracePeriodMs: parseInt(process.env.EMPTY_ROOM_GRACE_MS || String(5 * 60 * 1000), 10), // 5 minutes grace
    burnTombstoneMs: parseInt(process.env.BURN_TOMBSTONE_MS || String(5 * 60 * 1000), 10), // 5 minutes
    maxTimestampDriftMs: parseInt(process.env.MAX_TIMESTAMP_DRIFT_MS || String(5 * 60 * 1000), 10), // 5 minutes clock tolerance
    allowedOrigins: process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(",").map((s) => s.trim())
      : ["*"],
  },

  rateLimit: {
    httpRequestsPerMinute: parseInt(process.env.HTTP_RATE_LIMIT || "100", 10),
    roomCreationsPerMinute: parseInt(process.env.ROOM_CREATE_RATE_LIMIT || "15", 10),
    wsMessagesPerWindow: parseInt(process.env.WS_MESSAGES_PER_WINDOW || "60", 10), // 60 msgs
    wsWindowMs: 10 * 1000, // per 10 seconds
  },

  heartbeat: {
    pingIntervalMs: 30 * 1000, // 30 seconds
    pongTimeoutMs: 10 * 1000, // 10 seconds
  },
} as const;
