import {
  deriveRoomKeyFromPassword,
  encryptZeroKnowledge,
  decryptZeroKnowledge,
} from "../../crypto/client-crypto.ts";
import type { ICryptoService, EncryptedMessagePayload } from "../types/chat.ts";

/**
 * Concrete implementation of ICryptoService using WebCrypto Subtle
 * Follows Single Responsibility Principle (SRP)
 */
export class WebCryptoChatService implements ICryptoService {
  async deriveKey(password: string, roomId: string) {
    return await deriveRoomKeyFromPassword(password, roomId);
  }

  async encrypt(key: CryptoKey, payload: EncryptedMessagePayload | string) {
    const serialized = typeof payload === "string" ? payload : JSON.stringify(payload);
    return await encryptZeroKnowledge(key, serialized);
  }

  async decrypt(key: CryptoKey, iv: string, ciphertext: string): Promise<EncryptedMessagePayload> {
    const raw = await decryptZeroKnowledge(key, iv, ciphertext);
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed === "object" && parsed !== null && "text" in parsed) {
        return {
          text: String(parsed.text),
          senderName: parsed.senderName ? String(parsed.senderName) : "Peer",
          senderUserId: parsed.senderUserId ? String(parsed.senderUserId) : undefined,
          timestamp: typeof parsed.timestamp === "number" ? parsed.timestamp : Date.now(),
        };
      }
    } catch {
      // Fallback for raw plaintext string format (e.g. from backend tests/demo)
    }

    return {
      text: raw,
      senderName: "Peer",
      timestamp: Date.now(),
    };
  }
}

export const cryptoService: ICryptoService = new WebCryptoChatService();
