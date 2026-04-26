import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { VideoPlayer } from './VideoPlayer';
import { PresenceAvatar, AvatarSVG, getColor } from './Avatar';
import { formatTime } from '../utils/avatar';
import { useWebRTC } from '../hooks/useWebRTC';

const FUN_ACTIONS = [
  { id:'confetti', emoji:'🎉', label:'Confetti' },
  { id:'wave',     emoji:'👋', label:'Wave' },
  { id:'fire',     emoji:'🔥', label:'Fire' },
  { id:'clap',     emoji:'👏', label:'Applause' },
  { id:'heart',    emoji:'❤️', label:'Love' },
];

export function ViewerRoom({ roomCode, userName, userId, hostName, wsRef, sendMessage, chatHistory = [], viewerCount, onLeave }) {
  const [remoteStream, setRemoteStream]     = useState(null);
  const [connState, setConnState]           = useState('connecting');
  const [messages, setMessages]             = useState(chatHistory);
  const [typingUsers, setTypingUsers]       = useState([]);
  const [myPos, setMyPos]                   = useState({ x: 130, y: 160 });
  const [myInputOpen, setMyInputOpen]       = useState(false);
  const [myInputValue, setMyInputValue]     = useState('');
  const [myBubble, setMyBubble]             = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [otherPresence, setOtherPresence]   = useState({});
  const [effects, setEffects]               = useState([]);
  const [showFun, setShowFun]               = useState(false);
  const [showChat, setShowChat]             = useState(false);
  const [unread, setUnread]                 = useState(0);
  const [copiedCode, setCopiedCode]         = useState(false);
  const [fsElement, setFsElement]           = useState(null);

  const bubbleTimer  = useRef(null);
  const typingTimer  = useRef(null);
  const presenceTimer = useRef(null);
  const chatEndRef   = useRef(null);
  const videoWrapRef = useRef(null);
  const myPosRef     = useRef(myPos);

  useEffect(() => { myPosRef.current = myPos; }, [myPos]);

  const { handleOffer, handleIceCandidate, cleanupAll } = useWebRTC({
    wsRef, role: 'viewer',
    onRemoteStream: useCallback((stream) => {
      console.log('[Viewer] Got remote stream');
      setRemoteStream(stream);
    }, []),
    onConnectionStateChange: useCallback((state) => {
      console.log('[Viewer] Connection state:', state);
      setConnState(state);
      window.dispatchEvent(new CustomEvent('webrtc-state', { detail: state }));
    }, []),
  });

  // ── Broadcast my position so host and others can see me ──────────────────
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
    // Send presence immediately on join and every 3s
    const t = setTimeout(() => {
      broadcastPresence();
      presenceTimer.current = setInterval(broadcastPresence, 3000);
    }, 500); // small delay so WS is fully ready
    return () => { clearTimeout(t); clearInterval(presenceTimer.current); };
  }, [broadcastPresence]);

  useEffect(() => {
    document.addEventListener('fullscreenchange', () => setFsElement(document.fullscreenElement || null));
    return () => document.removeEventListener('fullscreenchange', () => {});
  }, []);

  // ── Incoming WS ───────────────────────────────────────────────────────────
  useEffect(() => {
    window.__vaultViewerHandler = (msg) => {
      switch (msg.type) {
        case 'offer': handleOffer(msg.sdp); break;
        case 'ice':   handleIceCandidate(msg.candidate, 'host'); break;
        case 'host-left': setConnState('host-left'); setRemoteStream(null); break;

        case 'chat':
          setMessages(p => [...p, msg]);
          if (!showChat) setUnread(u => u + 1);
          if (msg.senderId !== userId) {
            setOtherPresence(p => ({
              ...p,
              [msg.senderId]: { ...(p[msg.senderId] || { name: msg.name, x: 80, y: 160 }), message: msg.text, isTyping: false },
            }));
            setTimeout(() => setOtherPresence(p => ({
              ...p, [msg.senderId]: { ...(p[msg.senderId] || {}), message: '' },
            })), 4500);
          }
          break;

        case 'typing':
          if (msg.name !== userName && msg.senderId !== userId) {
            setOtherPresence(p => ({
              ...p,
              [msg.senderId || msg.name]: { ...(p[msg.senderId || msg.name] || { name: msg.name, x: 80, y: 160 }), isTyping: msg.isTyping },
            }));
            setTypingUsers(p => msg.isTyping ? [...new Set([...p, msg.name])] : p.filter(u => u !== msg.name));
          }
          break;

        case 'presence':
          // Any user's position (host or other viewers)
          if (msg.senderId !== userId) {
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
          }
          break;

        case 'viewer-joined':
          // Another viewer joined — add them to presence with a default position
          if (msg.viewerId !== userId) {
            setOtherPresence(p => ({
              ...p,
              [msg.viewerId]: { name: msg.name, x: 200 + Object.keys(p).length * 80, y: 160, message: '', isTyping: false },
            }));
            // Announce our presence to them
            setTimeout(() => broadcastPresence(), 300);
          }
          break;

        case 'viewer-left':
          setOtherPresence(p => { const n = { ...p }; delete n[msg.viewerId]; return n; });
          break;

        case 'activity':
          spawnEffects(msg.emoji, msg.x, msg.y);
          break;
      }
    };
    return () => { window.__vaultViewerHandler = null; };
  }, [showChat, userId, userName, handleOffer, handleIceCandidate, broadcastPresence]);

  // When room-joined arrives from App.jsx, it includes existing presence data
  // That's handled in App.jsx by passing it in chatHistory/initial state

  useEffect(() => () => cleanupAll(), [cleanupAll]);
  useEffect(() => {
    if (showChat) { setUnread(0); setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50); }
  }, [showChat, messages]);

  const spawnEffects = (emoji, nx, ny) => {
    const px = (nx || .5) * window.innerWidth, py = (ny || .5) * window.innerHeight;
    const batch = Array.from({ length: 10 }, (_, i) => ({ id: Date.now() + i, emoji, x: px - 60 + Math.random() * 120, y: py - 80 - Math.random() * 80 }));
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

  // Broadcast when position changes
  useEffect(() => { broadcastPresence(); }, [myPos, broadcastPresence]);

  const sendChat = useCallback((text) => {
    const msg = { type: 'chat', text, senderId: userId, name: userName };
    sendMessage(msg);
    setMessages(p => [...p, { ...msg, id: Date.now().toString(), timestamp: Date.now() }]);
    setMyBubble(text);
    setMyInputOpen(false); setMyInputValue('');
    clearTimeout(bubbleTimer.current);
    bubbleTimer.current = setTimeout(() => setMyBubble(''), 4500);
  }, [sendMessage, userId, userName]);

  const handleMyInput = (val) => {
    setMyInputValue(val);
    sendMessage({ type: 'typing', isTyping: !!val });
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => sendMessage({ type: 'typing', isTyping: false }), 2000);
  };

  const stateInfo = { connecting:{color:'#f59e0b',label:'Connecting...'}, checking:{color:'#f59e0b',label:'Connecting...'}, connected:{color:'#22c55e',label:'Live'}, failed:{color:'#ef4444',label:'Failed'}, 'host-left':{color:'#9ca3af',label:'Stream ended'} }[connState] || {color:'#f59e0b',label:'Connecting...'};
  const copyCode = () => { navigator.clipboard.writeText(roomCode); setCopiedCode(true); setTimeout(() => setCopiedCode(false), 2000); };

  const portalTarget = fsElement || document.body;

  const presencePortal = ReactDOM.createPortal(
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 2147483640 }}>
      <style>{`
        @keyframes av-pop  { from{transform:scale(.7);opacity:0} to{transform:scale(1);opacity:1} }
        @keyframes av-ring { 0%{transform:scale(1);opacity:.7} 100%{transform:scale(1.6);opacity:0} }
        @keyframes av-dot  { 0%,60%,100%{transform:translateY(0);opacity:.4} 30%{transform:translateY(-4px);opacity:1} }
        @keyframes av-conf { 0%{transform:translateY(0) rotate(0);opacity:1} 100%{transform:translateY(80px) rotate(420deg);opacity:0} }
      `}</style>

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

      {/* All other users — filter self */}
      {Object.entries(otherPresence)
        .filter(([id]) => id !== userId)
        .map(([id, p]) => (
          <PresenceAvatar key={id}
            name={p.name || '?'} x={p.x || 80} y={p.y || 160}
            isSelf={false} message={p.message} isTyping={p.isTyping}
          />
        ))}

      {effects.map(e => (
        <div key={e.id} style={{ position: 'fixed', left: e.x, top: e.y, fontSize: 28, lineHeight: 1, animation: 'av-conf 1.6s ease forwards', pointerEvents: 'none', zIndex: 2147483647 }}>{e.emoji}</div>
      ))}

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
      {!fsElement && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 52, zIndex: 400, background: 'rgba(253,250,246,.96)', backdropFilter: 'blur(12px)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 14px', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontWeight: 800, fontSize: 16, color: 'var(--brown)', letterSpacing: '-0.5px' }}>Vault</span>
            <span style={{ fontSize: 13, color: 'var(--text-3)' }}>Watching <strong style={{ color: 'var(--text-2)' }}>{hostName}</strong></span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: stateInfo.color }} />
              <span style={{ fontSize: 12, color: stateInfo.color, fontWeight: 600 }}>{stateInfo.label}</span>
            </div>
            <button onClick={copyCode} style={{ background: 'none', border: `1px solid ${copiedCode ? 'rgba(34,197,94,.4)' : 'var(--border-2)'}`, borderRadius: 8, padding: '3px 8px', fontFamily: 'JetBrains Mono, monospace', fontSize: 12, fontWeight: 700, color: copiedCode ? '#16a34a' : 'var(--brown-2)', letterSpacing: '2px', cursor: 'pointer' }}>{roomCode}</button>
            {viewerCount > 1 && <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{viewerCount} watching</span>}
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <div style={{ position: 'relative' }}>
              <TBtn onClick={() => setShowFun(p => !p)}>Reactions</TBtn>
              {showFun && <FunMenu onSelect={doActivity} />}
            </div>
            <button onClick={() => { setShowChat(p => !p); setUnread(0); }} style={{ background: showChat ? 'var(--brown)' : 'var(--bg)', color: showChat ? '#fff' : 'var(--text-2)', border: `1px solid ${showChat ? 'var(--brown)' : 'var(--border)'}`, borderRadius: 8, padding: '6px 12px', fontSize: 13, fontWeight: 500, cursor: 'pointer', position: 'relative' }}>
              Chat {unread > 0 && <Badge>{unread}</Badge>}
            </button>
            <TBtn danger onClick={onLeave}>Leave</TBtn>
          </div>
        </div>
      )}

      <div ref={videoWrapRef} style={{ position: 'fixed', top: fsElement ? 0 : 52, left: 0, right: !fsElement && showChat ? 340 : 0, bottom: 0, padding: fsElement ? 0 : 12, background: '#0a0a0a', transition: 'right .2s' }}>
        {connState === 'host-left'
          ? <div style={{ width:'100%',height:'100%',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:14,background:'var(--bg)',borderRadius:12 }}>
              <div style={{ fontSize:16,fontWeight:700,color:'var(--brown)' }}>Stream ended</div>
              <button onClick={onLeave} style={{ background:'var(--brown)',color:'#fff',border:'none',borderRadius:10,padding:'10px 20px',fontSize:14,fontWeight:600,cursor:'pointer' }}>Back to lobby</button>
            </div>
          : <VideoPlayer stream={remoteStream} label={fsElement ? null : `${hostName}'s screen`} />
        }
      </div>

      {!fsElement && showChat && (
        <div style={{ position:'fixed',top:52,right:0,bottom:0,width:340,background:'var(--surface)',borderLeft:'1px solid var(--border)',display:'flex',flexDirection:'column',zIndex:350 }}>
          <div style={{ padding:'12px 14px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between',alignItems:'center' }}>
            <span style={{ fontWeight:700,fontSize:14,color:'var(--text)' }}>Chat</span>
            <button onClick={() => setShowChat(false)} style={{ background:'none',border:'none',fontSize:18,color:'var(--text-3)',cursor:'pointer' }}>×</button>
          </div>
          <div style={{ flex:1,overflowY:'auto',padding:'8px 0' }}>
            {messages.length===0&&<div style={{ textAlign:'center',padding:'40px 20px',color:'var(--text-3)',fontSize:13 }}>No messages yet</div>}
            {messages.map((m,i) => {
              const self = m.senderId===userId||m.name===userName;
              return (
                <div key={m.id||i} style={{ display:'flex',flexDirection:self?'row-reverse':'row',gap:6,padding:'3px 12px',alignItems:'flex-end' }}>
                  <div style={{ width:24,height:24,borderRadius:'50%',overflow:'hidden',flexShrink:0 }}><AvatarSVG name={m.name||''} size={24}/></div>
                  <div style={{ maxWidth:'74%' }}>
                    {!self&&<div style={{ fontSize:10,color:'var(--text-3)',marginBottom:2,marginLeft:3 }}>{m.name}</div>}
                    <div style={{ background:self?'var(--brown)':'var(--bg)',color:self?'#fff':'var(--text)',padding:'7px 11px',borderRadius:self?'12px 12px 3px 12px':'12px 12px 12px 3px',fontSize:13,lineHeight:1.5,wordBreak:'break-word',border:self?'none':'1px solid var(--border)' }}>{m.text}</div>
                    <div style={{ fontSize:9,color:'var(--text-3)',marginTop:2,textAlign:self?'right':'left',paddingInline:3 }}>{formatTime(m.timestamp)}</div>
                  </div>
                </div>
              );
            })}
            <div ref={chatEndRef}/>
          </div>
          <ViewerChatInput onSend={sendChat} />
        </div>
      )}

      {presencePortal}
    </div>
  );
}

function ViewerChatInput({ onSend }) {
  const [val, setVal] = React.useState('');
  const send = () => { if (val.trim()) { onSend(val.trim()); setVal(''); } };
  return (
    <div style={{ padding:'8px 10px',borderTop:'1px solid var(--border)',display:'flex',gap:6 }}>
      <input value={val} onChange={e=>setVal(e.target.value)} onKeyDown={e=>e.key==='Enter'&&send()} placeholder="Message..." style={{ flex:1,background:'var(--bg)',border:'1px solid var(--border)',borderRadius:8,padding:'7px 10px',fontSize:13,outline:'none',color:'var(--text)',fontFamily:'inherit' }}/>
      <button onClick={send} disabled={!val.trim()} style={{ background:val.trim()?'var(--brown)':'var(--bg)',color:val.trim()?'#fff':'var(--text-3)',border:'1px solid var(--border)',borderRadius:8,width:34,height:34,fontSize:16,cursor:'pointer',flexShrink:0 }}>↑</button>
    </div>
  );
}


function FunMenu({ onSelect }) {
  return (
    <div style={{ position:'absolute',top:'calc(100% + 6px)',right:0,background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,padding:6,boxShadow:'var(--shadow-lg)',zIndex:500,minWidth:140 }}>
      {FUN_ACTIONS.map(a=>(
        <button key={a.id} onClick={()=>onSelect(a)} style={{ display:'flex',alignItems:'center',gap:8,width:'100%',background:'none',border:'none',borderRadius:8,padding:'7px 10px',fontSize:13,color:'var(--text)',cursor:'pointer',fontFamily:'inherit' }}
          onMouseEnter={e=>e.currentTarget.style.background='var(--bg)'}
          onMouseLeave={e=>e.currentTarget.style.background='none'}>
          <span style={{fontSize:16}}>{a.emoji}</span> {a.label}
        </button>
      ))}
    </div>
  );
}

function TBtn({ children, onClick, danger }) {
  return <button onClick={onClick} style={{ background:danger?'rgba(239,68,68,.08)':'var(--bg)',color:danger?'#dc2626':'var(--text-2)',border:`1px solid ${danger?'rgba(239,68,68,.3)':'var(--border)'}`,borderRadius:8,padding:'6px 12px',fontSize:13,fontWeight:500,cursor:'pointer' }}>{children}</button>;
}
function Badge({children}){return <span style={{position:'absolute',top:-4,right:-4,background:'#ef4444',color:'#fff',borderRadius:'50%',width:16,height:16,fontSize:10,display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700}}>{children>9?'9+':children}</span>;}
function KBD({children}){return <kbd style={{background:'rgba(255,255,255,.1)',border:'1px solid rgba(255,255,255,.18)',borderRadius:4,padding:'1px 5px',fontSize:10,fontFamily:'JetBrains Mono, monospace',color:'rgba(255,255,255,.6)'}}>{children}</kbd>;}
