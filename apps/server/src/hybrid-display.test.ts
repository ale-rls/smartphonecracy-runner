import { describe, expect, it } from "vitest";
import { controlWebSocketUrl, loadHybridDisplayConfig } from "./hybrid-display.js";

describe("hybrid display configuration", () => {
  it("derives a secure authoritative show socket from the public server", () => {
    expect(controlWebSocketUrl("https://show.example/some/path?old=1"))
      .toBe("wss://show.example/ws");
  });

  it("uses loopback and the production public services by default", () => {
    const config = loadHybridDisplayConfig({ DISPLAY_TOKEN: "installation-token" });
    expect(config).toMatchObject({
      HYBRID_DISPLAY_HOST: "127.0.0.1",
      HYBRID_DISPLAY_PORT: 3000,
      PUBLIC_SERVER_URL: "https://smartphonocracy-server.enabler.space",
      POCKETBASE_URL: "https://smartphonocracy.enabler.space",
      REALTIME_WS_URL: "wss://smartphonocracy-websockets.enabler.space",
      controlWsUrl: "wss://smartphonocracy-server.enabler.space/ws",
    });
  });

  it("rejects insecure public endpoints", () => {
    expect(() => loadHybridDisplayConfig({
      DISPLAY_TOKEN: "installation-token",
      PUBLIC_SERVER_URL: "http://show.example",
    })).toThrow("PUBLIC_SERVER_URL must use HTTPS");
    expect(() => loadHybridDisplayConfig({
      DISPLAY_TOKEN: "installation-token",
      REALTIME_WS_URL: "ws://relay.example",
    })).toThrow("REALTIME_WS_URL must use WSS");
  });
});
