import { Database } from "bun:sqlite";
import { dirname } from "path";
import { mkdirSync } from "fs";
import { config } from "../config.ts";

/**
 * Initialize and optimize the SQLite database for high-concurrency zero-knowledge storage.
 */
export function initDatabase(dbPath: string = config.db.path): Database {
  if (dbPath !== ":memory:") {
    const dir = dirname(dbPath);
    try {
      mkdirSync(dir, { recursive: true });
    } catch {
      // directory exists or permission error
    }
  }

  const db = new Database(dbPath, { create: true });

  // Performance and durability pragmas
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA synchronous = NORMAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA temp_store = MEMORY;");

  // Schema creation
  db.exec(`
    CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY,
      max_peers INTEGER NOT NULL,
      auth_verifier_hash TEXT,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      is_burned INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_rooms_expires
      ON rooms (expires_at ASC);

    CREATE TABLE IF NOT EXISTS encrypted_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id TEXT NOT NULL,
      sender_id TEXT NOT NULL,
      iv TEXT NOT NULL,
      ciphertext TEXT NOT NULL,
      sequence INTEGER,
      client_timestamp INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_messages_room_order
      ON encrypted_messages (room_id, created_at ASC);

    CREATE INDEX IF NOT EXISTS idx_messages_expires
      ON encrypted_messages (expires_at ASC);
  `);

  return db;
}

export const db = initDatabase();
