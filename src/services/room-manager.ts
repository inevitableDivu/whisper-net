import { config } from "../config.ts";
import { generateSecureToken, timingSafeEqual, sha256Hex } from "../crypto/server-crypto.ts";
import { chatRepository } from "../db/chat-repository.ts";

export interface PeerInfo {
  readonly peerId: string;
  readonly joinedAt: number;
  lastSeen: number;
}

export interface RoomRecord {
  readonly id: string;
  readonly createdAt: number;
  readonly expiresAt: number;
  readonly maxPeers: number;
  readonly authVerifierHash?: string; // Optional SHA-256 hash of auth proof
  readonly peers: Map<string, PeerInfo>;
  isBurned: boolean;
  emptyTimer?: ReturnType<typeof setTimeout>;
}

export interface CreateRoomOptions {
  customId?: string;
  maxPeers?: number;
  authVerifierHash?: string;
  ttlMs?: number;
}

export type JoinResult =
  | { success: true; room: RoomRecord; peerCount: number; peers: string[] }
  | {
      success: false;
      error: "ROOM_NOT_FOUND" | "ROOM_BURNED" | "ROOM_FULL" | "UNAUTHORIZED" | "ALREADY_JOINED";
    };

export class RoomManager {
  private readonly rooms = new Map<string, RoomRecord>();
  private readonly tombstones = new Map<string, number>(); // roomId -> tombstone expiry
  private readonly peerToRoom = new Map<string, string>(); // peerId -> roomId
  private readonly reaperTimer: ReturnType<typeof setInterval>;

  constructor() {
    this.reaperTimer = setInterval(() => this.reapExpired(), 60_000);
    if (this.reaperTimer.unref) {
      this.reaperTimer.unref();
    }
  }

  /**
   * Create a new ephemeral room with zero-retention guarantee
   */
  public createRoom(options: CreateRoomOptions = {}): RoomRecord {
    const roomId = options.customId || generateSecureToken(24);

    if (this.isTombstoned(roomId)) {
      throw new Error("Room ID was recently burned and cannot be recreated");
    }

    if (this.rooms.has(roomId)) {
      throw new Error("Room ID already exists");
    }

    const maxPeers = Math.min(
      Math.max(options.maxPeers ?? config.security.maxPeersPerRoom, 2),
      20
    );

    const ttlMs = options.ttlMs ?? config.security.roomTtlMs;
    const now = Date.now();

    const room: RoomRecord = {
      id: roomId,
      createdAt: now,
      expiresAt: now + ttlMs,
      maxPeers,
      authVerifierHash: options.authVerifierHash,
      peers: new Map(),
      isBurned: false,
    };

    // Schedule grace timer to delete room if no one joins within grace period
    room.emptyTimer = setTimeout(() => {
      if (room.peers.size === 0) {
        this.destroyRoom(roomId);
      }
    }, config.security.emptyRoomGracePeriodMs);

    if (room.emptyTimer.unref) {
      room.emptyTimer.unref();
    }

    this.rooms.set(roomId, room);

    // Persist room metadata in SQLite
    chatRepository.saveRoom({
      id: room.id,
      maxPeers: room.maxPeers,
      authVerifierHash: room.authVerifierHash,
      createdAt: room.createdAt,
      expiresAt: room.expiresAt,
      isBurned: false,
    });

    return room;
  }

  /**
   * Get an active room by ID (from memory or SQLite)
   */
  public getRoom(roomId: string): RoomRecord | null {
    let room = this.rooms.get(roomId);
    if (!room) {
      // Check SQLite (supports page reload after process reboot)
      const dbRoom = chatRepository.getRoom(roomId);
      if (dbRoom && !dbRoom.isBurned && Date.now() <= dbRoom.expiresAt) {
        room = {
          id: dbRoom.id,
          createdAt: dbRoom.createdAt,
          expiresAt: dbRoom.expiresAt,
          maxPeers: dbRoom.maxPeers,
          authVerifierHash: dbRoom.authVerifierHash ?? undefined,
          peers: new Map(),
          isBurned: false,
        };
        this.rooms.set(roomId, room);
      }
    }

    if (!room) return null;
    if (room.isBurned || Date.now() > room.expiresAt) {
      return null;
    }
    return room;
  }

  /**
   * Return array of room IDs that currently have at least 1 active connected peer
   */
  public getActiveRoomIds(): string[] {
    const activeIds: string[] = [];
    for (const [id, room] of this.rooms.entries()) {
      if (room.peers.size > 0 && !room.isBurned) {
        activeIds.push(id);
      }
    }
    return activeIds;
  }

  /**
   * Check if a room currently has at least 1 active connected peer
   */
  public hasActivePeers(roomId: string): boolean {
    const room = this.rooms.get(roomId);
    return Boolean(room && room.peers.size > 0 && !room.isBurned);
  }

  /**
   * Join an active room with strict zero-knowledge auth check and capacity limits
   */
  public async joinRoom(
    roomId: string,
    peerId: string,
    authProof?: string
  ): Promise<JoinResult> {
    if (this.isTombstoned(roomId)) {
      return { success: false, error: "ROOM_BURNED" };
    }

    const room = this.getRoom(roomId);
    if (!room) {
      return { success: false, error: "ROOM_NOT_FOUND" };
    }

    if (room.isBurned || Date.now() > room.expiresAt) {
      return { success: false, error: "ROOM_BURNED" };
    }

    if (room.peers.has(peerId)) {
      return { success: false, error: "ALREADY_JOINED" };
    }

    if (room.peers.size >= room.maxPeers) {
      return { success: false, error: "ROOM_FULL" };
    }

    // Verify zero-knowledge auth proof if room is password-protected
    if (room.authVerifierHash) {
      if (!authProof) {
        return { success: false, error: "UNAUTHORIZED" };
      }
      const candidateHash = await sha256Hex(authProof);
      if (!timingSafeEqual(candidateHash, room.authVerifierHash)) {
        return { success: false, error: "UNAUTHORIZED" };
      }
    }

    // Cancel empty-room destruction if someone joins
    if (room.emptyTimer) {
      clearTimeout(room.emptyTimer);
      room.emptyTimer = undefined;
    }

    const now = Date.now();
    room.peers.set(peerId, {
      peerId,
      joinedAt: now,
      lastSeen: now,
    });
    this.peerToRoom.set(peerId, roomId);

    const peers = Array.from(room.peers.keys());
    return {
      success: true,
      room,
      peerCount: room.peers.size,
      peers,
    };
  }

  /**
   * Leave a room and trigger grace destruction only if the room becomes completely empty
   */
  public leaveRoom(roomId: string, peerId: string): { remainingPeers: number; roomDestroyed: boolean } {
    this.peerToRoom.delete(peerId);
    const room = this.rooms.get(roomId);
    if (!room) {
      return { remainingPeers: 0, roomDestroyed: true };
    }

    room.peers.delete(peerId);

    // If there are still active peers in the room, DO NOT DESTROY
    if (room.peers.size > 0) {
      return { remainingPeers: room.peers.size, roomDestroyed: false };
    }

    // Room is now empty (0 peers): start grace countdown to destroy
    if (room.emptyTimer) clearTimeout(room.emptyTimer);
    room.emptyTimer = setTimeout(() => {
      if (room.peers.size === 0) {
        this.destroyRoom(roomId);
      }
    }, config.security.emptyRoomGracePeriodMs);

    if (room.emptyTimer.unref) {
      room.emptyTimer.unref();
    }
    return { remainingPeers: 0, roomDestroyed: false };
  }

  /**
   * Burn a room permanently:
   * Evicts all peers, marks as burned, sets tombstone, zeroes references,
   * and immediately purges all encrypted messages from SQLite.
   */
  public burnRoom(roomId: string): { evictedPeerIds: string[] } {
    const room = this.rooms.get(roomId);
    const evictedPeerIds: string[] = [];

    if (room) {
      room.isBurned = true;
      if (room.emptyTimer) clearTimeout(room.emptyTimer);

      for (const peerId of room.peers.keys()) {
        evictedPeerIds.push(peerId);
        this.peerToRoom.delete(peerId);
      }
      room.peers.clear();
      this.rooms.delete(roomId);
    }

    // Immediately purge all encrypted messages and mark room burned in SQLite
    chatRepository.burnRoom(roomId);

    // Set tombstone to prevent re-creation for config.security.burnTombstoneMs
    this.tombstones.set(roomId, Date.now() + config.security.burnTombstoneMs);

    return { evictedPeerIds };
  }

  /**
   * Check if a room ID is tombstoned
   */
  public isTombstoned(roomId: string): boolean {
    const expiry = this.tombstones.get(roomId);
    if (expiry) {
      if (Date.now() > expiry) {
        this.tombstones.delete(roomId);
      } else {
        return true;
      }
    }

    // Check SQLite persistence for burned status
    const dbRoom = chatRepository.getRoom(roomId);
    if (dbRoom && dbRoom.isBurned) {
      return true;
    }

    return false;
  }

  /**
   * Get the roomId for a given peer
   */
  public getRoomForPeer(peerId: string): string | null {
    return this.peerToRoom.get(peerId) ?? null;
  }

  /**
   * Update peer activity timestamp
   */
  public touchPeer(peerId: string): void {
    const roomId = this.peerToRoom.get(peerId);
    if (!roomId) return;
    const room = this.rooms.get(roomId);
    if (!room) return;
    const peer = room.peers.get(peerId);
    if (peer) {
      peer.lastSeen = Date.now();
    }
  }

  /**
   * Clean up inactive/expired rooms and stale tombstones.
   * CRITICAL REQUIREMENT: A room with at least 1 active user MUST NOT be purged!
   */
  private reapExpired(): void {
    const now = Date.now();

    for (const [roomId, room] of this.rooms.entries()) {
      // If room has at least 1 active user connected, DO NOT PURGE!
      if (room.peers.size > 0 && !room.isBurned) {
        continue;
      }

      if (now > room.expiresAt || room.isBurned) {
        this.burnRoom(roomId);
      }
    }

    for (const [roomId, tombstoneExpiry] of this.tombstones.entries()) {
      if (now > tombstoneExpiry) {
        this.tombstones.delete(roomId);
      }
    }
  }

  /**
   * Immediately eradicate room from memory
   */
  public destroyRoom(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (room) {
      // Safety check: Never destroy if at least 1 active user is connected
      if (room.peers.size > 0 && !room.isBurned) {
        return;
      }
      if (room.emptyTimer) clearTimeout(room.emptyTimer);
      for (const peerId of room.peers.keys()) {
        this.peerToRoom.delete(peerId);
      }
      room.peers.clear();
      this.rooms.delete(roomId);
    }
  }

  /**
   * Get server stats (blinded, zero PII)
   */
  public getStats(): { activeRooms: number; activePeers: number; tombstonedRooms: number } {
    let totalPeers = 0;
    for (const room of this.rooms.values()) {
      totalPeers += room.peers.size;
    }
    return {
      activeRooms: this.rooms.size,
      activePeers: totalPeers,
      tombstonedRooms: this.tombstones.size,
    };
  }

  /**
   * Destroy service and cancel all background timers
   */
  public destroy(): void {
    clearInterval(this.reaperTimer);
    for (const room of this.rooms.values()) {
      if (room.emptyTimer) clearTimeout(room.emptyTimer);
      room.peers.clear();
    }
    this.rooms.clear();
    this.peerToRoom.clear();
    this.tombstones.clear();
  }
}

// Global shared room manager instance
export const roomManager = new RoomManager();
