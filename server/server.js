/**
 * Vault — Unified Production Server
 * Serves: Static frontend + WebSocket signaling + REST API
 * Single port for Render.com deployment
 */

const WebSocket = require('ws');
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3001;
const STATIC_DIR = path.join(__dirname, '../client/dist');

// ── Stores ────────────────────────────────────────────────────────────────────
const sessions = new Map();   // roomCode → { host, viewers, chat, presence, createdAt }
const clients  = new Map();   // ws → { id, role, roomCode, name }
const fileStore = new Map();  // code → { fileName, fileSize, fileType, fileData, uploadedAt, expiresAt, downloads }
const FILE_EXPIRY_MS = 24 * 60 * 60 * 1000;

function generateRoomCode() { return crypto.randomBytes(3).toString('hex').toUpperCase(); }
function generateFileCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}
function generateId() { return crypto.randomBytes(8).toString('hex'); }
function send(ws, data) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
}
function broadcastToRoom(roomCode, data, excludeWs = null) {
  const session = sessions.get(roomCode);
  if (!session) return;
  if (session.host && session.host !== excludeWs) send(session.host, data);
  session.viewers.forEach((vWs) => { if (vWs !== excludeWs) send(vWs, data); });
}

// Purge expired files every 10 min
setInterval(() => {
  const now = Date.now();
  for (const [code, f] of fileStore) { if (now > f.expiresAt) fileStore.delete(code); }
}, 10 * 60 * 1000);

// ── MIME types for static serving ────────────────────────────────────────────
const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
  '.woff': 'font/woff', '.ttf': 'font/ttf', '.webp': 'image/webp',
};

// ── HTTP Server ───────────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const urlObj = new URL(req.url, `http://localhost`);
  const pathname = urlObj.pathname;

  // ── Health ──
  if (pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', sessions: sessions.size, files: fileStore.size }));
    return;
  }

  // ── POST /api/files — upload ──
  if (pathname === '/api/files' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 75 * 1024 * 1024) req.destroy(new Error('Too large')); });
    req.on('end', () => {
      try {
        const { fileName, fileSize, fileType, fileData } = JSON.parse(body);
        if (!fileName || !fileData) throw new Error('Missing fields');
        if (fileSize > 50 * 1024 * 1024) throw new Error('Max 50MB');
        const code = generateFileCode();
        const now = Date.now();
        fileStore.set(code, { fileName, fileSize, fileType: fileType || 'application/octet-stream', fileData, uploadedAt: now, expiresAt: now + FILE_EXPIRY_MS, downloads: 0 });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ code, expiresAt: now + FILE_EXPIRY_MS }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    req.on('error', () => { res.writeHead(413); res.end(JSON.stringify({ error: 'Too large' })); });
    return;
  }

  // ── GET /api/files/:code/meta ──
  const metaMatch = pathname.match(/^\/api\/files\/([A-Z0-9]{6})\/meta$/);
  if (metaMatch) {
    const f = fileStore.get(metaMatch[1]);
    if (!f || Date.now() > f.expiresAt) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Not found or expired' })); return; }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ fileName: f.fileName, fileSize: f.fileSize, fileType: f.fileType, uploadedAt: f.uploadedAt, expiresAt: f.expiresAt, downloads: f.downloads }));
    return;
  }

  // ── GET /api/files/:code — download ──
  const dlMatch = pathname.match(/^\/api\/files\/([A-Z0-9]{6})$/);
  if (dlMatch) {
    const f = fileStore.get(dlMatch[1]);
    if (!f || Date.now() > f.expiresAt) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Not found or expired' })); return; }
    const base64 = f.fileData.includes(',') ? f.fileData.split(',')[1] : f.fileData;
    const buf = Buffer.from(base64, 'base64');
    f.downloads++;
    res.writeHead(200, { 'Content-Type': f.fileType, 'Content-Disposition': `attachment; filename="${encodeURIComponent(f.fileName)}"`, 'Content-Length': buf.length, 'Cache-Control': 'no-store' });
    res.end(buf);
    return;
  }

  // ── GET /api/session/:code/meta ──
  const sessMatch = pathname.match(/^\/api\/session\/([A-Z0-9]{6})\/meta$/);
  if (sessMatch) {
    const session = sessions.get(sessMatch[1]);
    if (!session) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Not found' })); return; }
    const hostInfo = clients.get(session.host);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ roomCode: sessMatch[1], hostName: hostInfo?.name || 'Host', viewerCount: session.viewers.size, createdAt: session.createdAt }));
    return;
  }


  // ── GET /api/turn — return TURN credentials to client ──
  if (pathname === '/api/turn') {
    // These are the Open Relay Project free TURN servers (no signup, public)
    // For production with heavy usage, get free credentials at: https://www.metered.ca/tools/openrelay/
    const iceServers = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
      { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
      { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
      { urls: 'turns:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
    ];
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
    res.end(JSON.stringify({ iceServers }));
    return;
  }

  // ── Serve static files ──
  if (fs.existsSync(STATIC_DIR)) {
    let filePath = path.join(STATIC_DIR, pathname === '/' ? 'index.html' : pathname);
    
    // SPA fallback — serve index.html for all non-asset routes
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(STATIC_DIR, 'index.html');
    }
    
    if (fs.existsSync(filePath)) {
      const ext = path.extname(filePath);
      const mime = MIME[ext] || 'application/octet-stream';
      const content = fs.readFileSync(filePath);
      res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000' });
      res.end(content);
      return;
    }
  }

  res.writeHead(404);
  res.end('Not found');
});

// ── WebSocket ─────────────────────────────────────────────────────────────────
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  const clientId = generateId();
  clients.set(ws, { id: clientId, role: null, roomCode: null, name: 'Anonymous' });

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    const client = clients.get(ws);
    const { type } = msg;

    if (type === 'host') {
      const roomCode = generateRoomCode();
      sessions.set(roomCode, { host: ws, viewers: new Map(), chat: [], presence: {}, createdAt: Date.now() });
      client.role = 'host'; client.roomCode = roomCode; client.name = msg.name || 'Host';
      send(ws, { type: 'room-created', roomCode, clientId });
    }

    else if (type === 'viewer') {
      const { roomCode, name } = msg;
      const session = sessions.get(roomCode);
      if (!session) { send(ws, { type: 'error', message: 'Room not found.' }); return; }
      client.role = 'viewer'; client.roomCode = roomCode; client.name = name || 'Viewer';
      session.viewers.set(clientId, ws);
      const hostInfo = clients.get(session.host);
      send(ws, { type: 'room-joined', roomCode, clientId, hostName: hostInfo?.name, viewerCount: session.viewers.size, chatHistory: session.chat.slice(-50), presence: Object.values(session.presence || {}) });
      send(session.host, { type: 'viewer-joined', viewerId: clientId, name: client.name, viewerCount: session.viewers.size });
      broadcastToRoom(roomCode, { type: 'viewer-count', count: session.viewers.size });
    }

    else if (type === 'offer') {
      const session = sessions.get(client.roomCode);
      if (!session) return;
      const targetWs = session.viewers.get(msg.targetId);
      if (targetWs) send(targetWs, { type: 'offer', sdp: msg.sdp, hostName: client.name });
    }

    else if (type === 'answer') {
      const session = sessions.get(client.roomCode);
      if (!session) return;
      send(session.host, { type: 'answer', sdp: msg.sdp, viewerId: client.id });
    }

    else if (type === 'ice') {
      const session = sessions.get(client.roomCode);
      if (!session) return;
      if (client.role === 'host') {
        const targetWs = session.viewers.get(msg.targetId);
        if (targetWs) send(targetWs, { type: 'ice', candidate: msg.candidate });
      } else {
        send(session.host, { type: 'ice', candidate: msg.candidate, viewerId: client.id });
      }
    }

    else if (type === 'chat') {
      const session = sessions.get(client.roomCode);
      if (!session) return;
      const chatMsg = { type: 'chat', id: generateId(), senderId: client.id, name: client.name, text: msg.text, timestamp: Date.now() };
      session.chat.push(chatMsg);
      if (session.chat.length > 200) session.chat.shift();
      broadcastToRoom(client.roomCode, chatMsg);
    }

    else if (type === 'typing') {
      broadcastToRoom(client.roomCode, { type: 'typing', senderId: client.id, name: client.name, isTyping: msg.isTyping }, ws);
    }

    else if (type === 'presence') {
      const session = sessions.get(client.roomCode);
      if (session) {
        session.presence[client.id] = { senderId: client.id, name: client.name, x: msg.x, y: msg.y };
      }
      broadcastToRoom(client.roomCode, { type: 'presence', senderId: client.id, name: client.name, x: msg.x, y: msg.y }, ws);
    }

    else if (type === 'activity') {
      broadcastToRoom(client.roomCode, { type: 'activity', emoji: msg.emoji, x: msg.x, y: msg.y }, ws);
    }

    else if (type === 'ping') { send(ws, { type: 'pong' }); }
  });

  ws.on('close', () => {
    const client = clients.get(ws);
    if (!client) return;
    const { role, roomCode, name, id } = client;
    if (roomCode && sessions.has(roomCode)) {
      const session = sessions.get(roomCode);
      if (role === 'host') {
        broadcastToRoom(roomCode, { type: 'host-left' }, ws);
        sessions.delete(roomCode);
      } else if (role === 'viewer') {
        session.viewers.delete(id);
        delete session.presence[id];
        if (session.host) send(session.host, { type: 'viewer-left', viewerId: id, name, viewerCount: session.viewers.size });
        broadcastToRoom(roomCode, { type: 'viewer-count', count: session.viewers.size });
      }
    }
    clients.delete(ws);
  });

  ws.on('error', (err) => console.error('[WS]', err.message));

  const ping = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) ws.ping();
    else clearInterval(ping);
  }, 30000);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} in use. Kill the process or use a different PORT.`);
    console.error(`Try: lsof -i :${PORT} then kill -9 <PID>`);
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, () => {
  console.log(`🔐 Vault running on port ${PORT}`);
  console.log(`   Static: ${fs.existsSync(STATIC_DIR) ? STATIC_DIR : '(not built yet)'}`);
});

// ── TURN credential endpoint ──────────────────────────────────────────────────
// In production, replace these with credentials from your TURN provider
// Free options: Metered.ca (100GB/month free), Cloudflare TURN (beta)
