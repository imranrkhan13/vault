import React, { useState } from 'react';
import { generateGuestName } from '../utils/avatar';

export function Lobby({ onHost, onJoin, onNavigate }) {
  const [name, setName] = useState(() => generateGuestName());
  const [code, setCode] = useState('');
  const [mode, setMode] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const doHost = async () => {
    if (!name.trim()) return;
    setLoading(true); setError('');
    try { await onHost(name.trim()); }
    catch { setError('Cannot connect to server.'); setLoading(false); }
  };

  const doJoin = async () => {
    if (!name.trim() || !code.trim()) return;
    setLoading(true); setError('');
    try { await onJoin(name.trim(), code.trim().toUpperCase()); }
    catch { setError('Room not found.'); setLoading(false); }
  };

  return (
    <div style={{ minHeight:'100vh', background:'var(--bg)', display:'flex', flexDirection:'column', overflow:'auto' }}>
      {/* Nav */}
      <div style={{ height:52, borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 24px', flexShrink:0 }}>
        <span style={{ fontWeight:800, fontSize:16, color:'var(--brown)', letterSpacing:'-0.5px' }}>Vault</span>
        <div style={{ display:'flex', gap:6 }}>
          <GhostBtn onClick={() => onNavigate?.('/send')}>Send file</GhostBtn>
          <GhostBtn onClick={() => onNavigate?.('/download')}>Receive file</GhostBtn>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', padding:'40px 24px' }}>
        <div style={{ width:'100%', maxWidth:960, display:'grid', gridTemplateColumns:'1fr 400px', gap:64, alignItems:'center' }}>

          {/* Left — hero */}
          <div>
            <div style={{ display:'inline-flex', alignItems:'center', gap:6, background:'rgba(45,27,14,.06)', border:'1px solid var(--border)', borderRadius:99, padding:'4px 12px', marginBottom:24, fontSize:12, fontWeight:600, color:'var(--brown-2)' }}>
              <span style={{ width:6, height:6, borderRadius:'50%', background:'#22c55e', display:'inline-block', animation:'pulse2 2s infinite' }}/>
              No account required
            </div>

            <h1 style={{ fontSize:48, fontWeight:900, color:'var(--text)', letterSpacing:'-2px', lineHeight:1.1, marginBottom:16 }}>
              Share your screen.<br/>
              <span style={{ color:'var(--brown-3)' }}>Instantly.</span>
            </h1>

            <p style={{ fontSize:16, color:'var(--text-3)', lineHeight:1.75, maxWidth:420, marginBottom:40 }}>
              Send a 6-character code. Viewers join and see your screen live — no plugins, no sign-up, no waiting.
            </p>

            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              {[
                { icon:'⬛', label:'P2P encrypted', sub:'Direct WebRTC connection, nothing passes through servers' },
                { icon:'⬛', label:'File transfer', sub:'Send files up to 50MB with a 24-hour download link' },
                { icon:'⬛', label:'Live chat', sub:'Float avatars on the stream and chat in real-time' },
              ].map((f,i) => (
                <div key={i} style={{ display:'flex', alignItems:'flex-start', gap:12 }}>
                  <div style={{ width:32, height:32, borderRadius:8, background:'rgba(45,27,14,.06)', border:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, marginTop:1 }}>
                    {i===0 && <LockIcon />}
                    {i===1 && <FileIcon />}
                    {i===2 && <ChatIcon />}
                  </div>
                  <div>
                    <div style={{ fontSize:14, fontWeight:600, color:'var(--text)', marginBottom:2 }}>{f.label}</div>
                    <div style={{ fontSize:13, color:'var(--text-3)', lineHeight:1.5 }}>{f.sub}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right — form */}
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:16, padding:28, boxShadow:'var(--shadow-lg)' }}>
            <div style={{ marginBottom:20 }}>
              <label style={{ display:'block', fontSize:11, fontWeight:700, color:'var(--text-3)', letterSpacing:'.5px', textTransform:'uppercase', marginBottom:8 }}>Your name</label>
              <input value={name} onChange={e=>setName(e.target.value)} placeholder="Display name"
                style={{ width:'100%', background:'var(--bg)', border:'1px solid var(--border)', borderRadius:10, color:'var(--text)', padding:'11px 14px', fontSize:14, fontWeight:500, outline:'none', boxSizing:'border-box' }}
                onFocus={e=>e.target.style.borderColor='var(--brown-3)'}
                onBlur={e=>e.target.style.borderColor='var(--border)'} />
            </div>

            {!mode && <>
              <Btn primary disabled={!name.trim()} onClick={()=>setMode('host')}><ScreenIcon /> Share my screen</Btn>
              <div style={{ display:'flex', alignItems:'center', gap:10, margin:'10px 0' }}>
                <div style={{ flex:1, height:1, background:'var(--border)' }}/>
                <span style={{ fontSize:12, color:'var(--text-3)' }}>or</span>
                <div style={{ flex:1, height:1, background:'var(--border)' }}/>
              </div>
              <Btn disabled={!name.trim()} onClick={()=>setMode('join')}><EyeIcon /> Watch a stream</Btn>
            </>}

            {mode==='host' && <>
              <p style={{ fontSize:13, color:'var(--text-3)', lineHeight:1.6, marginBottom:14, background:'var(--bg)', border:'1px solid var(--border)', borderRadius:10, padding:'10px 14px' }}>
                A 6-char room code will be generated. Share it with viewers.
              </p>
              {error && <Err>{error}</Err>}
              <div style={{ display:'flex', gap:8 }}>
                <BackBtn onClick={()=>{setMode(null);setError('');}} />
                <Btn primary loading={loading} onClick={doHost} style={{flex:1}}>Start sharing</Btn>
              </div>
            </>}

            {mode==='join' && <>
              <label style={{ display:'block', fontSize:11, fontWeight:700, color:'var(--text-3)', letterSpacing:'.5px', textTransform:'uppercase', marginBottom:8 }}>Room code</label>
              <input value={code} onChange={e=>setCode(e.target.value.toUpperCase())} onKeyDown={e=>e.key==='Enter'&&doJoin()}
                placeholder="ABC123" maxLength={8} autoFocus
                style={{ width:'100%', background:'var(--bg)', border:'1px solid var(--border)', borderRadius:10, color:'var(--text)', padding:'12px 14px', fontSize:24, fontWeight:700, fontFamily:'JetBrains Mono,monospace', outline:'none', letterSpacing:'6px', boxSizing:'border-box', marginBottom:14, textTransform:'uppercase', textAlign:'center' }} />
              {error && <Err>{error}</Err>}
              <div style={{ display:'flex', gap:8 }}>
                <BackBtn onClick={()=>{setMode(null);setError('');}} />
                <Btn primary loading={loading} disabled={!code.trim()} onClick={doJoin} style={{flex:1}}>Join stream</Btn>
              </div>
            </>}

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginTop:18, paddingTop:18, borderTop:'1px solid var(--border)' }}>
              <SmallCard onClick={()=>onNavigate?.('/send')} icon={<UpIcon/>} title="Send file" sub="24h code + link"/>
              <SmallCard onClick={()=>onNavigate?.('/download')} icon={<DownIcon/>} title="Receive file" sub="Enter code"/>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Btn({children,primary,disabled,loading,onClick,style}) {
  return <button disabled={disabled||loading} onClick={onClick} style={{ width:'100%', background:primary?'var(--brown)':'var(--bg)', color:primary?'#fff':'var(--text-2)', border:primary?'none':'1px solid var(--border)', borderRadius:10, padding:'12px', fontSize:14, fontWeight:600, opacity:(disabled||loading)?.4:1, cursor:(disabled||loading)?'not-allowed':'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:8, ...(style||{}) }}>
    {loading && <span style={{ width:14,height:14,border:'2px solid rgba(255,255,255,.3)',borderTop:'2px solid #fff',borderRadius:'50%',animation:'spin .8s linear infinite',display:'inline-block' }}/>}
    {children}
  </button>;
}
function BackBtn({onClick}) { return <button onClick={onClick} style={{ background:'var(--bg)',color:'var(--text-2)',border:'1px solid var(--border)',borderRadius:10,padding:'11px 16px',fontSize:14,cursor:'pointer',fontFamily:'inherit',flexShrink:0 }}>Back</button>; }
function GhostBtn({children,onClick}) { return <button onClick={onClick} style={{ background:'none',border:'none',borderRadius:8,padding:'6px 12px',fontSize:13,fontWeight:500,color:'var(--text-3)',cursor:'pointer' }}>{children}</button>; }
function SmallCard({onClick,icon,title,sub}) { return <button onClick={onClick} style={{ background:'var(--bg)',border:'1px solid var(--border)',borderRadius:10,padding:'12px',textAlign:'left',cursor:'pointer',fontFamily:'inherit',transition:'border-color .15s' }} onMouseEnter={e=>e.currentTarget.style.borderColor='var(--brown-3)'} onMouseLeave={e=>e.currentTarget.style.borderColor='var(--border)'}><div style={{marginBottom:6}}>{icon}</div><div style={{fontSize:12,fontWeight:600,color:'var(--text)'}}>{title}</div><div style={{fontSize:11,color:'var(--text-3)',marginTop:2}}>{sub}</div></button>; }
function Err({children}) { return <div style={{ background:'#fef2f2',border:'1px solid #fecaca',borderRadius:8,padding:'9px 12px',fontSize:13,color:'#dc2626',marginBottom:12 }}>{children}</div>; }

function ScreenIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>; }
function EyeIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>; }
function LockIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--brown-3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>; }
function FileIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--brown-3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>; }
function ChatIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--brown-3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>; }
function UpIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--brown-3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>; }
function DownIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--brown-3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>; }
