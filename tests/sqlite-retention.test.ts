import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { ChatRepository } from "../src/db/chat-repository.ts";
import { RoomManager } from "../src/services/room-manager.ts";
import { CleanupCronService } from "../src/services/cleanup-cron.ts";
import {
  deriveRoomKeyFromPassword,
  encryptZeroKnowledge,
  decryptZeroKnowledge,
} from "../src/crypto/client-crypto.ts";

describe("SQLite Storage, Accidental Reload Recovery, and Active User Protection", () => {
  let db: Database;
  let repo: ChatRepository;
  let roomManager: RoomManager;
  let cron: CleanupCronService;

  beforeEach(() => {
    // In-memory test database
    db = new Database(":memory:");
    db.exec(`
      CREATE TABLE IF NOT EXISTS rooms (
        id TEXT PRIMARY KEY,
        max_peers INTEGER NOT NULL,
        auth_verifier_hash TEXT,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        is_burned INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS encrypted_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        room_id TEXT NOT NULL,
        sender_id TEXT NOT NULL,
        iv TEXT NOT NULL,
        ciphertext TEXT NOT NULL,
        sequence INTEGER,
        client_timestamp INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      );
    `);

    repo = new ChatRepository(db);
    roomManager = new RoomManager();
    cron = new CleanupCronService(repo, roomManager);
  });

  afterEach(() => {
    cron.stop();
    roomManager.destroy();
    repo.close();
  });

  it("should store encrypted messages and restore them for an accidental page reload", async () => {
    const roomId = "test-room-reload-recovery";
    const password = "my-shared-room-password";

    // Client derives room key locally using WebCrypto subtle
    const clientKeys = await deriveRoomKeyFromPassword(password, roomId);

    // Save room in database
    repo.saveRoom({
      id: roomId,
      maxPeers: 2,
      authVerifierHash: clientKeys.authVerifierHash,
      createdAt: Date.now(),
      expiresAt: Date.now() + 3600000,
    });

    // Client encrypts 3 messages
    const msgs = ["Message 1", "Message 2", "Message 3"];
    for (let i = 0; i < msgs.length; i++) {
      const packet = await encryptZeroKnowledge(clientKeys.encryptionKey, msgs[i]!);
      repo.saveMessage({
        roomId,
        senderId: "peer_alice",
        iv: packet.iv,
        ciphertext: packet.ciphertext,
        sequence: i + 1,
        clientTimestamp: packet.timestamp,
        expiresAt: Date.now() + 3600000,
      });
    }

    // SIMULATE RELOAD: Client fetches history
    const history = repo.getRoomHistory(roomId);
    expect(history.length).toBe(3);

    // Client decrypts the retrieved history locally
    for (let i = 0; i < history.length; i++) {
      const decrypted = await decryptZeroKnowledge(
        clientKeys.encryptionKey,
        history[i]!.iv,
        history[i]!.ciphertext
      );
      expect(decrypted).toBe(msgs[i]!);
    }
  });

  it("MUST NOT purge rooms or messages that have at least 1 active user", async () => {
    const roomId = "active-room-must-stay";
    const now = Date.now();

    // Create room and add an active peer
    const room = roomManager.createRoom({ customId: roomId });
    await roomManager.joinRoom(room.id, "active_user_1");
    expect(roomManager.hasActivePeers(roomId)).toBe(true);

    // Save room in SQLite with an expired timestamp (in the past)
    repo.saveRoom({
      id: roomId,
      maxPeers: 2,
      createdAt: now - 100000,
      expiresAt: now - 50000, // expired!
    });

    // Save an expired message in SQLite for this active room
    repo.saveMessage({
      roomId,
      senderId: "active_user_1",
      iv: "MTIzNDU2Nzg5MDEy",
      ciphertext: "ZXhwaXJlZCBtZXNzYWdlIGNpcGhlcnRleHQ=",
      clientTimestamp: now - 100000,
      expiresAt: now - 50000, // expired!
    });

    // Run cleanup cron
    const result = cron.runCleanup();
    expect(result.activeRoomsProtected).toBe(1);
    expect(result.purgedRooms).toBe(0);
    expect(result.purgedMessages).toBe(0);

    // Verify room and message still exist in SQLite!
    expect(repo.getRoom(roomId)).not.toBeNull();
    expect(repo.getRoomHistory(roomId).length).toBe(1);
  });

  it("should purge expired rooms and messages when NO active users remain", () => {
    const emptyRoomId = "empty-expired-room";
    const now = Date.now();

    // No active users connected
    expect(roomManager.hasActivePeers(emptyRoomId)).toBe(false);

    // Save expired room in SQLite
    repo.saveRoom({
      id: emptyRoomId,
      maxPeers: 2,
      createdAt: now - 100000,
      expiresAt: now - 50000, // expired!
    });

    // Save expired message in SQLite
    repo.saveMessage({
      roomId: emptyRoomId,
      senderId: "past_user",
      iv: "MTIzNDU2Nzg5MDEy",
      ciphertext: "ZXhwaXJlZCBtZXNzYWdlIGNpcGhlcnRleHQ=",
      clientTimestamp: now - 100000,
      expiresAt: now - 50000, // expired!
    });

    // Run cleanup cron
    const result = cron.runCleanup();
    expect(result.activeRoomsProtected).toBe(0);
    expect(result.purgedRooms).toBe(1);
    expect(result.purgedMessages).toBe(1);

    // Verify room and message are gone
    expect(repo.getRoom(emptyRoomId)).toBeNull();
    expect(repo.getRoomHistory(emptyRoomId).length).toBe(0);
  });

  it("should wipe all messages immediately upon burn", () => {
    const roomId = "room-to-burn";
    repo.saveRoom({
      id: roomId,
      maxPeers: 2,
      createdAt: Date.now(),
      expiresAt: Date.now() + 100000,
    });

    repo.saveMessage({
      roomId,
      senderId: "user",
      iv: "MTIzNDU2Nzg5MDEy",
      ciphertext: "c2VjcmV0IGNpcGhlcnRleHQ=",
      clientTimestamp: Date.now(),
      expiresAt: Date.now() + 100000,
    });

    expect(repo.getRoomHistory(roomId).length).toBe(1);

    // Burn room
    repo.burnRoom(roomId);

    // Messages must be zero immediately
    expect(repo.getRoomHistory(roomId).length).toBe(0);
    const dbRoom = repo.getRoom(roomId);
    expect(dbRoom?.isBurned).toBe(true);
  });
});
