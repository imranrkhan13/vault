import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { VideoPlayer } from './VideoPlayer';
import { PresenceAvatar, AvatarSVG, getColor } from './Avatar';
import { formatTime } from '../utils/avatar';
import { useWebRTC } from '../hooks/useWebRTC';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const FUN_ACTIONS = [
  { id:'confetti', emoji:'🎉', label:'Confetti' },
  { id:'wave',     emoji:'👋', label:'Wave' },
  { id:'fire',     emoji:'🔥', label:'Fire' },
  { id:'clap',     emoji:'👏', label:'Applause' },
  { id:'heart',    emoji:'❤️', label:'Love' },
];

export function HostRoom({ roomCode, userName, userId, wsRef, sendMessage, onLeave }) {
  const [localStream, setLocalStream]       = useState(null);
  const [isSharing, setIsSharing]           = useState(false);
  const [messages, setMessages]             = useState([]);
  const [viewers, setViewers]               = useState([]);
  const [myPos, setMyPos]                   = useState({ x: 90, y: 160 });
  const [myInputOpen, setMyInputOpen]       = useState(false);
  const [myInputValue, setMyInputValue]     = useState('');
  const [myBubble, setMyBubble]             = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [otherPresence, setOtherPresence]   = useState({}); // id → {name,x,y,message,isTyping}
  const [effects, setEffects]               = useState([]);
  const [showFun, setShowFun]               = useState(false);
  const [showChat, setShowChat]             = useState(false);
  const [unread, setUnread]                 = useState(0);
  const [typingUsers, setTypingUsers]       = useState([]);
  const [copiedCode, setCopiedCode]         = useState(false);
  const [copiedLink, setCopiedLink]         = useState(false);
  const [fsElement, setFsElement]           = useState(null);

  const localStreamRef = useRef(null);
  const bubbleTimer    = useRef(null);
  const typingTimer    = useRef(null);
  const presenceTimer  = useRef(null);
  const chatEndRef     = useRef(null);
  const videoWrapRef   = useRef(null);
  const myPosRef       = useRef(myPos);

  // Keep ref in sync for use in intervals/callbacks
  useEffect(() => { myPosRef.current = myPos; }, [myPos]);

  const { createOffer, handleAnswer, handleIceCandidate, cleanupPeer, cleanupAll } = useWebRTC({
    wsRef, role: 'host',
    onRemoteStream: useCallback(() => {}, []),
    onConnectionStateChange: useCallback((state, peerId) => {
      window.dispatchEvent(new CustomEvent('webrtc-state', { detail: state }));
      console.log('[WebRTC] State change:', state, peerId);
    }, []),
  });

  // ── Broadcast my position periodically so others always know where I am ────
  const broadcastPresence = useCallback(() => {
    const pos = myPosRef.current;
    sendMessage({
      type: 'presence',
      name: userName,
      x: pos.x / window.innerWidth,
      y: pos.y / window.innerHeight,
    });
  }, [sendMessage, userName]);

  useEffect(() => {
    // Broadcast immediately and then every 3s
    broadcastPresence();
    presenceTimer.current = setInterval(broadcastPresence, 3000);
    return () => clearInterval(presenceTimer.current);
  }, [broadcastPresence]);

  // ── Fullscreen tracking ────────────────────────────────────────────────────
  useEffect(() => {
    const fn = () => setFsElement(document.fullscreenElement || null);
    document.addEventListener('fullscreenchange', fn);
    return () => document.removeEventListener('fullscreenchange', fn);
  }, []);

  // ── Incoming WS ───────────────────────────────────────────────────────────
  useEffect(() => {
    window.__vaultHostHandler = (msg) => {
      switch (msg.type) {
        case 'viewer-joined':
          setViewers(p => [...p.filter(v => v.id !== msg.viewerId), { id: msg.viewerId, name: msg.name }]);
          setOtherPresence(p => ({
            ...p,
            [msg.viewerId]: {
              name: msg.name,
              x: Math.min(window.innerWidth - 80, 200 + Object.keys(p).length * 90),
              y: 160,
              message: '', isTyping: false,
            },
          }));
          if (localStreamRef.current) setTimeout(() => createOffer(msg.viewerId, localStreamRef.current), 200);
          // Immediately send our presence to the new viewer
          setTimeout(() => broadcastPresence(), 300);
          break;

        case 'viewer-left':
          setViewers(p => p.filter(v => v.id !== msg.viewerId));
          setOtherPresence(p => { const n = { ...p }; delete n[msg.viewerId]; return n; });
          cleanupPeer(msg.viewerId);
          break;

        case 'answer': handleAnswer(msg.sdp, msg.viewerId); break;
        case 'ice':    handleIceCandidate(msg.candidate, msg.viewerId); break;

        case 'chat':
          setMessages(p => [...p, msg]);
          if (!showChat) setUnread(u => u + 1);
          if (msg.senderId !== userId) {
            setOtherPresence(p => ({
              ...p,
              [msg.senderId]: { ...(p[msg.senderId] || { name: msg.name, x: 200, y: 160 }), message: msg.text, isTyping: false },
            }));
            setTimeout(() => setOtherPresence(p => ({
              ...p, [msg.senderId]: { ...(p[msg.senderId] || {}), message: '' },
            })), 4500);
          }
          break;

        case 'typing':
          if (msg.senderId !== userId) {
            setOtherPresence(p => ({
              ...p, [msg.senderId]: { ...(p[msg.senderId] || { name: msg.name, x: 200, y: 160 }), isTyping: msg.isTyping },
            }));
            setTypingUsers(p => msg.isTyping ? [...new Set([...p, msg.name])] : p.filter(u => u !== msg.name));
          }
          break;

        case 'presence':
          // Another user's position update — but host doesn't receive this for themselves
          setOtherPresence(p => ({
            ...p,
            [msg.senderId]: {
              ...(p[msg.senderId] || {}),
              name: msg.name,
              x: msg.x * window.innerWidth,
              y: msg.y * window.innerHeight,
              message: p[msg.senderId]?.message || '',
              isTyping: p[msg.senderId]?.isTyping || false,
            },
          }));
          break;

        case 'activity':
          spawnEffects(msg.emoji, msg.x, msg.y);
          break;
      }
    };
    return () => { window.__vaultHostHandler = null; };
  }, [showChat, userId, userName, createOffer, handleAnswer, handleIceCandidate, cleanupPeer, broadcastPresence]);

  useEffect(() => {
    if (showChat) { setUnread(0); setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50); }
  }, [showChat, messages]);

  const spawnEffects = (emoji, nx, ny) => {
    const px = (nx || 0.5) * window.innerWidth;
    const py = (ny || 0.5) * window.innerHeight;
    const batch = Array.from({ length: 10 }, (_, i) => ({
      id: Date.now() + i, emoji,
      x: px - 60 + Math.random() * 120,
      y: py - 80 - Math.random() * 80,
    }));
    setEffects(p => [...p, ...batch]);
    setTimeout(() => setEffects(p => p.filter(e => !batch.find(b => b.id === e.id))), 1800);
  };

  const doActivity = (item) => {
    const nx = myPosRef.current.x / window.innerWidth;
    const ny = myPosRef.current.y / window.innerHeight;
    spawnEffects(item.emoji, nx, ny);
    sendMessage({ type: 'activity', emoji: item.emoji, x: nx, y: ny });
    setShowFun(false);
  };

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      const inInput = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName);
      const step = 22;
      if (e.key === 'ArrowUp')    { e.preventDefault(); setMyPos(p => ({ ...p, y: Math.max(70, p.y - step) })); return; }
      if (e.key === 'ArrowDown')  { e.preventDefault(); setMyPos(p => ({ ...p, y: Math.min(window.innerHeight - 80, p.y + step) })); return; }
      if (e.key === 'ArrowLeft')  { e.preventDefault(); setMyPos(p => ({ ...p, x: Math.max(50, p.x - step) })); return; }
      if (e.key === 'ArrowRight') { e.preventDefault(); setMyPos(p => ({ ...p, x: Math.min(window.innerWidth - 60, p.x + step) })); return; }
      if (inInput) return;
      if (e.key === 't' || e.key === 'T') { e.preventDefault(); setMyInputOpen(o => !o); setShowEmojiPicker(false); }
      if (e.key === 'e' || e.key === 'E') { e.preventDefault(); setShowEmojiPicker(o => !o); }
      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        if (!document.fullscreenElement) videoWrapRef.current?.requestFullscreen?.();
        else document.exitFullscreen?.();
      }
      if (e.key === 'Escape') { setShowEmojiPicker(false); setShowFun(false); setMyInputOpen(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Broadcast position when it changes
  useEffect(() => {
    broadcastPresence();
  }, [myPos, broadcastPresence]);

  // ── Screen share ──────────────────────────────────────────────────────────
  const startSharing = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: { ideal: 60, max: 60 },
          width:     { ideal: 3840, max: 3840 },  // 4K if available
          height:    { ideal: 2160, max: 2160 },
          cursor:    'always',
        },
        audio: {
          // Capture system/tab audio (works in Chrome when user allows)
          echoCancellation: false,
          noiseSuppression: false,
          sampleRate: 48000,
          sampleSize: 16,
          channelCount: 2,
        },
      });
      localStreamRef.current = stream;
      setLocalStream(stream); setIsSharing(true);
      stream.getVideoTracks()[0].onended = stopSharing;
      viewers.forEach(v => createOffer(v.id, stream));
    } catch (e) { if (e.name !== 'NotAllowedError') console.error(e); }
  };
  const stopSharing = () => {
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null; setLocalStream(null); setIsSharing(false); cleanupAll();
  };
  useEffect(() => () => { localStreamRef.current?.getTracks().forEach(t => t.stop()); cleanupAll(); }, [cleanupAll]);

  // ── Chat ──────────────────────────────────────────────────────────────────
  const sendChat = useCallback((text) => {
    const msg = { type: 'chat', text, senderId: userId, name: userName };
    sendMessage(msg);
    setMessages(p => [...p, { ...msg, id: Date.now().toString(), timestamp: Date.now() }]);
    setMyBubble(text);
    setMyInputOpen(false);
    setMyInputValue('');
    clearTimeout(bubbleTimer.current);
    bubbleTimer.current = setTimeout(() => setMyBubble(''), 4500);
  }, [sendMessage, userId, userName]);

  const handleMyInput = (val) => {
    setMyInputValue(val);
    sendMessage({ type: 'typing', isTyping: !!val });
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => sendMessage({ type: 'typing', isTyping: false }), 2000);
  };

  const copyCode = () => { navigator.clipboard.writeText(roomCode); setCopiedCode(true); setTimeout(() => setCopiedCode(false), 2000); };
  const copyLink = () => { navigator.clipboard.writeText(`${window.location.origin}/watch/${roomCode}`); setCopiedLink(true); setTimeout(() => setCopiedLink(false), 2000); };

  // ── Portal target (fullscreen-aware) ──────────────────────────────────────
  const portalTarget = fsElement || document.body;

  const presencePortal = ReactDOM.createPortal(
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 2147483640 }}>
      <AvatarStyles />
      {/* My avatar */}
      <div style={{ pointerEvents: 'auto' }}>
        <PresenceAvatar
          name={userName} x={myPos.x} y={myPos.y} isSelf
          message={myBubble} inputOpen={myInputOpen} inputValue={myInputValue}
          onInputChange={handleMyInput} onSendMessage={sendChat}
          onClickAvatar={() => { setMyInputOpen(o => !o); setShowEmojiPicker(false); }}
          showEmojiPicker={showEmojiPicker}
          onToggleEmoji={() => setShowEmojiPicker(o => !o)}
          onSendEmoji={(e) => { sendChat(e); setShowEmojiPicker(false); }}
        />
      </div>
      {/* Others — filter out self by userId just in case */}
      {Object.entries(otherPresence)
        .filter(([id]) => id !== userId)
        .map(([id, p]) => (
          <PresenceAvatar key={id}
            name={p.name || '?'} x={p.x || 200} y={p.y || 160}
            isSelf={false} message={p.message} isTyping={p.isTyping}
          />
        ))}
      {/* Effects */}
      {effects.map(e => (
        <div key={e.id} style={{ position: 'fixed', left: e.x, top: e.y, fontSize: 28, lineHeight: 1, animation: 'av-conf 1.6s ease forwards', pointerEvents: 'none', zIndex: 2147483647 }}>{e.emoji}</div>
      ))}
      {/* Hint bar */}
      {!fsElement && (
        <div style={{ position: 'fixed', bottom: 14, left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,.72)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 20, padding: '5px 16px', fontSize: 11, color: 'rgba(255,255,255,.5)', backdropFilter: 'blur(8px)', pointerEvents: 'none', fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap', display: 'flex', gap: 8, alignItems: 'center' }}>
          <KBD>click</KBD>/<KBD>T</KBD> type · <KBD>E</KBD> emoji · <KBD>arrows</KBD> move · <KBD>F</KBD> fullscreen
        </div>
      )}
    </div>,
    portalTarget
  );

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--bg)', overflow: 'hidden', fontFamily: 'Inter, sans-serif' }}>
      {/* Top bar */}
      {!fsElement && (
        <TopBar
          roomCode={roomCode} viewers={viewers}
          copiedCode={copiedCode} onCopyCode={copyCode}
          copiedLink={copiedLink} onCopyLink={copyLink}
          isSharing={isSharing} onStartShare={startSharing} onStopShare={stopSharing}
          showFun={showFun} onToggleFun={() => setShowFun(p => !p)}
          onActivity={doActivity}
          showChat={showChat} unread={unread}
          onToggleChat={() => { setShowChat(p => !p); setUnread(0); }}
          onLeave={onLeave}
        />
      )}

      {/* Video */}
      <div ref={videoWrapRef} style={{ position: 'fixed', top: fsElement ? 0 : 52, left: 0, right: !fsElement && showChat ? 340 : 0, bottom: 0, padding: fsElement ? 0 : 12, background: '#0a0a0a', transition: 'right .2s' }}>
        {isSharing
          ? <VideoPlayer stream={localStream} label={fsElement ? null : 'Your screen'} isHost />
          : !fsElement && <EmptyState onStart={startSharing} viewerCount={viewers.length} />
        }
      </div>

      {/* Chat drawer */}
      {!fsElement && showChat && (
        <ChatDrawer messages={messages} onSend={sendChat} userName={userName} userId={userId} typingUsers={typingUsers} chatEndRef={chatEndRef} onClose={() => setShowChat(false)} />
      )}

      {presencePortal}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function AvatarStyles() {
  return (
    <style>{`
      @keyframes av-pop  { from{transform:scale(.7);opacity:0} to{transform:scale(1);opacity:1} }
      @keyframes av-ring { 0%{transform:scale(1);opacity:.7} 100%{transform:scale(1.6);opacity:0} }
      @keyframes av-dot  { 0%,60%,100%{transform:translateY(0);opacity:.4} 30%{transform:translateY(-4px);opacity:1} }
      @keyframes av-conf { 0%{transform:translateY(0) rotate(0);opacity:1} 100%{transform:translateY(80px) rotate(420deg);opacity:0} }
    `}</style>
  );
}

function TopBar({ roomCode, viewers, copiedCode, onCopyCode, copiedLink, onCopyLink, isSharing, onStartShare, onStopShare, showFun, onToggleFun, onActivity, showChat, unread, onToggleChat, onLeave }) {
  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 52, zIndex: 400, background: 'rgba(253,250,246,.96)', backdropFilter: 'blur(12px)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 14px', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontWeight: 800, fontSize: 16, color: 'var(--brown)', letterSpacing: '-0.5px' }}>Vault</span>
        <button onClick={onCopyCode} style={{ background: copiedCode ? 'rgba(34,197,94,.1)' : 'var(--bg)', border: `1px solid ${copiedCode ? 'rgba(34,197,94,.4)' : 'var(--border-2)'}`, borderRadius: 8, padding: '4px 10px', fontFamily: 'JetBrains Mono, monospace', fontSize: 13, fontWeight: 700, color: copiedCode ? '#16a34a' : 'var(--brown)', letterSpacing: '2px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
          {roomCode} <span style={{ fontSize: 10, letterSpacing: 0, opacity: .6 }}>{copiedCode ? '✓' : 'copy'}</span>
        </button>
        <button onClick={onCopyLink} style={{ background: 'none', border: `1px solid ${copiedLink ? 'rgba(34,197,94,.4)' : 'var(--border)'}`, borderRadius: 8, padding: '4px 10px', fontSize: 12, fontWeight: 500, color: copiedLink ? '#16a34a' : 'var(--text-3)', cursor: 'pointer' }}>
          {copiedLink ? 'Copied' : 'Share link'}
        </button>
        <ViewerPips viewers={viewers} />
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <div style={{ position: 'relative' }}>
          <TBtn onClick={onToggleFun}>Reactions</TBtn>
          {showFun && <FunMenu onSelect={onActivity} />}
        </div>
        <TBtn primary={!isSharing} danger={isSharing} onClick={isSharing ? onStopShare : onStartShare}>
          {isSharing ? 'Stop' : 'Share screen'}
        </TBtn>
        <button onClick={onToggleChat} style={{ background: showChat ? 'var(--brown)' : 'var(--bg)', color: showChat ? '#fff' : 'var(--text-2)', border: `1px solid ${showChat ? 'var(--brown)' : 'var(--border)'}`, borderRadius: 8, padding: '6px 12px', fontSize: 13, fontWeight: 500, cursor: 'pointer', position: 'relative' }}>
          Chat {unread > 0 && <Badge>{unread}</Badge>}
        </button>
        {onLeave && <TBtn danger onClick={onLeave}>End</TBtn>}
      </div>
    </div>
  );
}

function ViewerPips({ viewers }) {
  if (!viewers.length) return <span style={{ fontSize: 12, color: 'var(--text-3)' }}>No viewers</span>;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      {viewers.slice(0, 4).map(v => (
        <div key={v.id} title={v.name} style={{ width: 22, height: 22, borderRadius: '50%', overflow: 'hidden', border: '1.5px solid #fff', marginLeft: -5, boxShadow: '0 1px 4px rgba(0,0,0,.15)' }}>
          <AvatarSVG name={v.name} size={22} />
        </div>
      ))}
      <span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 5 }}>{viewers.length} viewer{viewers.length !== 1 ? 's' : ''}</span>
    </div>
  );
}

function EmptyState({ onStart, viewerCount }) {
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, border: '1.5px dashed var(--border)', borderRadius: 12, background: 'var(--bg)' }}>
      <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--brown)' }}>Ready to share</div>
      <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 8 }}>Your screen streams live to viewers</div>
      <button onClick={onStart} style={{ background: 'var(--brown)', color: '#fff', border: 'none', borderRadius: 10, padding: '11px 22px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Share screen</button>
      {viewerCount > 0 && <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#16a34a', background: 'rgba(34,197,94,.08)', border: '1px solid rgba(34,197,94,.2)', borderRadius: 10, padding: '7px 14px' }}><div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e' }} />{viewerCount} viewer{viewerCount !== 1 ? 's' : ''} waiting</div>}
    </div>
  );
}

function FunMenu({ onSelect }) {
  return (
    <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 6, boxShadow: 'var(--shadow-lg)', zIndex: 500, minWidth: 140 }}>
      {FUN_ACTIONS.map(a => (
        <button key={a.id} onClick={() => onSelect(a)} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: 'none', border: 'none', borderRadius: 8, padding: '7px 10px', fontSize: 13, color: 'var(--text)', cursor: 'pointer', fontFamily: 'inherit' }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
          onMouseLeave={e => e.currentTarget.style.background = 'none'}>
          <span style={{ fontSize: 16 }}>{a.emoji}</span> {a.label}
        </button>
      ))}
    </div>
  );
}

function ChatDrawer({ messages, onSend, userName, userId, typingUsers, chatEndRef, onClose }) {
  const [input, setInput] = useState('');
  const fileRef = useRef(null);
  const send = () => { if (input.trim()) { onSend(input.trim()); setInput(''); } };
  const handleFile = async (file) => {
    if (!file || file.size > 50 * 1024 * 1024) return;
    const r = new FileReader();
    r.onload = async (ev) => {
      let code = null;
      try {
        const res = await fetch(`${API}/api/files`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fileName: file.name, fileSize: file.size, fileType: file.type, fileData: ev.target.result }) });
        if (res.ok) { const d = await res.json(); code = d.code; }
      } catch {}
      onSend(`File: ${file.name}${code ? `  [code: ${code}]` : ''}`);
    };
    r.readAsDataURL(file);
  };
  return (
    <div style={{ position: 'fixed', top: 52, right: 0, bottom: 0, width: 340, background: 'var(--surface)', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', zIndex: 350 }}>
      <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>Chat</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 18, color: 'var(--text-3)', cursor: 'pointer' }}>×</button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        {messages.length === 0 && <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-3)', fontSize: 13 }}>No messages yet</div>}
        {messages.map((m, i) => {
          const self = m.senderId === userId || m.name === userName;
          return (
            <div key={m.id || i} style={{ display: 'flex', flexDirection: self ? 'row-reverse' : 'row', gap: 6, padding: '3px 12px', alignItems: 'flex-end' }}>
              <div style={{ width: 24, height: 24, borderRadius: '50%', overflow: 'hidden', flexShrink: 0 }}><AvatarSVG name={m.name || ''} size={24} /></div>
              <div style={{ maxWidth: '74%' }}>
                {!self && <div style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 2, marginLeft: 3 }}>{m.name}</div>}
                <div style={{ background: self ? 'var(--brown)' : 'var(--bg)', color: self ? '#fff' : 'var(--text)', padding: '7px 11px', borderRadius: self ? '12px 12px 3px 12px' : '12px 12px 12px 3px', fontSize: 13, lineHeight: 1.5, wordBreak: 'break-word', border: self ? 'none' : '1px solid var(--border)' }}>{m.text}</div>
                <div style={{ fontSize: 9, color: 'var(--text-3)', marginTop: 2, textAlign: self ? 'right' : 'left', paddingInline: 3 }}>{formatTime(m.timestamp)}</div>
              </div>
            </div>
          );
        })}
        {typingUsers.filter(u => u !== userName).length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 12px', fontSize: 12, color: 'var(--text-3)' }}>
            <div style={{ display: 'flex', gap: 2 }}>{[0,1,2].map(i => <div key={i} style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--text-3)', animation: `av-dot 1s ${i*.2}s infinite` }}/>)}</div>
            typing...
          </div>
        )}
        <div ref={chatEndRef} />
      </div>
      <div style={{ padding: '8px 10px', borderTop: '1px solid var(--border)', display: 'flex', gap: 6 }}>
        <button onClick={() => fileRef.current?.click()} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, width: 34, height: 34, cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)', fontSize: 16 }}>+</button>
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} placeholder="Message..." style={{ flex: 1, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 10px', fontSize: 13, outline: 'none', color: 'var(--text)', fontFamily: 'inherit' }} />
        <button onClick={send} disabled={!input.trim()} style={{ background: input.trim() ? 'var(--brown)' : 'var(--bg)', color: input.trim() ? '#fff' : 'var(--text-3)', border: '1px solid var(--border)', borderRadius: 8, width: 34, height: 34, fontSize: 16, cursor: 'pointer', flexShrink: 0 }}>↑</button>
        <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={e => e.target.files[0] && handleFile(e.target.files[0])} />
      </div>
    </div>
  );
}

function TBtn({ children, onClick, primary, danger }) {
  return <button onClick={onClick} style={{ background: primary ? 'var(--brown)' : danger ? 'rgba(239,68,68,.08)' : 'var(--bg)', color: primary ? '#fff' : danger ? '#dc2626' : 'var(--text-2)', border: primary ? 'none' : `1px solid ${danger ? 'rgba(239,68,68,.3)' : 'var(--border)'}`, borderRadius: 8, padding: '6px 12px', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>{children}</button>;
}
function Badge({ children }) { return <span style={{ position: 'absolute', top: -4, right: -4, background: '#ef4444', color: '#fff', borderRadius: '50%', width: 16, height: 16, fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>{children > 9 ? '9+' : children}</span>; }
function KBD({ children }) { return <kbd style={{ background: 'rgba(255,255,255,.1)', border: '1px solid rgba(255,255,255,.18)', borderRadius: 4, padding: '1px 5px', fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: 'rgba(255,255,255,.6)' }}>{children}</kbd>; }
