import React, { useState, useEffect, useRef } from 'react';
import { formatFileSize } from '../utils/avatar';
import { getApiUrl } from '../utils/api';

export function FileDownload({ initialCode='', onBack }) {
  const [code, setCode] = useState(initialCode.toUpperCase());
  const [meta, setMeta] = useState(null);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const [prog, setProg] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => { if (initialCode.length===6) lookup(initialCode.toUpperCase()); else inputRef.current?.focus(); }, [initialCode]);

  const lookup = async c => {
    setStatus('loading'); setError(''); setMeta(null);
    try {
      const res = await fetch(`${getApiUrl()}/api/files/${c}/meta`);
      if (res.ok) { setMeta({...await res.json(), code:c}); setStatus('found'); }
      else { setStatus('err'); setError('File not found or expired.'); }
    } catch { setStatus('err'); setError('Cannot connect to server.'); }
  };

  const onChange = v => {
    const u = v.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6);
    setCode(u); setError(''); setMeta(null); setStatus('idle');
    if (u.length===6) lookup(u);
  };

  const download = async () => {
    if (!meta) return;
    setStatus('dl'); setProg(0);
    try {
      const res = await fetch(`${getApiUrl()}/api/files/${meta.code}`);
      if (!res.ok) throw new Error('File unavailable');
      const total = parseInt(res.headers.get('content-length')||'0', 10);
      const reader = res.body.getReader(); const chunks = []; let loaded = 0;
      while (true) {
        const {done,value} = await reader.read();
        if (done) break;
        chunks.push(value); loaded += value.length;
        if (total) setProg(Math.round(loaded/total*100));
      }
      const blob = new Blob(chunks,{type:meta.fileType});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href=url; a.download=meta.fileName; a.click();
      URL.revokeObjectURL(url); setStatus('done');
    } catch(e) { setError(e.message); setStatus('found'); }
  };

  const expired = meta && Date.now()>meta.expiresAt;
  const remaining = meta ? Math.max(0, meta.expiresAt - Date.now()) : 0;
  const hours = Math.floor(remaining/3600000);
  const mins = Math.floor((remaining%3600000)/60000);

  return (
    <div style={{ minHeight:'100vh', background:'var(--bg)', display:'flex', flexDirection:'column', overflow:'auto' }}>
      <div style={{ height:52, borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:12, padding:'0 24px', flexShrink:0 }}>
        <button onClick={onBack} style={{ background:'none', border:'1px solid var(--border)', borderRadius:8, padding:'5px 12px', fontSize:13, color:'var(--text-2)', cursor:'pointer' }}>← Back</button>
        <span style={{ fontWeight:700, fontSize:15, color:'var(--text)' }}>Receive a file</span>
      </div>

      <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', padding:40 }}>
        <div style={{ width:'100%', maxWidth:420 }}>
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:16, padding:28, boxShadow:'var(--shadow)' }}>
            <label style={{ display:'block', fontSize:11, fontWeight:700, color:'var(--text-3)', letterSpacing:'.5px', textTransform:'uppercase', marginBottom:10 }}>File code</label>
            <input ref={inputRef} value={code} onChange={e=>onChange(e.target.value)} placeholder="ABC123" maxLength={6}
              style={{ width:'100%', background:'var(--bg)', border:`1px solid ${meta?'rgba(34,197,94,.4)':error?'#fca5a5':'var(--border)'}`, borderRadius:10, color:'var(--text)', padding:'14px', fontSize:28, fontWeight:700, fontFamily:'JetBrains Mono,monospace', outline:'none', letterSpacing:'8px', boxSizing:'border-box', textTransform:'uppercase', textAlign:'center', marginBottom:20, transition:'border-color .15s' }} />

            {status==='loading' && <div style={{ display:'flex', justifyContent:'center', padding:'16px 0' }}><span style={{ width:24,height:24,border:'2px solid var(--border)',borderTop:'2px solid var(--brown)',borderRadius:'50%',animation:'spin .8s linear infinite',display:'inline-block' }}/></div>}

            {error && <div style={{ background:'#fef2f2', border:'1px solid #fecaca', borderRadius:8, padding:'9px 12px', fontSize:13, color:'#dc2626', marginBottom:14 }}>{error}</div>}

            {meta && (status==='found'||status==='dl'||status==='done') && (
              <div>
                <div style={{ background:'var(--bg)', border:'1px solid var(--border)', borderRadius:12, padding:'14px 16px', marginBottom:16, display:'flex', gap:12, alignItems:'center' }}>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:14, fontWeight:600, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{meta.fileName}</div>
                    <div style={{ fontSize:12, color:'var(--text-3)', marginTop:3, display:'flex', gap:12 }}>
                      <span>{formatFileSize(meta.fileSize)}</span>
                      {!expired && <span style={{ color:'#92400e' }}>{hours}h {mins}m left</span>}
                      {expired && <span style={{ color:'#dc2626' }}>Expired</span>}
                      <span>{meta.downloads} downloads</span>
                    </div>
                  </div>
                </div>

                {status==='dl' && (
                  <div style={{ marginBottom:14 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:'var(--text-3)', marginBottom:6 }}><span>Downloading...</span><span>{prog}%</span></div>
                    <div style={{ height:3, background:'var(--border)', borderRadius:2, overflow:'hidden' }}>
                      <div style={{ height:'100%', width:`${prog}%`, background:'var(--brown)', borderRadius:2, transition:'width .2s' }}/>
                    </div>
                  </div>
                )}

                {status==='done' && <div style={{ background:'rgba(34,197,94,.08)', border:'1px solid rgba(34,197,94,.2)', borderRadius:8, padding:'10px', textAlign:'center', fontSize:13, color:'#16a34a', fontWeight:600, marginBottom:14 }}>Download complete</div>}

                <button onClick={download} disabled={expired||status==='dl'} style={{ width:'100%', background:expired?'var(--border)':'var(--brown)', color:expired?'var(--text-3)':'#fff', border:'none', borderRadius:10, padding:'13px', fontSize:14, fontWeight:600, cursor:expired?'default':'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
                  {status==='dl'?<><span style={{ width:14,height:14,border:'2px solid rgba(255,255,255,.3)',borderTop:'2px solid #fff',borderRadius:'50%',animation:'spin .8s linear infinite',display:'inline-block' }}/>Downloading...</>:status==='done'?'Download again':'Download file'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
