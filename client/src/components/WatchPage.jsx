import React, { useState, useEffect, useRef } from 'react';
import { getApiUrl } from '../utils/api';

export function WatchPage({ initialCode='', onJoin, onBack }) {
  const [code, setCode] = useState(initialCode.toUpperCase());
  const [name, setName] = useState('');
  const [meta, setMeta] = useState(null);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  useEffect(() => { if (initialCode.length===6) check(initialCode.toUpperCase()); else inputRef.current?.focus(); }, [initialCode]);

  const check = async c => {
    setStatus('checking'); setError('');
    try {
      const res = await fetch(`${getApiUrl()}/api/session/${c}/meta`);
      if (res.ok) { setMeta(await res.json()); setStatus('found'); }
      else { setStatus('err'); setError('Room not found or stream ended.'); }
    } catch { setStatus('err'); setError('Cannot connect.'); }
  };

  const onChange = v => {
    const u = v.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6);
    setCode(u); setMeta(null); setStatus('idle'); setError('');
    if (u.length===6) check(u);
  };

  const doJoin = () => { if (name.trim()&&code&&status==='found') onJoin(name.trim(),code); };

  return (
    <div style={{ minHeight:'100vh', background:'var(--bg)', display:'flex', flexDirection:'column', overflow:'auto' }}>
      <div style={{ height:52, borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:12, padding:'0 24px', flexShrink:0 }}>
        <button onClick={onBack} style={{ background:'none', border:'1px solid var(--border)', borderRadius:8, padding:'5px 12px', fontSize:13, color:'var(--text-2)', cursor:'pointer' }}>← Back</button>
        <span style={{ fontWeight:700, fontSize:15, color:'var(--text)' }}>Join a stream</span>
      </div>
      <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', padding:40 }}>
        <div style={{ width:'100%', maxWidth:400 }}>
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:16, padding:28, boxShadow:'var(--shadow)' }}>
            <label style={{ display:'block', fontSize:11, fontWeight:700, color:'var(--text-3)', letterSpacing:'.5px', textTransform:'uppercase', marginBottom:10 }}>Room code</label>
            <input ref={inputRef} value={code} onChange={e=>onChange(e.target.value)} placeholder="ABC123" maxLength={6}
              style={{ width:'100%', background:'var(--bg)', border:`1px solid ${meta?'rgba(34,197,94,.4)':error?'#fca5a5':'var(--border)'}`, borderRadius:10, color:'var(--text)', padding:'14px', fontSize:28, fontWeight:700, fontFamily:'JetBrains Mono,monospace', outline:'none', letterSpacing:'8px', boxSizing:'border-box', textTransform:'uppercase', textAlign:'center', marginBottom:16, transition:'border-color .15s' }} />

            {status==='checking' && <div style={{ display:'flex', justifyContent:'center', padding:'12px 0' }}><span style={{ width:20,height:20,border:'2px solid var(--border)',borderTop:'2px solid var(--brown)',borderRadius:'50%',animation:'spin .8s linear infinite',display:'inline-block' }}/></div>}
            {error && <div style={{ background:'#fef2f2', border:'1px solid #fecaca', borderRadius:8, padding:'9px 12px', fontSize:13, color:'#dc2626', marginBottom:14 }}>{error}</div>}

            {meta && status==='found' && (
              <div style={{ background:'rgba(34,197,94,.07)', border:'1px solid rgba(34,197,94,.2)', borderRadius:10, padding:'12px 14px', marginBottom:16, display:'flex', alignItems:'center', gap:8 }}>
                <span style={{ width:7,height:7,borderRadius:'50%',background:'#22c55e',display:'inline-block',animation:'liveDot 2s infinite',flexShrink:0 }}/>
                <div>
                  <div style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{meta.hostName} is live</div>
                  <div style={{ fontSize:11, color:'var(--text-3)', marginTop:1 }}>{meta.viewerCount} viewer{meta.viewerCount!==1?'s':''} watching</div>
                </div>
              </div>
            )}

            {(status==='found'||(code.length===6&&status!=='checking')) && (
              <div style={{ marginBottom:16 }}>
                <label style={{ display:'block', fontSize:11, fontWeight:700, color:'var(--text-3)', letterSpacing:'.5px', textTransform:'uppercase', marginBottom:8 }}>Your name</label>
                <input autoFocus={status==='found'} value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>e.key==='Enter'&&doJoin()} placeholder="Display name"
                  style={{ width:'100%', background:'var(--bg)', border:'1px solid var(--border)', borderRadius:10, color:'var(--text)', padding:'11px 14px', fontSize:14, fontWeight:500, outline:'none', boxSizing:'border-box' }}
                  onFocus={e=>e.target.style.borderColor='var(--brown-3)'}
                  onBlur={e=>e.target.style.borderColor='var(--border)'} />
              </div>
            )}

            <button onClick={doJoin} disabled={status!=='found'||!name.trim()} style={{ width:'100%', background:status==='found'&&name.trim()?'var(--brown)':'var(--border)', color:status==='found'&&name.trim()?'#fff':'var(--text-3)', border:'none', borderRadius:10, padding:'13px', fontSize:14, fontWeight:600, cursor:status==='found'&&name.trim()?'pointer':'default' }}>
              Join stream
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
