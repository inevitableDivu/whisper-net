/**
 * Domain types and contracts for frontend chat application
 * Follows Interface Segregation Principle (ISP)
 */

export interface UserProfile {
  id: string; // Persistent client-side UUID
  name: string;
  avatarColor: string;
}

export interface EncryptedMessagePayload {
  text: string;
  senderName: string;
  senderUserId?: string; // Persistent client-side UUID for reload matching
  timestamp: number;
}

export interface ChatMessage {
  id: string | number;
  senderId: string;
  senderUserId?: string;
  senderName: string;
  text: string;
  timestamp: number;
  isMe: boolean;
  restored?: boolean;
}

export interface RoomConnectionConfig {
  roomId: string;
  password: string;
  userName: string;
  userId: string;
}

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "burned" | "error";

export interface ChatSessionState {
  roomId: string;
  myPeerId: string;
  peerCount: number;
  status: ConnectionStatus;
  messages: ChatMessage[];
  systemNotice: string | null;
  errorMessage: string | null;
}

export interface ICryptoService {
  deriveKey(password: string, roomId: string): Promise<{
    encryptionKey: CryptoKey;
    authProof: string;
    authVerifierHash: string;
  }>;
  encrypt(key: CryptoKey, payload: EncryptedMessagePayload | string): Promise<{
    iv: string;
    ciphertext: string;
    timestamp: number;
  }>;
  decrypt(key: CryptoKey, iv: string, ciphertext: string): Promise<EncryptedMessagePayload>;
}
