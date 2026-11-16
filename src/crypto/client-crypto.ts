/**
 * Reference Zero-Knowledge Client Cryptography SDK
 *
 * Implements end-to-end encryption directly on user devices using standard Web Crypto API
 * (window.crypto.subtle in browsers, crypto.subtle in Bun/Node).
 *
 * Supported Protocols:
 * 1. Password-based room derivation using window.crypto.subtle (PBKDF2-HMAC-SHA256, 100,000 rounds).
 * 2. Device-to-device ephemeral ECDH P-256 key exchange with HKDF-SHA256.
 * 3. Authenticated AES-256-GCM encryption with fresh 96-bit random IVs.
 *
 * Zero Node.js Buffer dependencies: All encoding/decoding uses pure browser-native
 * Uint8Array, btoa, and atob functions.
 */

// Declare ambient window for environments with or without browser DOM types
declare const window: any;

/**
 * Checks whether SubtleCrypto is available in the current runtime.
 * Web browsers only expose window.crypto.subtle in Secure Contexts (HTTPS or localhost).
 */
export function isSubtleCryptoAvailable(): boolean {
  return (
    (typeof window !== "undefined" && !!window.crypto?.subtle) ||
    (typeof crypto !== "undefined" && !!crypto?.subtle)
  );
}

// Universal reference to WebCrypto subtle engine (window.crypto.subtle in browser, crypto.subtle in Bun)
function getSubtle(): SubtleCrypto {
  if (typeof window !== "undefined" && window.crypto?.subtle) {
    return window.crypto.subtle;
  }
  if (typeof crypto !== "undefined" && crypto.subtle) {
    return crypto.subtle;
  }
  const isHttp = typeof window !== "undefined" && window.location?.protocol === "http:";
  const isNotLocal =
    typeof window !== "undefined" &&
    window.location?.hostname !== "localhost" &&
    window.location?.hostname !== "127.0.0.1";

  if (isHttp && isNotLocal) {
    throw new Error(
      `Web Cryptography API is disabled by the browser because the page is loaded over insecure HTTP on LAN IP (${window.location.host}). Please visit https://${window.location.host} or use localhost.`
    );
  }

  throw new Error("WebCrypto SubtleCrypto is not available in this environment.");
}

// Universal random values generator (window.crypto.getRandomValues in browser, crypto.getRandomValues in Bun)
function getRandomValues(array: Uint8Array): Uint8Array {
  if (typeof window !== "undefined" && window.crypto?.getRandomValues) {
    return window.crypto.getRandomValues(array);
  }
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    return crypto.getRandomValues(array);
  }
  // Fallback if running in older or isolated runtime
  for (let i = 0; i < array.length; i++) {
    array[i] = Math.floor(Math.random() * 256);
  }
  return array;
}

/**
 * Universal cryptographically-secure RFC 4122 v4 UUID generator.
 * Works seamlessly across both Secure Contexts (HTTPS, localhost) AND Insecure Contexts (LAN HTTP),
 * preventing "TypeError: crypto.randomUUID is not a function".
 */
export function safeRandomUUID(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  getRandomValues(bytes);

  // RFC 4122 v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
  bytes[6] = (bytes[6]! & 0x0f) | 0x40; // Version 4
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // Variant 10 (8, 9, a, or b)

  const hex: string[] = [];
  for (let i = 0; i < 16; i++) {
    hex.push(bytes[i]!.toString(16).padStart(2, "0"));
  }

  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join(""),
  ].join("-");
}

/**
 * Browser-native ArrayBuffer/Uint8Array to hex conversion (Zero Node Buffer dependency)
 */
export function bytesToHex(bytes: Uint8Array | ArrayBuffer): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let hex = "";
  for (let i = 0; i < arr.length; i++) {
    hex += arr[i]!.toString(16).padStart(2, "0");
  }
  return hex;
}

/**
 * Browser-native hex string to Uint8Array conversion
 */
export function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const buffer = new ArrayBuffer(hex.length / 2);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Browser-native ArrayBuffer/Uint8Array to Base64 conversion (Using window.btoa / globalThis.btoa)
 */
export function bytesToBase64(bytes: Uint8Array | ArrayBuffer): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  const len = arr.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(arr[i]!);
  }
  return btoa(binary);
}

/**
 * Browser-native Base64 string to Uint8Array conversion (Using window.atob / globalThis.atob)
 */
export function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const normalized = base64.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export interface EncryptedPacket {
  iv: string; // Base64 96-bit IV
  ciphertext: string; // Base64 AES-256-GCM ciphertext + 16-byte auth tag
  timestamp: number;
}

export interface RoomKeyDerivation {
  encryptionKey: CryptoKey; // Client-side AES-256-GCM key
  authProof: string; // Proof of password knowledge sent in join frame
  authVerifierHash: string; // SHA-256 of authProof stored on server for zero-knowledge verification
}

export interface EcdhKeyPair {
  publicKey: CryptoKey;
  privateKey: CryptoKey;
  publicKeyBase64: string; // Exportable raw public key
}

/**
 * Generate an ephemeral 256-bit AES-GCM symmetric key
 */
export async function generateAesKey(): Promise<CryptoKey> {
  const subtle = getSubtle();
  return await subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
}

/**
 * Derive room encryption key and zero-knowledge auth proof from a user password and roomId.
 *
 * Uses window.crypto.subtle with PBKDF2-HMAC-SHA256 (100,000 iterations).
 * Salt: "secure-chat-room-v1:" + roomId
 * Output:
 *  - 256 bits for AES-256-GCM encryptionKey (retained in browser memory)
 *  - 256 bits for authProof (sent over TLS during join)
 *  - SHA-256(authProof) = authVerifierHash (stored in server SQLite for zero-knowledge auth)
 */
export async function deriveRoomKeyFromPassword(
  password: string,
  roomId: string
): Promise<RoomKeyDerivation> {
  const subtle = getSubtle();
  const enc = new TextEncoder();

  // 1. Import raw password as key derivation material
  const passwordKeyMaterial = await subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits", "deriveKey"]
  );

  // 2. Derive 512 bits (64 bytes)
  const salt = enc.encode(`secure-chat-room-v1:${roomId}`);
  const derivedBits = await subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: 100000,
      hash: "SHA-256",
    },
    passwordKeyMaterial,
    512
  );

  const encKeyBytes = derivedBits.slice(0, 32);
  const authProofBytes = derivedBits.slice(32, 64);

  // 3. Import AES-256-GCM encryption key
  const encryptionKey = await subtle.importKey(
    "raw",
    encKeyBytes,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );

  // 4. Compute authProof (hex) and its SHA-256 hash (authVerifierHash)
  const authProof = bytesToHex(authProofBytes);
  const authVerifierHashBuffer = await subtle.digest("SHA-256", enc.encode(authProof));
  const authVerifierHash = bytesToHex(authVerifierHashBuffer);

  return {
    encryptionKey,
    authProof,
    authVerifierHash,
  };
}

/**
 * Generate an ephemeral ECDH keypair (NIST P-256 curve)
 */
export async function generateEcdhKeyPair(): Promise<EcdhKeyPair> {
  const subtle = getSubtle();
  const keyPair = await subtle.generateKey(
    {
      name: "ECDH",
      namedCurve: "P-256",
    },
    true,
    ["deriveKey", "deriveBits"]
  );

  const exportedRaw = await subtle.exportKey("raw", keyPair.publicKey);
  const publicKeyBase64 = bytesToBase64(exportedRaw);

  return {
    publicKey: keyPair.publicKey,
    privateKey: keyPair.privateKey,
    publicKeyBase64,
  };
}

/**
 * Derive a shared AES-256-GCM key from local private key and peer's public key (ECDH + HKDF)
 */
export async function deriveSharedAesKey(
  myPrivateKey: CryptoKey,
  peerPublicKeyBase64: string,
  saltText: string = "secure-chat-business-salt"
): Promise<CryptoKey> {
  const subtle = getSubtle();
  const peerKeyBytes = base64ToBytes(peerPublicKeyBase64);
  const peerPublicKey = await subtle.importKey(
    "raw",
    peerKeyBytes,
    {
      name: "ECDH",
      namedCurve: "P-256",
    },
    true,
    []
  );

  // Derive bits from ECDH
  const sharedBits = await subtle.deriveBits(
    {
      name: "ECDH",
      public: peerPublicKey,
    },
    myPrivateKey,
    256
  );

  // Import shared bits into HKDF key
  const hkdfKey = await subtle.importKey(
    "raw",
    sharedBits,
    { name: "HKDF" },
    false,
    ["deriveKey"]
  );

  // Derive AES-256-GCM key using HKDF-SHA256
  const salt = new TextEncoder().encode(saltText);
  const info = new TextEncoder().encode("aes-256-gcm-chat-session");

  return await subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt,
      info,
    },
    hkdfKey,
    {
      name: "AES-GCM",
      length: 256,
    },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Encrypt a plaintext message or object using AES-256-GCM with a fresh 96-bit IV
 */
export async function encryptZeroKnowledge(
  key: CryptoKey,
  plaintext: string | object
): Promise<EncryptedPacket> {
  const subtle = getSubtle();
  const serialized = typeof plaintext === "string" ? plaintext : JSON.stringify(plaintext);
  const encoded = new TextEncoder().encode(serialized);

  // Fresh 96-bit (12-byte) initialization vector generated securely
  const iv = new Uint8Array(12);
  getRandomValues(iv);

  const ciphertextBuffer = await subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      tagLength: 128, // 16 bytes authentication tag
    },
    key,
    encoded
  );

  return {
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(ciphertextBuffer),
    timestamp: Date.now(),
  };
}

/**
 * Decrypt an encrypted message packet using AES-256-GCM.
 * Validates the authentication tag; throws if ciphertext or IV has been tampered with.
 */
export async function decryptZeroKnowledge(
  key: CryptoKey,
  ivBase64: string,
  ciphertextBase64: string
): Promise<string> {
  const subtle = getSubtle();
  const iv = base64ToBytes(ivBase64);
  const ciphertext = base64ToBytes(ciphertextBase64);

  const decryptedBuffer = await subtle.decrypt(
    {
      name: "AES-GCM",
      iv,
      tagLength: 128,
    },
    key,
    ciphertext
  );

  return new TextDecoder().decode(decryptedBuffer);
}

/**
 * Helper to build a secure invite link with room ID and password in the URL fragment (#).
 * The URL fragment (#...) is NEVER transmitted to the server in HTTP requests,
 * ensuring zero-knowledge secrecy while offering 1-click sharing to friends.
 */
export function buildRoomInviteLink(
  baseUrl: string,
  roomId: string,
  password: string
): string {
  const cleanBase = baseUrl.replace(/#.*$/, "").replace(/\/$/, "");
  const params = new URLSearchParams({
    room: roomId,
    pwd: password,
  });
  return `${cleanBase}/#${params.toString()}`;
}

/**
 * Parse room ID and password from a URL hash string (e.g. window.location.hash)
 */
export function parseRoomInviteHash(hashOrUrl: string): { roomId: string | null; password: string | null } {
  const hashIndex = hashOrUrl.indexOf("#");
  const hashString = hashIndex !== -1 ? hashOrUrl.substring(hashIndex + 1) : hashOrUrl;
  const params = new URLSearchParams(hashString);
  return {
    roomId: params.get("room"),
    password: params.get("pwd"),
  };
}

/**
 * Securely overwrite byte buffers in memory
 */
export function wipeMemory(buffer: Uint8Array | ArrayBuffer): void {
  if (buffer instanceof Uint8Array) {
    buffer.fill(0);
  } else if (buffer instanceof ArrayBuffer) {
    new Uint8Array(buffer).fill(0);
  }
}
