import dns from "dns";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

// Load default .env first, then .env.local explicitly to override
dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "../.env.local") });

const configureDns = () => {
  const configuredServers = process.env.DNS_SERVERS?.split(",")
    .map((server) => server.trim())
    .filter(Boolean);
  const currentServers = dns.getServers();

  if (configuredServers?.length) {
    dns.setServers(configuredServers);
    return;
  }

  if (currentServers.length === 0 || currentServers.every((server) => server === "127.0.0.1" || server === "::1")) {
    dns.setServers(["1.1.1.1", "8.8.8.8"]);
  }
};

configureDns();

import express from "express";
import cors from "cors";
import http from "http";
import { WebSocketServer } from "ws";
import { connectDB, closeDB } from "./utils/db.js";
import { errorHandler } from "./middleware/errorHandler.js";
import authRoutes from "./routes/auth.js";
import predictionsRoutes from "./routes/predictions.js";
import leaderboardRoutes from "./routes/leaderboard.js";
import adminRoutes from "./routes/admin.js";
import discussionsRoutes from "./routes/discussions.js";
import driversRoutes from "./routes/drivers.js";
import openF1Routes from "./routes/openf1.js";
import formula1Routes from "./routes/formula1.js";
import notificationRoutes from "./routes/notifications.js";
import { Driver } from "./models/Driver.js";
import { User } from "./models/User.js";
import { appUrl } from "./utils/appUrl.js";
import { verifyToken } from "./utils/jwt.js";

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const PORT = process.env.PORT || 3000;

// WebSocket connection management
interface ClientInfo {
  userId: string;
  discussionId: string;
  token: string;
}

const clients = new Map<any, ClientInfo>();

wss.on("connection", (ws) => {
  console.log("New WebSocket connection");

  ws.on("message", async (data: string) => {
    try {
      const message = JSON.parse(data);
      
      if (message.type === "join") {
        if (!message.token) {
          ws.close(4001, "Unauthorized");
          return;
        }
        const payload = verifyToken(message.token);
        if (!payload) {
          ws.close(4001, "Unauthorized");
          return;
        }
        const currentUser = await User.findById(payload.userId);
        if (!currentUser || (currentUser.tokenVersion || 0) !== (payload.tokenVersion || 0)) {
          ws.close(4001, "Session expired");
          return;
        }
        // User joins a discussion room
        clients.set(ws, { userId: payload.userId, discussionId: message.discussionId, token: message.token });
        
        // Notify others in the same discussion
        broadcastToDiscussion(message.discussionId, {
          type: "user-joined",
          userId: payload.userId,
          userName: payload.name,
        }, ws);
      } else if (message.type === "message") {
        const clientInfo = clients.get(ws);
        if (!clientInfo) {
          ws.close(4001, "Unauthorized");
          return;
        }
        const payload = verifyToken(clientInfo.token);
        const currentUser = payload && await User.findById(payload.userId);
        if (!payload || !currentUser || (currentUser.tokenVersion || 0) !== (payload.tokenVersion || 0)) {
          ws.close(4001, "Session expired"); return;
        }
        // Broadcast message to all clients in the same discussion
        broadcastToDiscussion(clientInfo.discussionId, {
          type: "new-message",
          messageId: message.messageId,
          discussionId: clientInfo.discussionId,
          userId: clientInfo.userId,
          userName: message.userName,
          content: message.content,
          timestamp: new Date(),
        });
      } else if (message.type === "poll-vote") {
        const clientInfo = clients.get(ws);
        if (!clientInfo) {
          ws.close(4001, "Unauthorized");
          return;
        }
        const payload = verifyToken(clientInfo.token);
        const currentUser = payload && await User.findById(payload.userId);
        if (!payload || !currentUser || (currentUser.tokenVersion || 0) !== (payload.tokenVersion || 0)) {
          ws.close(4001, "Session expired"); return;
        }
        // Broadcast poll update to all clients in the same discussion
        broadcastToDiscussion(clientInfo.discussionId, {
          type: "poll-updated",
          pollId: message.pollId,
          voteCounts: message.voteCounts,
        });
      }
    } catch (error) {
      console.error("WebSocket message error:", error);
    }
  });

  ws.on("close", () => {
    const clientInfo = clients.get(ws);
    if (clientInfo) {
      // Notify others that user left
      broadcastToDiscussion(clientInfo.discussionId, {
        type: "user-left",
        userId: clientInfo.userId,
      });
      clients.delete(ws);
    }
  });
});

function broadcastToDiscussion(discussionId: string, message: any, exclude?: any) {
  clients.forEach((clientInfo, client) => {
    if (clientInfo.discussionId === discussionId && client !== exclude && client.readyState === 1) {
      client.send(JSON.stringify(message));
    }
  });
}

const allowedOrigins = process.env.CORS_ORIGINS?.split(",").map((o) => o.trim()).filter(Boolean) || [
  "http://localhost:5173",
  "http://localhost:8080",
  "http://localhost:8081",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:8080",
  "http://127.0.0.1:8081",
  "https://f1-predictor-pro-six.vercel.app",
  "https://f1predict.dev",
  "https://www.f1predict.dev"
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1 || allowedOrigins.includes("*")) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
}));
app.use(express.json({ limit: "1mb" }));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/predictions", predictionsRoutes);
app.use("/api/leaderboard", leaderboardRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/discussions", discussionsRoutes);
app.use("/api/drivers", driversRoutes);
app.use("/api/openf1", openF1Routes);
app.use("/api/formula1", formula1Routes);
app.use("/api/notifications", notificationRoutes);

// Health check
app.get("/health", (req, res) => {
  res.json({ success: true, message: "Server is running" });
});

// Error handling
app.use(errorHandler);



// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, error: "Route not found" });
});

// Start server
async function startServer() {
  try {
    appUrl();
    // Connect to MongoDB
    await connectDB();

    // Ensure drivers are seeded initially
    await Driver.seedIfEmpty();

    server.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
      console.log(`🔌 WebSocket available at ws://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

// Graceful shutdown handlers
async function gracefulShutdown(signal: string) {
  console.log(`\nReceived ${signal}. Starting graceful shutdown...`);
  server.close(async () => {
    console.log("HTTP/WebSocket server closed.");
    await closeDB();
    console.log("Graceful shutdown complete.");
    process.exit(0);
  });

  // Force shutdown after 10s
  setTimeout(() => {
    console.error("Could not close connections in time, forcefully shutting down");
    process.exit(1);
  }, 10000);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

startServer();
