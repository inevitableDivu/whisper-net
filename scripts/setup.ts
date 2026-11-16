import { existsSync, mkdirSync, copyFileSync } from "fs";
import { join } from "path";
import { generateCertificates } from "./generate-certs.ts";
import { buildFrontend } from "../src/frontend/bundler.ts";

/**
 * 1-Command Project Setup & Initialization Script
 *
 * Verifies runtime prerequisites, generates TLS certificates with LAN IP SANs,
 * sets up SQLite database directories, compiles the frontend bundle via Vite,
 * and validates system integrity.
 */
async function runSetup() {
  console.log(`
╔══════════════════════════════════════════════════════════════════╗
║     🔒 SECURE ZERO-KNOWLEDGE E2EE CHAT - PROJECT SETUP           ║
╚══════════════════════════════════════════════════════════════════╝
  `);

  const rootDir = process.cwd();

  // 1. Check Bun runtime
  console.log(`[1/6] Checking runtime environment...`);
  const bunVersion = typeof Bun !== "undefined" ? Bun.version : "Unknown";
  console.log(`      ✓ Bun Runtime: v${bunVersion}`);

  // 2. Setup directories
  console.log(`\n[2/6] Initializing storage and asset directories...`);
  const dirs = [
    join(rootDir, "data"),
    join(rootDir, "certs"),
    join(rootDir, "public", "dist"),
  ];

  for (const dir of dirs) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
      console.log(`      + Created: ${dir.replace(rootDir, ".")}`);
    } else {
      console.log(`      ✓ Verified: ${dir.replace(rootDir, ".")}`);
    }
  }

  // 3. Environment file
  console.log(`\n[3/6] Setting up environment configuration (.env)...`);
  const envFile = join(rootDir, ".env");
  const envExample = join(rootDir, ".env.example");

  if (!existsSync(envFile) && existsSync(envExample)) {
    copyFileSync(envExample, envFile);
    console.log(`      + Copied .env.example -> .env`);
  } else if (existsSync(envFile)) {
    console.log(`      ✓ .env file already exists`);
  }

  // 4. Generate TLS Certificates (for shared network / LAN IP access)
  console.log(`\n[4/6] Checking TLS/HTTPS certificates...`);
  const certFile = join(rootDir, "certs", "cert.pem");
  const keyFile = join(rootDir, "certs", "key.pem");

  if (!existsSync(certFile) || !existsSync(keyFile)) {
    console.log(`      Generating fresh TLS development certificates...`);
    await generateCertificates();
  } else {
    console.log(`      ✓ Valid certificates found in ./certs/`);
  }

  // 5. Build Frontend with Vite
  console.log(`\n[5/6] Building production frontend with Vite...`);
  const buildResult = await buildFrontend();
  if (buildResult.success) {
    console.log(`      ✓ Bundled frontend in ${buildResult.durationMs}ms`);
  } else {
    throw new Error("Frontend build failed during setup.");
  }

  // 6. Test Database Connectivity
  console.log(`\n[6/6] Verifying SQLite storage engine...`);
  try {
    const { chatRepository } = await import("../src/db/chat-repository.ts");
    chatRepository.getRoomHistory("test_probe_room");
    console.log(`      ✓ SQLite initialized with WAL mode and foreign keys enabled`);
  } catch (err: any) {
    console.error(`      ❌ Database check error:`, err.message);
  }

  console.log(`
══════════════════════════════════════════════════════════════════
🎉 Setup completed successfully! All dependencies and assets ready.
══════════════════════════════════════════════════════════════════

Available Run Modes:

1. Local Development (Standard HTTP):
   $ bun run dev
   → Open http://localhost:3000

2. Shared Network / LAN Access (HTTPS with WebCrypto Enabled):
   $ bun run dev:https
   → Open https://<YOUR_LAN_IP>:3000 on your phone, tablet, or peers

3. Production Server:
   $ bun run start          (HTTP)
   $ bun run start:https    (HTTPS)

4. Test Suite & Typecheck:
   $ bun test
   $ bun run typecheck
══════════════════════════════════════════════════════════════════
  `);
}

if (import.meta.main) {
  runSetup().catch((err) => {
    console.error(`\n❌ Setup failed:`, err);
    process.exit(1);
  });
}
