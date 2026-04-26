# 🔐 Vault

A real-time screen sharing + file transfer + live chat platform. Zero accounts, zero plugins — just a 6-char code.

```
┌──────────────────────────────────────────────────────────────────┐
│  Host shares screen → Viewers join with code → Everyone can chat │
│  Anyone can send files → 24h links + 6-char codes               │
└──────────────────────────────────────────────────────────────────┘
```

---

## Features

| Feature | Details |
|---|---|
| 🖥️ Screen sharing | WebRTC P2P, host → multiple viewers, fullscreen on both ends |
| 📤 File send | Upload up to 50MB → get a 6-char code + 24h download link |
| 📥 File receive | Enter code or open direct link → instant download |
| 💬 Live chat | Real-time WebSocket chat with avatars, typing indicators |
| 📎 In-chat files | Share files inside the chat; auto-uploaded and coded |
| 👥 Presence | Floating emoji avatars, arrow-key movable |
| 🔗 Shareable links | `/watch/ROOMCODE` and `/download/FILECODE` deep links |

---

## Quick Start

### 1. Clone & install

```bash
git clone <your-repo>
cd vault

# Backend
cd server && npm install

# Frontend
cd ../client && npm install
```

### 2. Configure environment

```bash
# client/.env  (copy from .env.example)
VITE_WS_URL=ws://localhost:3001
VITE_API_URL=http://localhost:3001
```

### 3. Run

**Terminal 1 — backend:**
```bash
cd server
node server.js
# 🔐 Vault Server on ws://localhost:3001
```

**Terminal 2 — frontend:**
```bash
cd client
npm run dev
# → http://localhost:5173
```

That's it. Open two browser tabs, share a room code, and it works.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      Browser (Host)                     │
│                                                         │
│  getDisplayMedia() → RTCPeerConnection → ICE/STUN      │
│  WebSocket ──────────────────────────────────────────┐  │
└──────────────────────────────────────────────────────│──┘
                                                        │
                   ┌────────────────────────────────────▼──┐
                   │        Vault Signaling Server          │
                   │   Node.js  ·  ws  ·  http             │
                   │                                        │
                   │  Sessions Map: roomCode → { host,      │
                   │    viewers, chat }                     │
                   │                                        │
                   │  Files Map: code → { data, expiresAt } │
                   │  (auto-purged after 24h)               │
                   └────────────────────────────────────┬──┘
                                                        │
┌──────────────────────────────────────────────────────│──┐
│                      Browser (Viewer)                   │
│                                                         │
│  WebSocket ◄────────────────────────────────────────────│
│  Offer → Answer → ICE → RTCPeerConnection              │
│  video.srcObject = remoteStream  → plays stream         │
└─────────────────────────────────────────────────────────┘
```

### WebRTC Signal Flow

```
Host                    Server                   Viewer
 │                        │                        │
 │── host (name) ────────►│                        │
 │◄─ room-created ────────│                        │
 │                        │◄─ viewer (code, name) ─│
 │◄─ viewer-joined ───────│── room-joined ─────────►│
 │── offer ──────────────►│── offer ───────────────►│
 │                        │◄─ answer ───────────────│
 │◄─ answer ──────────────│                        │
 │── ice ────────────────►│── ice ─────────────────►│
 │◄─ ice ─────────────────│◄─ ice ──────────────────│
 │                        │                        │
 │◄══════════ P2P video stream (direct) ═══════════│
```

### File Flow

```
Sender                   Server                  Receiver
  │                        │                        │
  │── POST /api/files ─────►│                        │
  │   (base64 body)        │ stores in fileStore     │
  │◄─ { code, expiresAt } ─│                        │
  │                        │                        │
  │   shares code/link     │                        │
  │                        │◄─ GET /api/files/:code/meta
  │                        │── { fileName, size } ──►│
  │                        │◄─ GET /api/files/:code  │
  │                        │── binary stream ────────►│
  │                        │   (auto-deleted 24h)    │
```

---

## Folder Structure

```
vault/
├── server/
│   ├── server.js          # WebSocket signaling + REST API
│   └── package.json
│
└── client/
    ├── index.html
    ├── vite.config.js
    ├── .env.example
    └── src/
        ├── main.jsx
        ├── App.jsx                # Router + state machine
        ├── hooks/
        │   ├── useWebRTC.js       # RTCPeerConnection logic
        │   └── useWebSocket.js    # WS connection + reconnect
        ├── components/
        │   ├── Lobby.jsx          # Landing/home page
        │   ├── HostRoom.jsx       # Screen share host view
        │   ├── ViewerRoom.jsx     # Stream viewer view
        │   ├── ChatPanel.jsx      # Slide-in chat drawer
        │   ├── VideoPlayer.jsx    # Video element + controls
        │   ├── Avatar.jsx         # Static + floating avatars
        │   ├── FileSend.jsx       # Upload → get code/link
        │   ├── FileDownload.jsx   # Enter code → download
        │   └── WatchPage.jsx      # Join stream by code/link
        ├── styles/
        │   └── global.css
        └── utils/
            └── avatar.js          # Emoji avatars, helpers
```

---

## URL Routes

| URL | Description |
|---|---|
| `/` | Home / lobby |
| `/send` | Upload a file, get 24h code + link |
| `/download` | Enter a file code to download |
| `/download/ABC123` | Direct download link (auto-fetches file) |
| `/watch` | Enter a room code to join a stream |
| `/watch/ABC123` | Direct stream join link |
| `/share/ABC123` | Host view with shareable link (auto-set) |

---

## API Reference

### `POST /api/files`
Upload a file as base64. Returns a 6-char code and expiry.

```json
// Request
{
  "fileName": "report.pdf",
  "fileSize": 102400,
  "fileType": "application/pdf",
  "fileData": "data:application/pdf;base64,..."
}

// Response
{
  "code": "AB3K9X",
  "expiresAt": 1714000000000
}
```

### `GET /api/files/:code/meta`
Check file info without downloading.
```json
{
  "fileName": "report.pdf",
  "fileSize": 102400,
  "fileType": "application/pdf",
  "uploadedAt": 1713913600000,
  "expiresAt": 1714000000000,
  "downloads": 3
}
```

### `GET /api/files/:code`
Download the file (binary, triggers browser download).

### `GET /api/session/:code/meta`
Check if a room is live.
```json
{
  "roomCode": "66F2WW",
  "hostName": "Bold Crane",
  "viewerCount": 2,
  "createdAt": 1713913600000
}
```

### `GET /health`
Server health check.

---

## WebSocket Message Types

| Direction | Type | Payload |
|---|---|---|
| Client→Server | `host` | `{ name, avatar }` |
| Client→Server | `viewer` | `{ roomCode, name, avatar }` |
| Client→Server | `offer` | `{ sdp, targetId }` |
| Client→Server | `answer` | `{ sdp }` |
| Client→Server | `ice` | `{ candidate, targetId? }` |
| Client→Server | `chat` | `{ text }` |
| Client→Server | `typing` | `{ isTyping }` |
| Client→Server | `file-share` | `{ fileName, fileCode, fileUrl, ... }` |
| Server→Client | `room-created` | `{ roomCode, clientId }` |
| Server→Client | `room-joined` | `{ roomCode, clientId, hostName, chatHistory }` |
| Server→Client | `viewer-joined` | `{ viewerId, name, viewerCount }` |
| Server→Client | `viewer-left` | `{ viewerId, viewerCount }` |
| Server→Client | `offer` | `{ sdp }` |
| Server→Client | `answer` | `{ sdp, viewerId }` |
| Server→Client | `ice` | `{ candidate }` |
| Server→Client | `chat` | `{ id, name, text, timestamp }` |
| Server→Client | `typing` | `{ name, isTyping }` |
| Server→Client | `host-left` | `{}` |

---

## Production Deployment

### Environment variables

```bash
# server
PORT=3001

# client/.env.production
VITE_WS_URL=wss://your-domain.com/ws
VITE_API_URL=https://your-domain.com
```

### Build frontend

```bash
cd client && npm run build
# Output: client/dist/
```

### Nginx config (SPA + WebSocket + API proxy)

```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;

    # SPA
    root /var/www/vault/client/dist;
    index index.html;
    location / {
        try_files $uri $uri/ /index.html;   # SPA fallback
    }

    # REST API
    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
    }

    # WebSocket signaling
    location /ws {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 3600s;
    }
}
```

> **Note:** With this nginx config, update `VITE_WS_URL=wss://your-domain.com/ws` and the server must listen on `/ws` path. Or just use a subdomain for the WS server directly.

### PM2 (process manager)

```bash
npm install -g pm2
cd server
pm2 start server.js --name vault-server
pm2 save
pm2 startup
```

---

## TURN Server (for NAT traversal in production)

WebRTC works great on the same network or with STUN. For users behind strict firewalls/NATs, add a TURN server.

```js
// In client/src/hooks/useWebRTC.js, add to ICE_SERVERS:
{
  urls: 'turn:your-turn-server.com:3478',
  username: 'vault',
  credential: 'your-secret',
}
```

Free TURN options: [Metered.ca](https://www.metered.ca/tools/openrelay/) · [Xirsys](https://xirsys.com/)

---

## Known Limits & Notes

- **File storage** is in-memory. A server restart loses all files. For production, store files in S3/R2 and save the metadata in Redis.
- **Max file size** is 50MB (base64 inflates ~33%, so actual payload is ~67MB). Configurable in `server.js`.
- **Chat history** keeps last 200 messages per room in memory.
- **STUN only** by default. Add TURN for cross-NAT production deployments.
- **No E2E encryption** on the server API (files rest in memory as base64). WebRTC media is DTLS-encrypted by the spec.

---

## License

MIT
