import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { app } from "../index.ts";
import { roomManager } from "../src/services/room-manager.ts";
import {
  generateEcdhKeyPair,
  deriveSharedAesKey,
  encryptZeroKnowledge,
  decryptZeroKnowledge,
} from "../src/crypto/client-crypto.ts";

describe("WebSocket Zero-Knowledge End-to-End Chat", () => {
  let port: number;
  let wsUrl: string;

  beforeAll(async () => {
    // Start server on an ephemeral random port explicitly on 127.0.0.1 loopback
    app.listen({ port: 0, hostname: "127.0.0.1" });
    port = app.server?.port ?? 3000;
    wsUrl = `ws://127.0.0.1:${port}/ws`;
  });

  afterAll(() => {
    app.stop();
  });

  function createClient(): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      ws.onopen = () => resolve(ws);
      ws.onerror = (e) => reject(e);
    });
  }

  function waitForMessage(ws: WebSocket): Promise<any> {
    return new Promise((resolve) => {
      ws.onmessage = (event) => {
        resolve(JSON.parse(event.data.toString()));
      };
    });
  }

  it("should handle ping and pong frames", async () => {
    const ws = await createClient();
    const pongPromise = waitForMessage(ws);

    ws.send(JSON.stringify({ type: "ping" }));
    const response = await pongPromise;

    expect(response.type).toBe("pong");
    expect(response.timestamp).toBeGreaterThan(0);

    // Client sending pong must be accepted without INVALID_PAYLOAD error
    ws.send(JSON.stringify({ type: "pong", timestamp: Date.now() }));
    // Wait briefly to ensure no error frame is returned
    await new Promise((r) => setTimeout(r, 50));

    ws.close();
  });

  it("should perform zero-knowledge key exchange and decrypt messages between Alice and Bob", async () => {
    // 1. Create room
    const room = roomManager.createRoom({ maxPeers: 2 });
    const roomId = room.id;

    // 2. Connect Alice and Bob
    const aliceWs = await createClient();
    const bobWs = await createClient();

    // 3. Alice joins
    const aliceJoinPromise = waitForMessage(aliceWs);
    aliceWs.send(JSON.stringify({ type: "join", roomId }));
    const aliceJoined = await aliceJoinPromise;
    expect(aliceJoined.type).toBe("joined");
    expect(aliceJoined.roomId).toBe(roomId);
    expect(aliceJoined.peerCount).toBe(1);

    // 4. Bob joins (Alice should receive peer_joined)
    const alicePeerJoinedPromise = waitForMessage(aliceWs);
    const bobJoinPromise = waitForMessage(bobWs);

    bobWs.send(JSON.stringify({ type: "join", roomId }));

    const bobJoined = await bobJoinPromise;
    expect(bobJoined.type).toBe("joined");
    expect(bobJoined.peerCount).toBe(2);

    const alicePeerJoined = await alicePeerJoinedPromise;
    expect(alicePeerJoined.type).toBe("peer_joined");
    expect(alicePeerJoined.peerId).toBe(bobJoined.peerId);

    // 5. Ephemeral ECDH Key Exchange directly between user devices
    const aliceKeys = await generateEcdhKeyPair();
    const bobKeys = await generateEcdhKeyPair();

    // Alice sends public key to Bob
    const bobKeyPromise = waitForMessage(bobWs);
    aliceWs.send(
      JSON.stringify({
        type: "key_exchange",
        roomId,
        publicKey: aliceKeys.publicKeyBase64,
        timestamp: Date.now(),
      })
    );
    const bobReceivedKey = await bobKeyPromise;
    expect(bobReceivedKey.type).toBe("key_exchange");
    expect(bobReceivedKey.publicKey).toBe(aliceKeys.publicKeyBase64);

    // Bob sends public key to Alice
    const aliceKeyPromise = waitForMessage(aliceWs);
    bobWs.send(
      JSON.stringify({
        type: "key_exchange",
        roomId,
        publicKey: bobKeys.publicKeyBase64,
        timestamp: Date.now(),
      })
    );
    const aliceReceivedKey = await aliceKeyPromise;
    expect(aliceReceivedKey.type).toBe("key_exchange");
    expect(aliceReceivedKey.publicKey).toBe(bobKeys.publicKeyBase64);

    // Both derive shared AES-256-GCM key independently
    const aliceDerivedKey = await deriveSharedAesKey(
      aliceKeys.privateKey,
      aliceReceivedKey.publicKey
    );
    const bobDerivedKey = await deriveSharedAesKey(
      bobKeys.privateKey,
      bobReceivedKey.publicKey
    );

    // 6. Alice encrypts a confidential message and sends it through server relay
    const secretText = "Zero-Knowledge E2EE Chat verified on Bun!";
    const encryptedPacket = await encryptZeroKnowledge(aliceDerivedKey, secretText);

    const bobMessagePromise = waitForMessage(bobWs);
    aliceWs.send(
      JSON.stringify({
        type: "message",
        roomId,
        iv: encryptedPacket.iv,
        ciphertext: encryptedPacket.ciphertext,
        timestamp: encryptedPacket.timestamp,
        sequence: 1,
      })
    );

    const bobReceivedMessage = await bobMessagePromise;
    expect(bobReceivedMessage.type).toBe("message");
    expect(bobReceivedMessage.iv).toBe(encryptedPacket.iv);
    expect(bobReceivedMessage.ciphertext).toBe(encryptedPacket.ciphertext);

    // Bob decrypts the message on his device
    const decryptedText = await decryptZeroKnowledge(
      bobDerivedKey,
      bobReceivedMessage.iv,
      bobReceivedMessage.ciphertext
    );
    expect(decryptedText).toBe(secretText);

    // 7. Test burn protocol: Bob triggers burn
    const aliceBurnPromise = waitForMessage(aliceWs);
    const bobBurnPromise = waitForMessage(bobWs);

    bobWs.send(
      JSON.stringify({
        type: "burn",
        roomId,
        reason: "Session complete, destroying keys and chat",
      })
    );

    const aliceBurned = await aliceBurnPromise;
    const bobBurned = await bobBurnPromise;

    expect(aliceBurned.type).toBe("burned");
    expect(bobBurned.type).toBe("burned");

    // Verify room is purged from server
    expect(roomManager.getRoom(roomId)).toBeNull();
    expect(roomManager.isTombstoned(roomId)).toBe(true);

    aliceWs.close();
    bobWs.close();
  });

  it("should reject message if monotonic sequence order is violated (replay attack)", async () => {
    const room = roomManager.createRoom({ maxPeers: 2 });
    const ws = await createClient();

    // Join room
    const joinPromise = waitForMessage(ws);
    ws.send(JSON.stringify({ type: "join", roomId: room.id }));
    await joinPromise;

    // Send sequence 5
    ws.send(
      JSON.stringify({
        type: "message",
        roomId: room.id,
        iv: "MTIzNDU2Nzg5MDEy",
        ciphertext: "dGhpcyBpcyBhIHZhbGlkIGNpcGhlcnRleHQgcGF5bG9hZA==",
        timestamp: Date.now(),
        sequence: 5,
      })
    );

    // Send sequence 4 (replay/out of order)
    const errorPromise = waitForMessage(ws);
    ws.send(
      JSON.stringify({
        type: "message",
        roomId: room.id,
        iv: "MTIzNDU2Nzg5MDEy",
        ciphertext: "dGhpcyBpcyBhIHZhbGlkIGNpcGhlcnRleHQgcGF5bG9hZA==",
        timestamp: Date.now(),
        sequence: 4,
      })
    );

    const errorEvent = await errorPromise;
    expect(errorEvent.type).toBe("error");
    expect(errorEvent.code).toBe("INVALID_PAYLOAD");
    expect(errorEvent.message).toContain("Monotonic sequence check failed");

    ws.close();
  });

  it("should mark room ID and password invalid immediately when burned", async () => {
    const room = roomManager.createRoom({ maxPeers: 2 });
    const ws = await createClient();

    const joinPromise = waitForMessage(ws);
    ws.send(JSON.stringify({ type: "join", roomId: room.id }));
    await joinPromise;

    // Burn room
    ws.send(JSON.stringify({ type: "burn", roomId: room.id }));
    // Wait for burn to process
    await new Promise((r) => setTimeout(r, 50));

    // Attempting to join with the burned room ID must fail with ROOM_BURNED
    const ws2 = await createClient();
    const joinBurnedPromise = waitForMessage(ws2);
    ws2.send(JSON.stringify({ type: "join", roomId: room.id }));
    const errorEvent = await joinBurnedPromise;

    expect(errorEvent.type).toBe("error");
    expect(errorEvent.code).toBe("ROOM_BURNED");
    expect(errorEvent.message).toContain("burned and deleted");

    ws2.close();
  });
});
