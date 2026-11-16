import { describe, it, expect, beforeAll } from "bun:test";
import { app } from "../index.ts";
import { buildFrontend } from "../src/frontend/bundler.ts";

describe("Frontend Static & React SPA Serving", () => {
  beforeAll(async () => {
    // Ensure frontend is bundled
    await buildFrontend();
  });

  it("should serve the HTML entrypoint on GET / without inline scripts", async () => {
    const res = await app.handle(new Request("http://localhost/"));
    expect(res.status).toBe(200);

    const html = await res.text();
    expect(html).toContain("<!doctype html>");
    expect(html).toContain('<div id="root"></div>');
    expect(html).toContain('src="/dist/app.js"');
    expect(html).toContain('src="/dist/live-reload.js"');
    expect(html).toContain('href="/dist/styles.css"');

    // Ensure mobile viewport is keyboard-aware with interactive-widget
    expect(html).toContain("interactive-widget=resizes-content");
    expect(html).toContain("viewport-fit=cover");

    // Ensure no raw inline <script> blocks that violate strict CSP
    expect(html).not.toMatch(/<script(?![^>]*src=)[^>]*>[\s\S]*?<\/script>/);
  });

  it("should serve the bundled React application script on GET /dist/app.js", async () => {
    const res = await app.handle(new Request("http://localhost/dist/app.js"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/javascript");

    const js = await res.text();
    expect(js.length).toBeGreaterThan(1000);
  });

  it("should serve the external live-reload script on GET /dist/live-reload.js", async () => {
    const res = await app.handle(new Request("http://localhost/dist/live-reload.js"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/javascript");

    const js = await res.text();
    expect(js).toContain("setupLiveReload");
  });

  it("should serve the stylesheet on GET /dist/styles.css", async () => {
    const res = await app.handle(new Request("http://localhost/dist/styles.css"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/css");

    const css = await res.text();
    expect(css).toContain("--accent-emerald");
    expect(css).toContain("--visual-viewport-height");
  });

  it("should prevent directory traversal on static asset routes", async () => {
    const res = await app.handle(new Request("http://localhost/dist/../../package.json"));
    // Route sanitizes file and will not escape outdir
    expect(res.status).toBe(404);
  });
});
