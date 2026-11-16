import { swagger } from "@elysiajs/swagger";

/**
 * OpenAPI / Swagger Documentation Plugin for Secure Chat Backend
 * Accessible at `/swagger` (UI) and `/swagger/json` (OpenAPI Spec)
 */
export const swaggerPlugin = swagger({
  path: "/swagger",
  documentation: {
    info: {
      title: "Secure Zero-Knowledge E2EE Chat Backend API",
      version: "1.0.0",
      description: `
### 🔒 Zero-Knowledge & Security Architecture

This backend serves as a hardened, high-performance blind relay for **End-to-End Encrypted (E2EE) communications**:

1. **Zero-Knowledge Guarantee**:
   - The server **NEVER** holds, derives, or generates encryption keys, user passwords, or plaintext.
   - All encryption and decryption operations occur **exclusively on user devices** using \`window.crypto.subtle\`.

2. **Password-Derived Keys (\`window.crypto.subtle\`)**:
   - When creating a room with a password, the client device derives an \`AES-256-GCM\` room key and a zero-knowledge authentication proof (\`authProof\`) using **PBKDF2-HMAC-SHA256 with 100,000 rounds**.
   - The client submits \`authVerifierHash = SHA-256(authProof)\` when creating the room.
   - The room password and encryption key **NEVER leave the user device**.
   - The invite link uses the URL fragment (\`https://domain/#room=<id>&pwd=<password>\`), ensuring the password is never sent in HTTP/WebSocket headers.

3. **Accidental Reload Recovery (Encrypted SQLite Persistence)**:
   - Encrypted messages (\`iv\`, \`ciphertext\`, \`timestamp\`, \`sequence\`) are temporarily saved in a local SQLite database (WAL mode).
   - If a user accidentally reloads their browser tab, the client reconnects, the server returns the encrypted history, and the user's browser decrypts it locally.

4. **Retention Cron & Active Room Protection**:
   - A scheduled cleanup cron runs periodically to purge expired records.
   - **Protection Rule**: **A room with at least 1 active user is NEVER purged.**
   - Once all users leave and the room expires, the cron job purges the data and truncates SQLite WAL logs.

5. **Burn Protocol (Suicide Command)**:
   - When any participant invokes \`burn\`, all SQLite messages for that room are eradicated immediately, memory is zeroed, and all connections are terminated.

---

### 🌐 WebSocket Protocol (\`/ws\`)

Connect to \`ws://<host>:<port>/ws\` and exchange JSON messages:

#### Client-to-Server Frames:
- **Join Room**: \`{ "type": "join", "roomId": "string", "authProof"?: "string" }\`
- **Send Encrypted Message**: \`{ "type": "message", "roomId": "string", "iv": "string", "ciphertext": "string", "timestamp": number, "sequence"?: number }\`
- **Exchange Ephemeral Key**: \`{ "type": "key_exchange", "roomId": "string", "publicKey": "string", "timestamp": number }\`
- **Sync History**: \`{ "type": "sync_history", "roomId": "string", "limit"?: number }\`
- **Burn Room**: \`{ "type": "burn", "roomId": "string", "reason"?: "string" }\`
- **Heartbeat Ping**: \`{ "type": "ping" }\`

#### Server-to-Client Frames:
- **Joined**: \`{ "type": "joined", "peerId": "string", "roomId": "string", "peerCount": number, "peers": string[], "maxPeers": number, "timestamp": number, "history": [...] }\`
- **Peer Joined**: \`{ "type": "peer_joined", "peerId": "string", "peerCount": number, "timestamp": number }\`
- **Peer Left**: \`{ "type": "peer_left", "peerId": "string", "peerCount": number, "timestamp": number }\`
- **Relayed Message**: \`{ "type": "message", "roomId": "string", "senderId": "string", "iv": "string", "ciphertext": "string", "timestamp": number, "sequence"?: number }\`
- **Relayed Key**: \`{ "type": "key_exchange", "roomId": "string", "senderId": "string", "publicKey": "string", "timestamp": number }\`
- **History Sync**: \`{ "type": "history", "roomId": "string", "messages": [...], "timestamp": number }\`
- **Burned**: \`{ "type": "burned", "roomId": "string", "message": "string", "timestamp": number }\`
- **Pong**: \`{ "type": "pong", "timestamp": number }\`
- **Error**: \`{ "type": "error", "code": "string", "message": "string", "timestamp": number }\`
      `,
    },
    tags: [
      {
        name: "Rooms",
        description: "Zero-knowledge ephemeral room creation and status verification",
      },
      {
        name: "Health & Diagnostics",
        description: "Liveness probes, readiness checks, and blinded server metrics",
      },
    ],
  },
});
