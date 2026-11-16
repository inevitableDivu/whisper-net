import { describe, it, expect } from "bun:test";
import { app } from "../index.ts";
import type { CreateRoomResponse, RoomStatusResponse } from "../src/types/contracts.ts";

describe("HTTP Security & REST APIs", () => {
  it("should enforce strict zero-knowledge security headers", async () => {
    const res = await app.handle(new Request("http://localhost/health"));
    expect(res.status).toBe(200);

    const headers = res.headers;
    expect(headers.get("Content-Security-Policy")).toContain("default-src 'self'");
    expect(headers.get("Strict-Transport-Security")).toContain("max-age=63072000");
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("X-Frame-Options")).toBe("DENY");
    expect(headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(headers.get("Cache-Control")).toContain("no-store");
  });

  it("should handle CORS preflight requests correctly", async () => {
    const req = new Request("http://localhost/api/rooms", {
      method: "OPTIONS",
      headers: {
        Origin: "https://secure-chat.local",
        "Access-Control-Request-Method": "POST",
      },
    });

    const res = await app.handle(req);
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeDefined();
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("POST");
  });

  it("should return healthy status and sanitized statistics without PII", async () => {
    const healthRes = await app.handle(new Request("http://localhost/health"));
    const healthJson = (await healthRes.json()) as { status: string; uptimeSeconds: number };
    expect(healthJson.status).toBe("pass");
    expect(healthJson.uptimeSeconds).toBeGreaterThanOrEqual(0);

    const statsRes = await app.handle(new Request("http://localhost/health/stats"));
    const statsJson = (await statsRes.json()) as {
      status: string;
      metrics: { memory: Record<string, number>; ips?: unknown };
    };
    expect(statsJson.status).toBe("ok");
    expect(statsJson.metrics).toBeDefined();
    expect(statsJson.metrics.memory).toBeDefined();
    // Zero PII
    expect(statsJson.metrics.ips).toBeUndefined();
  });

  it("should create a secure room and retrieve its status", async () => {
    // 1. Create Room
    const createReq = new Request("http://localhost/api/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        maxPeers: 5,
        ttlSeconds: 3600,
      }),
    });

    const createRes = await app.handle(createReq);
    expect(createRes.status).toBe(201);
    const createJson = (await createRes.json()) as CreateRoomResponse;
    expect(createJson.success).toBe(true);
    expect(createJson.roomId).toBeDefined();
    expect(createJson.roomId.length).toBeGreaterThanOrEqual(16);
    expect(createJson.maxPeers).toBe(5);
    expect(createJson.hasPassword).toBe(false);

    // 2. Query Status
    const statusReq = new Request(`http://localhost/api/rooms/${createJson.roomId}/status`);
    const statusRes = await app.handle(statusReq);
    expect(statusRes.status).toBe(200);
    const statusJson = (await statusRes.json()) as RoomStatusResponse;
    expect(statusJson.exists).toBe(true);
    expect(statusJson.isBurned).toBe(false);
    expect(statusJson.maxPeers).toBe(5);
    expect(statusJson.peerCount).toBe(0);
  });

  it("should reject invalid room creation payloads with 400", async () => {
    const badReq = new Request("http://localhost/api/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        maxPeers: 999, // exceeds maximum permitted
      }),
    });

    const res = await app.handle(badReq);
    expect(res.status).toBe(400);
  });

  it("should serve OpenAPI Swagger UI and JSON documentation", async () => {
    // Test Swagger UI endpoint
    const swaggerUiRes = await app.handle(new Request("http://localhost/swagger"));
    expect(swaggerUiRes.status).toBe(200);
    const htmlText = await swaggerUiRes.text();
    expect(htmlText).toContain("<!doctype html>");

    // Test OpenAPI specification JSON endpoint
    const swaggerJsonRes = await app.handle(new Request("http://localhost/swagger/json"));
    expect(swaggerJsonRes.status).toBe(200);
    const spec = (await swaggerJsonRes.json()) as {
      openapi: string;
      info: { title: string; version: string };
      paths: Record<string, any>;
    };
    expect(spec.info.title).toContain("Zero-Knowledge");
    expect(spec.paths["/api/rooms/"]).toBeDefined();
    expect(spec.paths["/health/"]).toBeDefined();
  });
});
