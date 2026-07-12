import Fastify, { type FastifyInstance } from "fastify";
import type { IncomingMessage } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { AdmissionController } from "./admission/index.js";
import { loadConfig, type ServerConfig } from "./config.js";
import { PhaseEngine } from "./engine/phase-engine.js";
import { loadScenarioReadiness, type ScenarioReadiness } from "./readiness.js";
import { registerBundleRoutes } from "./static.js";

export type BuildServerOptions = {
  config?: ServerConfig;
  onWebSocketConnection?: (socket: WebSocket) => void;
  admission?: AdmissionController;
};

export type ServerRuntime = {
  app: FastifyInstance;
  config: ServerConfig;
  readiness: ScenarioReadiness;
  webSockets: WebSocketServer;
  admission: AdmissionController;
  engine: PhaseEngine | null;
  startedAt: number;
};

export async function buildServer(options: BuildServerOptions = {}): Promise<ServerRuntime> {
  const config = options.config ?? loadConfig();
  const readiness = await loadScenarioReadiness(config);
  const startedAt = Date.now();
  const app = Fastify({ logger: config.nodeEnv !== "test" });
  const webSockets = new WebSocketServer({ noServer: true });
  let engine: PhaseEngine | null = null;
  const admission = options.admission ?? new AdmissionController({
    installationId: config.installationId,
    roomId: config.roomId,
    secret: config.joinGrantSecret,
    trustProxy: config.trustProxy,
    onClientMessage: (message, socket, request) => engine?.handleClientMessage(message, socket, request),
    onParticipantJoin: (participant, socket) => engine?.participantJoined(socket, participant),
    onSocketClosed: (socket) => engine?.socketClosed(socket),
  });
  if (readiness.ready) {
    engine = new PhaseEngine({
      scenario: readiness.scenario,
      registry: admission.registry,
      installationId: config.installationId,
      roomId: config.roomId,
      displayToken: config.displayToken,
    });
    engine.start();
  }

  app.get("/healthz", async () => ({ ok: true }));
  app.get("/readyz", async (_request, reply) => {
    if (!readiness.ready) {
      return reply.code(503).send({ ok: false, errors: readiness.errors });
    }
    return { ok: true, scenarioVersion: readiness.scenario.version };
  });
  app.get("/api/status", async () => ({
    ok: true,
    ready: readiness.ready,
    buildVersion: config.buildVersion,
    installationId: config.installationId,
    roomId: config.roomId,
    scenarioVersion: readiness.ready ? readiness.scenario.version : null,
    scenarioWarnings: readiness.warnings,
    webSocketClients: webSockets.clients.size,
    startedAt,
    uptimeMs: Date.now() - startedAt,
  }));

  registerBundleRoutes(app, config.bundleDirs);

  app.server.on("upgrade", (request, socket, head) => {
    const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
    if (pathname !== "/ws") {
      socket.destroy();
      return;
    }
    webSockets.handleUpgrade(request, socket, head, (webSocket) => {
      webSockets.emit("connection", webSocket, request);
    });
  });
  webSockets.on("connection", (socket, request) => {
    admission.handleConnection(socket, request as IncomingMessage);
    options.onWebSocketConnection?.(socket);
  });

  // Upgraded sockets are not managed by Fastify's HTTP connection tracker.
  // Close them before Fastify waits for the underlying server to drain.
  app.addHook("preClose", async () => {
    engine?.stop();
    for (const socket of webSockets.clients) socket.terminate();
    await new Promise<void>((resolve) => webSockets.close(() => resolve()));
  });

  return { app, config, readiness, webSockets, admission, engine, startedAt };
}
