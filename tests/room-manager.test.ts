import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { RoomManager } from "../src/services/room-manager.ts";
import { sha256Hex } from "../src/crypto/server-crypto.ts";

describe("RoomManager (Zero-Retention Ephemeral Storage)", () => {
  let manager: RoomManager;

  beforeEach(() => {
    manager = new RoomManager();
  });

  afterEach(() => {
    manager.destroy();
  });

  it("should create a room with secure ID and default limits", () => {
    const room = manager.createRoom({ maxPeers: 4 });
    expect(room.id).toBeDefined();
    expect(room.id.length).toBeGreaterThanOrEqual(16);
    expect(room.maxPeers).toBe(4);
    expect(room.peers.size).toBe(0);
    expect(room.isBurned).toBe(false);
  });

  it("should allow peers to join and enforce max peer limit", async () => {
    const room = manager.createRoom({ maxPeers: 2 });

    const join1 = await manager.joinRoom(room.id, "peer_1");
    expect(join1.success).toBe(true);
    if (join1.success) {
      expect(join1.peerCount).toBe(1);
    }

    const join2 = await manager.joinRoom(room.id, "peer_2");
    expect(join2.success).toBe(true);
    if (join2.success) {
      expect(join2.peerCount).toBe(2);
    }

    // Third peer exceeds capacity
    const join3 = await manager.joinRoom(room.id, "peer_3");
    expect(join3.success).toBe(false);
    if (!join3.success) {
      expect(join3.error).toBe("ROOM_FULL");
    }
  });

  it("should enforce zero-knowledge authentication proofs for protected rooms", async () => {
    const secretAuthProof = "client-derived-zero-knowledge-verifier-123456";
    const authVerifierHash = await sha256Hex(secretAuthProof);

    const room = manager.createRoom({
      maxPeers: 2,
      authVerifierHash,
    });

    // Attempt join without proof
    const joinNoProof = await manager.joinRoom(room.id, "peer_bad");
    expect(joinNoProof.success).toBe(false);
    if (!joinNoProof.success) {
      expect(joinNoProof.error).toBe("UNAUTHORIZED");
    }

    // Attempt join with wrong proof
    const joinWrongProof = await manager.joinRoom(room.id, "peer_bad", "wrong-proof");
    expect(joinWrongProof.success).toBe(false);
    if (!joinWrongProof.success) {
      expect(joinWrongProof.error).toBe("UNAUTHORIZED");
    }

    // Attempt join with correct proof
    const joinCorrect = await manager.joinRoom(room.id, "peer_good", secretAuthProof);
    expect(joinCorrect.success).toBe(true);
  });

  it("should burn a room immediately and reject future joins", async () => {
    const room = manager.createRoom({ maxPeers: 2 });
    await manager.joinRoom(room.id, "peer_1");
    await manager.joinRoom(room.id, "peer_2");

    // Burn room
    const { evictedPeerIds } = manager.burnRoom(room.id);
    expect(evictedPeerIds).toContain("peer_1");
    expect(evictedPeerIds).toContain("peer_2");

    // Room should no longer be retrievable
    expect(manager.getRoom(room.id)).toBeNull();
    expect(manager.isTombstoned(room.id)).toBe(true);

    // Attempting to join burned room fails
    const joinBurned = await manager.joinRoom(room.id, "peer_3");
    expect(joinBurned.success).toBe(false);
    if (!joinBurned.success) {
      expect(joinBurned.error).toBe("ROOM_BURNED");
    }

    // Attempting to recreate tombstoned room fails
    expect(() => manager.createRoom({ customId: room.id })).toThrow();
  });

  it("should track peer activity and update lastSeen", async () => {
    const room = manager.createRoom({ maxPeers: 2 });
    await manager.joinRoom(room.id, "peer_active");

    const peerBefore = room.peers.get("peer_active");
    expect(peerBefore).toBeDefined();
    const initialLastSeen = peerBefore!.lastSeen;

    await new Promise((r) => setTimeout(r, 10));
    manager.touchPeer("peer_active");

    const peerAfter = room.peers.get("peer_active");
    expect(peerAfter!.lastSeen).toBeGreaterThan(initialLastSeen);
  });
});
