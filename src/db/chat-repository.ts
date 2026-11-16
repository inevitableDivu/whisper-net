import type { Database, Statement } from "bun:sqlite";
import { db as defaultDb } from "./database.ts";
import type { EncryptedHistoryItem } from "../types/contracts.ts";

export interface SaveMessageParams {
  roomId: string;
  senderId: string;
  iv: string;
  ciphertext: string;
  sequence?: number;
  clientTimestamp: number;
  expiresAt: number;
}

export interface DbRoomRecord {
  id: string;
  maxPeers: number;
  authVerifierHash: string | null;
  createdAt: number;
  expiresAt: number;
  isBurned: boolean;
}

export class ChatRepository {
  private readonly db: Database;
  private readonly insertMessageStmt: Statement;
  private readonly getHistoryStmt: Statement;
  private readonly purgeExpiredMessagesStmt: Statement;
  private readonly purgeRoomMessagesStmt: Statement;
  private readonly insertRoomStmt: Statement;
  private readonly getRoomStmt: Statement;
  private readonly burnRoomStmt: Statement;
  private readonly purgeExpiredRoomsStmt: Statement;

  constructor(database: Database = defaultDb) {
    this.db = database;

    this.insertMessageStmt = this.db.prepare(`
      INSERT INTO encrypted_messages (
        room_id, sender_id, iv, ciphertext, sequence, client_timestamp, created_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.getHistoryStmt = this.db.prepare(`
      SELECT
        id,
        sender_id as senderId,
        iv,
        ciphertext,
        client_timestamp as timestamp,
        sequence
      FROM encrypted_messages
      WHERE room_id = ?
      ORDER BY id ASC
      LIMIT ?
    `);

    this.purgeExpiredMessagesStmt = this.db.prepare(`
      DELETE FROM encrypted_messages WHERE expires_at <= ?
    `);

    this.purgeRoomMessagesStmt = this.db.prepare(`
      DELETE FROM encrypted_messages WHERE room_id = ?
    `);

    this.insertRoomStmt = this.db.prepare(`
      INSERT OR REPLACE INTO rooms (
        id, max_peers, auth_verifier_hash, created_at, expires_at, is_burned
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);

    this.getRoomStmt = this.db.prepare(`
      SELECT
        id,
        max_peers as maxPeers,
        auth_verifier_hash as authVerifierHash,
        created_at as createdAt,
        expires_at as expiresAt,
        is_burned as isBurned
      FROM rooms
      WHERE id = ?
    `);

    this.burnRoomStmt = this.db.prepare(`
      UPDATE rooms SET is_burned = 1 WHERE id = ?
    `);

    this.purgeExpiredRoomsStmt = this.db.prepare(`
      DELETE FROM rooms WHERE expires_at <= ? OR is_burned = 1
    `);
  }

  /**
   * Persist an encrypted message (zero-knowledge ciphertext)
   */
  public saveMessage(params: SaveMessageParams): number {
    const now = Date.now();
    const result = this.insertMessageStmt.run(
      params.roomId,
      params.senderId,
      params.iv,
      params.ciphertext,
      params.sequence ?? null,
      params.clientTimestamp,
      now,
      params.expiresAt
    ) as { lastInsertRowid: number };

    return Number(result.lastInsertRowid);
  }

  /**
   * Retrieve encrypted message history for accidental page reload recovery
   */
  public getRoomHistory(roomId: string, limit: number = 100): EncryptedHistoryItem[] {
    const rows = this.getHistoryStmt.all(roomId, limit) as Array<{
      id: number;
      senderId: string;
      iv: string;
      ciphertext: string;
      timestamp: number;
      sequence: number | null;
    }>;

    return rows.map((row) => ({
      id: row.id,
      senderId: row.senderId,
      iv: row.iv,
      ciphertext: row.ciphertext,
      timestamp: row.timestamp,
      sequence: row.sequence ?? undefined,
    }));
  }

  /**
   * Purge expired messages from SQLite.
   * If excludeRoomIds is provided, rooms with active users will NOT have their messages purged.
   */
  public purgeExpiredMessages(now: number = Date.now(), excludeRoomIds: string[] = []): number {
    if (excludeRoomIds.length === 0) {
      const result = this.purgeExpiredMessagesStmt.run(now) as { changes: number };
      return result.changes;
    }

    const placeholders = excludeRoomIds.map(() => "?").join(",");
    const query = `
      DELETE FROM encrypted_messages
      WHERE expires_at <= ?
        AND room_id NOT IN (${placeholders})
    `;
    const stmt = this.db.prepare(query);
    const result = stmt.run(now, ...excludeRoomIds) as { changes: number };
    return result.changes;
  }

  /**
   * Purge all messages for a specific room (called immediately upon burn)
   */
  public purgeRoomMessages(roomId: string): number {
    const result = this.purgeRoomMessagesStmt.run(roomId) as { changes: number };
    return result.changes;
  }

  /**
   * Save or update a room record
   */
  public saveRoom(room: {
    id: string;
    maxPeers: number;
    authVerifierHash?: string;
    createdAt: number;
    expiresAt: number;
    isBurned?: boolean;
  }): void {
    this.insertRoomStmt.run(
      room.id,
      room.maxPeers,
      room.authVerifierHash ?? null,
      room.createdAt,
      room.expiresAt,
      room.isBurned ? 1 : 0
    );
  }

  /**
   * Get room metadata
   */
  public getRoom(roomId: string): DbRoomRecord | null {
    const row = this.getRoomStmt.get(roomId) as any;
    if (!row) return null;
    return {
      id: row.id,
      maxPeers: row.maxPeers,
      authVerifierHash: row.authVerifierHash,
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
      isBurned: Boolean(row.isBurned),
    };
  }

  /**
   * Mark room burned and wipe its messages immediately
   */
  public burnRoom(roomId: string): void {
    this.purgeRoomMessages(roomId);
    this.burnRoomStmt.run(roomId);
  }

  /**
   * Purge expired rooms from SQLite.
   * Rooms with active users (passed in excludeRoomIds) MUST NOT be purged!
   */
  public purgeExpiredRooms(now: number = Date.now(), excludeRoomIds: string[] = []): number {
    if (excludeRoomIds.length === 0) {
      const result = this.purgeExpiredRoomsStmt.run(now) as { changes: number };
      return result.changes;
    }

    const placeholders = excludeRoomIds.map(() => "?").join(",");
    const query = `
      DELETE FROM rooms
      WHERE (expires_at <= ? OR is_burned = 1)
        AND id NOT IN (${placeholders})
    `;
    const stmt = this.db.prepare(query);
    const result = stmt.run(now, ...excludeRoomIds) as { changes: number };
    return result.changes;
  }

  /**
   * Checkpoint WAL to keep database file size small
   */
  public checkpoint(): void {
    try {
      this.db.exec("PRAGMA wal_checkpoint(TRUNCATE);");
    } catch {
      // ignore
    }
  }

  /**
   * Close database statements and connection
   */
  public close(): void {
    this.db.close();
  }
}

export const chatRepository = new ChatRepository();
