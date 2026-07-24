import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { pathToFileURL } from "url";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerAuthRoutes } from "./auth";
import { registerStorageProxy } from "./storageProxy";
import { registerProjectFileAccess } from "./projectFileAccess";
import { registerProjectDesignPrototypeFileAccess } from "./projectDesignPrototypeFileAccess";
import { registerIdeaFileAccess } from "./ideaFileAccess";
import { registerVerificationFileAccess } from "./verificationFileAccess";
import { registerFileRoutes } from "./fileRoutes";
import { registerRealtime } from "../realtime";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { assertProductionConfiguration, ENV } from "./env";
import { checkReadiness } from "./readiness";
import { logger } from "./logger";
import { startNotificationRetryWorker } from "../notifications/retry-worker";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

export async function resolveListeningPort(options: {
  preferredPort: number;
  isProduction: boolean;
  isPortAvailableFn?: (port: number) => Promise<boolean>;
}) {
  const { preferredPort, isProduction, isPortAvailableFn = isPortAvailable } = options;
  if (isProduction) {
    if (await isPortAvailableFn(preferredPort)) return preferredPort;
    logger.error("server.port_in_use", { preferredPort, selectedPort: null, mode: "production" });
    throw new Error(`port_in_use:${preferredPort}`);
  }
  for (let port = preferredPort; port < preferredPort + 20; port += 1) {
    if (await isPortAvailableFn(port)) return port;
  }
  throw new Error(`No available port found starting from ${preferredPort}`);
}

export async function startServer() {
  assertProductionConfiguration();
  const app = express();
  const server = createServer(app);

  app.use((req, res, next) => {
    const origin = req.headers.origin;
    const isLocalOrigin = Boolean(origin && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin));
    const allowed = !origin || ENV.corsOrigins.includes(origin) || (!ENV.isProduction && isLocalOrigin);

    if (!allowed) {
      res.status(403).json({ error: "Origin is not allowed" });
      return;
    }
    if (origin) res.header("Access-Control-Allow-Origin", origin);
    res.header("Vary", "Origin");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    res.header(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept, Authorization, Idempotency-Key",
    );
    res.header("Access-Control-Allow-Credentials", "true");
    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  });

  const requestLimit = `${Math.ceil((ENV.maxUploadBytes * 1.5) / 1024 / 1024) + 1}mb`;
  app.use(express.json({ limit: requestLimit }));
  app.use(express.urlencoded({ limit: requestLimit, extended: true }));

  registerStorageProxy(app);
  registerProjectFileAccess(app);
  registerProjectDesignPrototypeFileAccess(app);
  registerIdeaFileAccess(app);
  registerVerificationFileAccess(app);
  registerFileRoutes(app);
  registerAuthRoutes(app);

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, status: "alive" });
  });

  app.get("/api/ready", async (_req, res) => {
    const result = await checkReadiness();
    res.status(result.ok ? 200 : 503).json({ ok: result.ok, status: result.ok ? "ready" : "not_ready", checks: result.checks });
  });

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    }),
  );

  const preferredPort = ENV.port;
  const port = await resolveListeningPort({ preferredPort, isProduction: ENV.isProduction });

  if (!ENV.isProduction && port !== preferredPort) {
    logger.warn("server.port_in_use", { preferredPort, selectedPort: port });
  }

  const realtime = registerRealtime(server);
  const stopNotificationRetryWorker = startNotificationRetryWorker();

  server.listen(port, () => {
    logger.info("server.listening", { port, environment: ENV.nodeEnv });
  });

  const shutdown = (signal: string) => {
    logger.info("server.shutdown_started", { signal });
    stopNotificationRetryWorker();
    realtime.close(() => server.close(() => {
      logger.info("server.shutdown_complete", { signal });
      process.exit(0);
    }));
    const forcedExit = setTimeout(() => process.exit(1), 10_000);
    (forcedExit as unknown as { unref?: () => void }).unref?.();
  };
  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));
  return { app, server, port };
}

const entryHref = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === entryHref) {
  startServer().catch((error) => {
    logger.error("server.start_failed", { error });
    process.exitCode = 1;
  });
}
