import Fastify, { type FastifyInstance } from "fastify";
import { WebSocketServer, type WebSocket } from "ws";
import { loadConfig, type ServerConfig } from "./config.js";
import { loadScenarioReadiness, type ScenarioReadiness } from "./readiness.js";
import { registerBundleRoutes } from "./static.js";

export type BuildServerOptions = {
  config?: ServerConfig;
  onWebSocketConnection?: (socket: WebSocket) => void;
};

export type ServerRuntime = {
  app: FastifyInstance;
  config: ServerConfig;
  readiness: ScenarioReadiness;
  webSockets: WebSocketServer;
  startedAt: number;
};

export async function buildServer(options: BuildServerOptions = {}): Promise<ServerRuntime> {
  const config = options.config ?? loadConfig();
  const readiness = await loadScenarioReadiness(config);
  const startedAt = Date.now();
  const app = Fastify({ logger: config.nodeEnv !== "test" });
  const webSockets = new WebSocketServer({ noServer: true });

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
  webSockets.on("connection", (socket) => options.onWebSocketConnection?.(socket));

  // Upgraded sockets are not managed by Fastify's HTTP connection tracker.
  // Close them before Fastify waits for the underlying server to drain.
  app.addHook("preClose", async () => {
    for (const socket of webSockets.clients) socket.terminate();
    await new Promise<void>((resolve) => webSockets.close(() => resolve()));
  });

  return { app, config, readiness, webSockets, startedAt };
}
