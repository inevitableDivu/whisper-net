# WhisperNet — Zero-Knowledge End-to-End Encrypted (E2EE) Chat

A high-performance, strictly-typed zero-knowledge chat application powered by **React 19**, **Vite**, **Elysia**, and **Bun**. Featuring client-side Web Crypto (`window.crypto.subtle`), persistent client UUIDs via `@inevitable_divu/use-idb`, Shadcn Nova compact theme, and self-signed TLS support for shared network / LAN devices.

---

## ⚡ Quick Start (1-Command Bootstrap)

Run the automated setup script to verify Bun, configure directories, generate TLS certificates for your local network IP, initialize SQLite, and build the frontend:

```bash
bun run setup
```

Or execute the bash equivalent:
```bash
./scripts/setup.sh
```

---

## 🚀 Running the Application

### 1. Local Development (Standard HTTP on localhost)
```bash
bun run dev
```
- **Web App**: [http://localhost:3000](http://localhost:3000)
- **Interactive Swagger UI**: [http://localhost:3000/swagger](http://localhost:3000/swagger)
- **OpenAPI 3.0 Spec**: [http://localhost:3000/swagger/json](http://localhost:3000/swagger/json)

### 2. Shared Network / LAN Access (HTTPS with WebCrypto Enabled)
Modern browsers require a **Secure Context** (`https://` or `localhost`) to enable `window.crypto.subtle`. When connecting from a phone, tablet, or another computer on the same Wi-Fi:

```bash
bun run dev:https
# or
bun run start:https
```
- Open `https://<YOUR_LAN_IP>:3000` on your mobile device or peer browser.
- Accept the self-signed certificate warning (Chrome: **Advanced** → **Proceed**).
- Full zero-knowledge encryption runs at native WebCrypto speed on all client devices.

### 3. Vite Frontend Dev Server (Instant React HMR)
```bash
bun run dev:frontend
```
- Spans Vite dev server at `http://localhost:5173` with instant React Fast Refresh.
- Proxies `/api`, `/ws`, `/health`, and `/swagger` directly to the Elysia backend (`http://localhost:3000`).

---

## 🛠️ Management & Utility Scripts

All automation scripts are organized in the [`scripts/`](file:///home/inevitable/Projects/secure-chat-business/scripts/) folder and mapped to `package.json`:

| Command | Purpose |
| :--- | :--- |
| `bun run setup` | Full 1-command bootstrap: checks environment, sets up `.env`, generates SAN certs, verifies SQLite, and bundles frontend |
| `bun run certs` | Generates 2048-bit RSA self-signed certificates with SAN matching `localhost`, `127.0.0.1`, and your active LAN IP |
| `bun run build` | Builds and minifies the React 19 frontend bundle with Vite into `public/dist/` |
| `bun run clean` | Removes compiled distribution directories (`public/dist/`, `dist/`) |
| `bun run db:reset` | Safely resets the local SQLite database and truncates WAL/SHM files |
| `bun run typecheck` | Validates TypeScript types across the entire project (`tsc --noEmit`) |
| `bun test` | Runs the automated test suite (34 tests covering crypto, websockets, SQLite, and HTTP APIs) |
| `bun run demo` | Runs the end-to-end cryptographic simulation (Alice & Bob exchange, accidental reload, cron protection, burn) |

---

## 🛡️ Zero-Knowledge & Security Architecture

1. **Zero-Knowledge Principle**:
   - The backend acts solely as a blind cryptographic relay and storage coordinator.
   - The server **NEVER** sees, receives, derives, or stores plaintext messages, passwords, or encryption keys.
   - All encryption occurs directly on the user device via Web Crypto (`window.crypto.subtle`).

2. **Password-Derived Keys (`window.crypto.subtle`)**:
   - Keys are derived locally using **PBKDF2-HMAC-SHA256 (100,000 iterations)** with a per-room unique salt.
   - The 256-bit `AES-256-GCM` room key exists strictly in browser memory.
   - The password is shared out-of-band via URL fragment (`#room=<id>&pwd=<password>`), which is **never transmitted to the server** in HTTP or WebSocket requests.

3. **Persistent Client UUID & Accidental Reload Recovery**:
   - Each client generates a persistent UUID via [safeRandomUUID()](file:///home/inevitable/Projects/secure-chat-business/src/crypto/client-crypto.ts) and stores it in browser IndexedDB with `@inevitable_divu/use-idb`.
   - The `senderUserId` is included inside the encrypted AES-256-GCM message payload.
   - If a user accidentally reloads their page, restored SQLite messages are decrypted on device. `isMe` matches the persistent UUID, ensuring correct indentation (self on right, peers on left) and deterministic chronological sorting.

4. **Retention Cron with Active User Protection**:
   - A background cron job periodically sweeps expired messages.
   - **Protection Rule**: **A room with at least 1 active connected user is NEVER purged**, protecting users who accidentally close or refresh their tab.

5. **Suicide / Burn Protocol**:
   - When any participant clicks "Burn Room", all messages in SQLite are purged, room keys are erased from client memory, and all connections are terminated.

---

## 🎨 UI & Design System

- **Shadcn Nova Theme**: Compact spacing scale designed for high density and efficiency.
- **Color Palette**: `oklch` theme tokens featuring crisp emerald primary accents.
- **Theme Switcher**: Instant light/dark mode switching persisted across sessions.
- **Mobile Responsive**: Slide-out drawer navigation on mobile viewports with backdrop blur.

---

## 📂 Project Structure

```
├── certs/                     # TLS development certificates (cert.pem, key.pem)
├── data/                      # Local SQLite database (WAL mode)
├── public/                    # Static assets served by Elysia
│   ├── index.html             # Single-page HTML entrypoint
│   ├── favicon.ico            # Inline SVG shield icon
│   └── dist/                  # Production Vite bundle (app.js, styles.css)
├── scripts/
│   ├── setup.ts               # Automated 1-step bootstrap
│   ├── setup.sh               # Companion POSIX shell script
│   ├── generate-certs.ts      # Multi-IP SAN TLS generator (TypeScript)
│   ├── generate-certs.sh      # OpenSSL SAN certificate generator (Bash)
│   ├── db-reset.ts            # SQLite database reset utility
│   └── clean.ts               # Build artifact cleanup
├── src/
│   ├── crypto/                # Client & server zero-knowledge cryptographic primitives
│   ├── db/                    # Native bun:sqlite WAL database & repository
│   ├── frontend/              # React 19 SPA (components, hooks, SOLID architecture)
│   ├── middleware/            # Security headers, rate limiting, and CORS
│   ├── plugins/               # OpenAPI / Swagger UI plugin
│   ├── routes/                # REST endpoints, WebSocket relay, and static file serving
│   ├── services/              # Room manager, sliding-window rate limiter, retention cron
│   └── config.ts              # Strictly-typed runtime configuration
├── tests/                     # 34 automated unit and integration tests
├── index.ts                   # Elysia server bootstrap with HTTP & HTTPS support
├── vite.config.ts             # Vite bundler & HMR configuration
└── tsconfig.json              # Strict TypeScript configuration
```
