import { describe, it, expect } from "bun:test";
import {
  deriveRoomKeyFromPassword,
  encryptZeroKnowledge,
  decryptZeroKnowledge,
  buildRoomInviteLink,
  parseRoomInviteHash,
  generateAesKey,
} from "../src/crypto/client-crypto.ts";
import {
  generateSecureToken,
  generatePeerId,
  timingSafeEqual,
  sha256Hex,
  validateTimestamp,
} from "../src/crypto/server-crypto.ts";

describe("Client-Side Password-Based Zero-Knowledge Cryptography (window.crypto.subtle)", () => {
  it("should derive matching encryption keys and auth proofs from the same room password", async () => {
    const password = "my-secret-shared-password-123!";
    const roomId = "test-room-crypto-verification";

    // Alice derives keys on her device using window.crypto.subtle
    const alice = await deriveRoomKeyFromPassword(password, roomId);

    // Bob derives keys on his device with the shared password
    const bob = await deriveRoomKeyFromPassword(password, roomId);

    // Both authProof and authVerifierHash must match deterministically
    expect(alice.authProof).toBe(bob.authProof);
    expect(alice.authVerifierHash).toBe(bob.authVerifierHash);

    // Alice encrypts message with her derived key
    const secretMessage = "Confidential chat encrypted with password-derived key 🔒";
    const packet = await encryptZeroKnowledge(alice.encryptionKey, secretMessage);

    // Bob decrypts with his derived key
    const decrypted = await decryptZeroKnowledge(bob.encryptionKey, packet.iv, packet.ciphertext);
    expect(decrypted).toBe(secretMessage);
  });

  it("should fail to decrypt if an incorrect password was used", async () => {
    const roomId = "test-room-wrong-password";
    const correctKeys = await deriveRoomKeyFromPassword("correct-password", roomId);
    const wrongKeys = await deriveRoomKeyFromPassword("wrong-password", roomId);

    const packet = await encryptZeroKnowledge(correctKeys.encryptionKey, "Secret text");

    expect(
      decryptZeroKnowledge(wrongKeys.encryptionKey, packet.iv, packet.ciphertext)
    ).rejects.toThrow();
  });

  it("should reject tampered ciphertext with an AEAD authentication tag failure", async () => {
    const keys = await deriveRoomKeyFromPassword("pass", "room-tamper-check");
    const packet = await encryptZeroKnowledge(keys.encryptionKey, "Original uncorrupted message");

    // Corrupt ciphertext
    const rawCiphertext = Buffer.from(packet.ciphertext, "base64");
    rawCiphertext[0] = (rawCiphertext[0] ?? 0) ^ 0xff;
    const tampered = rawCiphertext.toString("base64");

    expect(
      decryptZeroKnowledge(keys.encryptionKey, packet.iv, tampered)
    ).rejects.toThrow();
  });

  it("should build and parse secure invite links via URL fragments", () => {
    const baseUrl = "https://app.securechat.com";
    const roomId = "room-abc-123";
    const password = "SuperSecretPassword";

    const link = buildRoomInviteLink(baseUrl, roomId, password);
    expect(link).toBe("https://app.securechat.com/#room=room-abc-123&pwd=SuperSecretPassword");

    const parsed = parseRoomInviteHash(link);
    expect(parsed.roomId).toBe(roomId);
    expect(parsed.password).toBe(password);
  });
});

describe("Server-Side Cryptography & Security Helpers", () => {
  it("should generate high-entropy secure tokens and peer IDs", () => {
    const token1 = generateSecureToken(24);
    const token2 = generateSecureToken(24);
    expect(token1).not.toBe(token2);
    expect(token1.length).toBeGreaterThanOrEqual(24);

    const peerId = generatePeerId();
    expect(peerId.startsWith("peer_")).toBe(true);
  });

  it("should safely compare strings in constant time", () => {
    expect(timingSafeEqual("identical-string", "identical-string")).toBe(true);
    expect(timingSafeEqual("identical-string", "different-string")).toBe(false);
    expect(timingSafeEqual("short", "longer-string")).toBe(false);
  });

  it("should correctly compute SHA-256 hex hashes", async () => {
    const hash = await sha256Hex("hello-secure-chat");
    expect(hash.length).toBe(64);
  });

  it("should validate timestamps against maximum drift limits", () => {
    const now = Date.now();
    expect(validateTimestamp(now, 30_000)).toBe(true);
    expect(validateTimestamp(now - 10_000, 30_000)).toBe(true);
    expect(validateTimestamp(now - 35_000, 30_000)).toBe(false);
    expect(validateTimestamp(now + 35_000, 30_000)).toBe(false);
  });
});
