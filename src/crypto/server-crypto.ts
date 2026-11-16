/**
 * Server-side Cryptographic Utilities
 *
 * Implements high-entropy token generation, constant-time comparisons,
 * and timestamp validation. The server NEVER holds or derives encryption keys.
 */

/**
 * Generate a cryptographically secure random token (Base64URL encoded)
 */
export function generateSecureToken(byteLength: number = 24): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes)
    .toString("base64url")
    .replace(/[^A-Za-z0-9_-]/g, "");
}

/**
 * Generate an ephemeral peer ID
 */
export function generatePeerId(): string {
  const randomBytes = new Uint8Array(12);
  crypto.getRandomValues(randomBytes);
  return `peer_${Buffer.from(randomBytes).toString("hex")}`;
}

/**
 * Constant-time string comparison to defend against timing attacks
 */
export function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf-8");
  const bufB = Buffer.from(b, "utf-8");

  if (bufA.length !== bufB.length) {
    // Constant-time dummy comparison to mitigate length timing leak
    let dummy = 0;
    for (let i = 0; i < bufA.length; i++) {
      dummy |= bufA[i]! ^ 0;
    }
    return false;
  }

  let mismatch = 0;
  for (let i = 0; i < bufA.length; i++) {
    mismatch |= bufA[i]! ^ bufB[i]!;
  }
  return mismatch === 0;
}

/**
 * Compute SHA-256 hex string for a given text
 */
export async function sha256Hex(data: string): Promise<string> {
  const encoded = new TextEncoder().encode(data);
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
  return Buffer.from(hashBuffer).toString("hex");
}

/**
 * Validate that a client timestamp falls within acceptable drift window
 * to prevent replay attacks and forward timestamp spoofing.
 */
export function validateTimestamp(timestamp: number, maxDriftMs: number): boolean {
  if (typeof timestamp !== "number" || isNaN(timestamp)) {
    return false;
  }
  const now = Date.now();
  const diff = Math.abs(now - timestamp);
  return diff <= maxDriftMs;
}
