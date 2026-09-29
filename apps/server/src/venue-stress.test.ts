import { describe, expect, it } from "vitest";
import WebSocket from "ws";
import { buildServer } from "./server.js";
import { loadConfig } from "./config.js";

const wait = (socket: WebSocket, type: string) => new Promise<any>((resolve, reject) => {
  const timer = setTimeout(() => { socket.off("message", receive); reject(new Error(`Waiting for ${type}`)); }, 5000);
  function receive(raw: WebSocket.RawData) {
    const message = JSON.parse(raw.toString());
    if (message.t !== type) return;
    clearTimeout(timer); socket.off("message", receive); resolve(message);
  }
  socket.on("message", receive);
});
const open = (url: string) => new Promise<WebSocket>((resolve, reject) => {
  const socket = new WebSocket(url);
  socket.once("open", () => resolve(socket)); socket.once("error", reject);
});
const send = (socket: WebSocket, message: object) => socket.send(JSON.stringify({ v: 2, ...message }));

describe("venue session stress", () => {
  it("handles 100 simultaneous humans, rejects 101, and cleans up three consecutive shows without skipping the lobby", async () => {
    const config = loadConfig({ NODE_ENV: "test", RUN_MODE: "venue", VENUE_MEDIA_LOCATION: "display",
      SCENARIO_PATH: "content/scenarios/venue.json", MEDIA_MANIFEST_PATH: "content/media-manifests/venue.json",
      MAX_PARTICIPANTS: "30", JOIN_RATE_LIMIT_MAX_ATTEMPTS: "1000" });
    const runtime = await buildServer({ config });
    const sockets: WebSocket[] = [];
    try {
      expect(runtime.readiness.ready).toBe(true);
      await runtime.app.listen({ host: "127.0.0.1", port: 0 });
      const address = runtime.app.server.address();
      if (!address || typeof address === "string") throw new Error("No listening port");
      const url = `ws://127.0.0.1:${address.port}/ws`;
      const display = await open(url); sockets.push(display);
      const snapshot = wait(display, "snapshot");
      send(display, { t: "display_join", clientVersion: "dev", installationId: config.installationId, roomId: config.roomId, displayToken: config.displayToken });
      await snapshot;
      for (let cycle = 0; cycle < 3; cycle++) {
        const phones = await Promise.all(Array.from({ length: 100 }, async (_, i) => {
          const phone = await open(url); sockets.push(phone);
          const joined = wait(phone, "identity");
          send(phone, { t: "join", clientVersion: "dev", installationId: config.installationId, roomId: config.roomId, name: `Stress ${cycle}-${i}` });
          await joined; return phone;
        }));
        expect(runtime.admission.registry.connectedCount).toBe(100);
        expect(runtime.engine!.lifecycleState).toBe("lobby");
        expect(runtime.engine!.getSnapshot().deadlineAt! - Date.now()).toBeGreaterThan(40_000);
        const extra = await open(url); sockets.push(extra);
        const rejected = wait(extra, "join_rejected");
        send(extra, { t: "join", clientVersion: "dev", installationId: config.installationId, roomId: config.roomId, name: "Overflow" });
        expect((await rejected).reason).toBe("room_full"); extra.close();
        // Reconnect twenty admitted phones during the same lobby. Their slots
        // and the original deadline must survive transport interruptions.
        const deadline = runtime.engine!.getSnapshot().deadlineAt;
        const records = runtime.admission.registry.values().slice(0, 20);
        for (let i = 0; i < records.length; i++) {
          const old = phones[i]!;
          const closed = new Promise<void>((resolve) => old.once("close", () => resolve()));
          old.close(); await closed;
          const phone = await open(url); sockets.push(phone);
          const joined = wait(phone, "identity");
          send(phone, { t: "join", clientVersion: "dev", installationId: config.installationId,
            roomId: config.roomId, name: records[i]!.name, participantLease: records[i]!.participantLease });
          await joined; phones[i] = phone;
        }
        expect(runtime.admission.registry.connectedCount).toBe(100);
        expect(runtime.engine!.getSnapshot().deadlineAt).toBe(deadline);
        expect(runtime.engine!.lifecycleState).toBe("lobby");
        runtime.engine!.adminStart();
        const state = runtime.engine!.getSnapshotMessage();
        for (let frame = 0; frame < 100; frame++) {
          for (const phone of phones) send(phone, { t: "input", sessionId: state.sessionId, phaseEpoch: state.phaseEpoch, seq: frame, x: frame / 100, y: .5 });
        }
        await Promise.all(phones.map(async (phone) => {
          const pong = wait(phone, "pong"); send(phone, { t: "ping", clientTime: Date.now() }); await pong;
        }));
        expect(runtime.engine!.lifecycleState).toBe("active");
        runtime.engine!.adminJump("credits");
        const closed = phones.map((phone) => new Promise<number>((resolve) => phone.once("close", resolve)));
        runtime.engine!.adminSkip(); // Exercise actual server/admission end-of-show cleanup.
        await Promise.all(closed);
        expect(runtime.admission.registry.connectedCount).toBe(0);
        expect(runtime.admission.registry.leaseCount).toBe(0);
        runtime.engine!.tick();
        expect(runtime.engine!.lifecycleState).toBe("idle");
      }
    } finally {
      for (const socket of sockets) socket.terminate();
      await runtime.app.close();
    }
  }, 30_000);
});
