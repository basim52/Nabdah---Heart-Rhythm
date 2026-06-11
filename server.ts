import express from "express";
import path from "path";
import { createServer as createHttpServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { createServer as createViteServer } from "vite";

interface Player {
  ws: WebSocket;
  playerName: string;
}

interface Room {
  players: Player[];
  score: number;
  heartHealth: number;
  currentBPM: number;
}

const rooms: Record<string, Room> = {};

async function startServer() {
  const app = express();
  const PORT = 3000;
  const httpServer = createHttpServer(app);

  // 1. Setup API / Health check routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "alive", roomsCount: Object.keys(rooms).length });
  });

  // 2. Setup WebSocket Server for Real-Time Co-op Matchmaking
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  });

  wss.on("connection", (ws: WebSocket) => {
    let currentRoomCode: string | null = null;
    let localPlayerName: string = "نبّاض";

    ws.on("message", (rawMessage: string) => {
      try {
        const payload = JSON.parse(rawMessage);
        const { type, roomCode, playerName, data } = payload;

        switch (type) {
          case "JOIN_ROOM": {
            currentRoomCode = roomCode?.toUpperCase() || "GLOBAL";
            localPlayerName = playerName || "طبيب مجهول";

            if (!rooms[currentRoomCode]) {
              rooms[currentRoomCode] = {
                players: [],
                score: 0,
                heartHealth: 100,
                currentBPM: 72
              };
            }

            const room = rooms[currentRoomCode];

            // Limit room to 2 players for co-op
            if (room.players.length >= 2) {
              ws.send(JSON.stringify({ type: "ERROR", message: "الغرفة ممتلئة بأطباء الطوارئ حالياً." }));
              return;
            }

            // Register player
            room.players.push({ ws, playerName: localPlayerName });

            // Notify everyone in the room
            room.players.forEach((p) => {
              p.ws.send(JSON.stringify({
                type: "PLAYER_JOINED",
                playerName: localPlayerName,
                players: room.players.map((x) => x.playerName),
                isHost: room.players.length === 1
              }));
            });

            // If we have 2 players, kick off the game simultaneously
            if (room.players.length === 2) {
              room.players.forEach((p, idx) => {
                p.ws.send(JSON.stringify({
                  type: "START_MATCH",
                  isHost: idx === 0,
                  partnerName: room.players[1 - idx].playerName
                }));
              });
            }
            break;
          }

          case "GAME_ACTION": {
            if (!currentRoomCode || !rooms[currentRoomCode]) return;
            const room = rooms[currentRoomCode];
            
            // Broadcast game actions (spawns, taps, damages, bpm shifts) to partner client
            room.players.forEach((p) => {
              if (p.ws !== ws) {
                p.ws.send(JSON.stringify({
                  type: "ACTION_BROADCAST",
                  sender: localPlayerName,
                  data
                }));
              }
            });
            break;
          }

          case "PING": {
            ws.send(JSON.stringify({ type: "PONG" }));
            break;
          }
        }
      } catch (err) {
        console.error("WS Message Error", err);
      }
    });

    ws.on("close", () => {
      if (currentRoomCode && rooms[currentRoomCode]) {
        const room = rooms[currentRoomCode];
        room.players = room.players.filter((p) => p.ws !== ws);

        if (room.players.length === 0) {
          delete rooms[currentRoomCode];
        } else {
          // Notify remaining player
          room.players.forEach((p) => {
            p.ws.send(JSON.stringify({
              type: "PARTNER_DISCONNECTED",
              message: `غادر زميلك الطبيب ${localPlayerName} الغرفة.`
            }));
          });
        }
      }
    });
  });

  // 3. Vite development middleware setup
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`[NABDHA SERVER] Listening on http://localhost:${PORT}`);
  });
}

startServer();
