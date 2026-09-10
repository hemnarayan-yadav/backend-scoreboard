import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import mongoose from "mongoose";
import { Server } from "socket.io";
import { config } from "./config.js";
import { ensureSuperAdmin } from "./controllers/authController.js";
import authRoutes from "./routes/authRoutes.js";
import { matchRoutes } from "./routes/matchRoutes.js";

const app = express();
const server = http.createServer(app);
const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function corsOrigin(origin, callback) {
  if (!origin || origin === "null") {
    // See config.allowNullOrigin: only trust file:// / sandboxed-iframe
    // requests outside production.
    return callback(null, config.allowNullOrigin);
  }
  if (config.corsOrigins.includes("*") || config.corsOrigins.includes(origin)) return callback(null, true);
  return callback(new Error("CORS origin not allowed"));
}

const io = new Server(server, { cors: { origin: corsOrigin, methods: ["GET", "PUT", "POST"] } });

app.set("trust proxy", 1);
app.use(
  helmet({
    // helmet's default Content-Security-Policy assumes it's protecting a
    // page that renders untrusted input. control.html and display.html are
    // fixed, developer-authored files with inline <script>/<style> blocks
    // and Google Fonts links — the default CSP (script-src/style-src
    // 'self') would silently block all of it, breaking both pages the
    // moment this went behind a real domain. CSP's XSS-mitigation value
    // doesn't apply here, so it's off rather than fighting it with
    // 'unsafe-inline' exceptions that would defeat the point anyway.
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" }, // the JSON API is deliberately called from a separate frontend origin
  }),
);
app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json({ limit: "100kb" }));
// Coarse backstop only — 300/min per IP is high enough that legitimate
// public traffic never hits it (see the Cache-Control note on
// listMatches for the actual fix to repeated public polling from many
// clients behind one IP). The routes that matter for abuse — login and
// match mutations — have their own tighter limiters right where they're
// defined.
app.use("/api", rateLimit({ windowMs: 60 * 1000, max: 300, standardHeaders: true, legacyHeaders: false }));

app.get("/api/health", (_req, res) => res.json({ ok: true, service: "kabaddi-live-api" }));
app.use("/api/auth", authRoutes);
app.use("/api/matches", matchRoutes(io));

// Filenames must match exactly what's deployed alongside this server
// (Linux hosts are case- and name-sensitive) — these are the local
// operator tools (control.html + display.html), not the public React site.
app.get("/control.html", (_req, res) => res.sendFile(path.join(workspaceRoot, "control.html")));
app.get("/display.html", (_req, res) => res.sendFile(path.join(workspaceRoot, "display.html")));

app.use("/api", (_req, res) => res.status(404).json({ error: "Not found" }));

// Centralized error handler. Every route is either a sync handler with no
// awaited calls, or wrapped in asyncHandler — so any thrown/rejected error
// (a bad ObjectId, a Mongoose validation failure, malformed JSON, a blocked
// CORS origin) lands here instead of hanging the request or returning
// Express's default HTML error page to a JSON API client.
app.use((error, _request, response, _next) => {
  console.error(error);
  if (error.message === "CORS origin not allowed") return response.status(403).json({ error: error.message });
  if (error.name === "ValidationError") return response.status(400).json({ error: error.message });
  if (error.name === "CastError") return response.status(400).json({ error: "Invalid identifier" });
  if (error.type === "entity.parse.failed") return response.status(400).json({ error: "Malformed JSON body" });
  response.status(500).json({ error: "Something went wrong" });
});

io.on("connection", (socket) => {
  socket.on("match:join", (id) => {
    if (typeof id === "string" && id.length > 0 && id.length < 200) socket.join(`match:${id}`);
  });
});

async function start() {
  if (!config.mongoUri) {
    console.error("MONGODB_URI is required");
    process.exitCode = 1;
    return;
  }
  await mongoose.connect(config.mongoUri);
  await ensureSuperAdmin();
  server.listen(config.port, () => console.log(`Kabaddi API listening on ${config.port}`));
}

start().catch((error) => {
  console.error("MongoDB connection or startup failed", error.message);
  process.exitCode = 1;
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, async () => {
    console.log(`${signal} received — shutting down gracefully`);
    await mongoose.connection.close().catch(() => {});
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000).unref();
  });
}