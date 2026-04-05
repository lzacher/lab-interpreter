import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { spawn } from "child_process";
import path from "path";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

/**
 * Start the Python embedding microservice in the background.
 * This service provides vector embeddings for RAG (Retrieval-Augmented Generation).
 */
function startEmbeddingService(): void {
  // Locate the embedding service script relative to this file
  const scriptPath = path.join(
    path.dirname(new URL(import.meta.url).pathname),
    "..",
    "embedding_service.py"
  );

  // Check if already running
  fetch("http://127.0.0.1:5001/health", { signal: AbortSignal.timeout(1000) })
    .then(() => {
      console.log("[RAG] Embedding service already running");
    })
    .catch(() => {
      // Not running, start it
      const proc = spawn("python3", [scriptPath], {
        detached: true,
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, EMBEDDING_SERVICE_PORT: "5001" },
      });

      proc.stdout?.on("data", (data: Buffer) => {
        const msg = data.toString().trim();
        if (msg) console.log(`[RAG] ${msg}`);
      });

      proc.stderr?.on("data", (data: Buffer) => {
        const msg = data.toString().trim();
        // Suppress HuggingFace warnings
        if (msg && !msg.includes("Warning:") && !msg.includes("LOAD REPORT") && !msg.includes("UNEXPECTED")) {
          console.warn(`[RAG] ${msg}`);
        }
      });

      proc.on("error", (err: Error) => {
        console.warn(`[RAG] Could not start embedding service: ${err.message}`);
        console.warn("[RAG] Clinical summaries will be generated without RAG context");
      });

      proc.unref(); // Don't keep the process alive just for this child
      console.log(`[RAG] Starting embedding service (PID: ${proc.pid})...`);
    });
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
    // Start the embedding service after the main server is up
    startEmbeddingService();
  });
}

startServer().catch(console.error);
