import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import { Server } from "socket.io";
import { config } from "./config.js";
import { ensureSuperAdmin } from "./controllers/authController.js";
import authRoutes from "./routes/authRoutes.js";
import { matchRoutes } from "./routes/matchRoutes.js";

const app = express();
const server = http.createServer(app);
const workspaceRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const corsOrigin = (origin, callback) =>
  !origin ||
  origin === "null" ||
  config.corsOrigins.includes("*") ||
  config.corsOrigins.includes(origin)
    ? callback(null, true)
    : callback(new Error("CORS origin not allowed"));
const io = new Server(server, {
  cors: { origin: corsOrigin, methods: ["GET", "PUT", "POST"] },
});

app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json({ limit: "100kb" }));
app.get("/api/health", (_req, res) =>
  res.json({ ok: true, service: "kabaddi-live-api" }),
);
app.use("/api/auth", authRoutes);
app.use("/api/matches", matchRoutes(io));
app.get("/control-panel.html", (_req, res) =>
  res.sendFile(path.join(workspaceRoot, "control-panel.html")),
);
app.get("/display.html", (_req, res) =>
  res.sendFile(path.join(workspaceRoot, "display.html")),
);

io.on("connection", (socket) =>
  socket.on("match:join", (id) => socket.join(`match:${id}`)),
);

if (!config.mongoUri) {
  console.error("MONGODB_URI is required");
  process.exitCode = 1;
} else {
  mongoose
    .connect(config.mongoUri)
    .then(ensureSuperAdmin)
    .then(() =>
      server.listen(config.port, () =>
        console.log(`Kabaddi API listening on ${config.port}`),
      ),
    )
    .catch((error) => {
      console.error("MongoDB connection failed", error.message);
      process.exitCode = 1;
    });
}
