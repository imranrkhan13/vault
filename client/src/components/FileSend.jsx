import React, { useState, useRef, useCallback } from 'react';
import { formatFileSize } from '../utils/avatar';
import { getApiUrl } from '../utils/api';

function fileIcon(type) {
  if (!type) return '📄';
  if (type.startsWith('image/')) return '🖼️';
  if (type.startsWith('video/')) return '🎬';
  if (type.startsWith('audio/')) return '🎵';
  if (type.includes('pdf')) return '📕';
  if (type.includes('zip')||type.includes('tar')) return '🗜️';
  return '📄';
}

export function FileSend({ onBack }) {
  const [file, setFile] = useState(null);
  const [drag, setDrag] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [cc, setCc] = useState(false);
  const [cl, setCl] = useState(false);
  const ref = useRef(null);

  const pick = f => {
    if (!f) return;
    if (f.size > 50*1024*1024) { setError('Max 50MB'); return; }
    setFile(f); setError(''); setResult(null);
  };

  const upload = useCallback(async () => {
    if (!file) return;
    setUploading(true); setProgress(0); setError('');
    try {
      const fileData = await new Promise((res,rej) => {
        const r = new FileReader();
        r.onload = e => res(e.target.result);
        r.onerror = rej;
        r.onprogress = e => { if(e.lengthComputable) setProgress(Math.round(e.loaded/e.total*50)); };
        r.readAsDataURL(file);
      });
      setProgress(65);
      const res = await fetch(`${getApiUrl()}/api/files`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({fileName:file.name,fileSize:file.size,fileType:file.type,fileData}) });
      if (!res.ok) throw new Error((await res.json()).error||'Upload failed');
      setProgress(100); setResult(await res.json());
    } catch(e) { setError(e.message); }
    finally { setUploading(false); }
  }, [file]);

  const dl = result ? `${window.location.origin}/download/${result.code}` : '';

  return (
    <div style={{ minHeight:'100vh', background:'var(--bg)', display:'flex', flexDirection:'column', overflow:'auto' }}>
      <div style={{ height:52, borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:12, padding:'0 24px', flexShrink:0 }}>
        <button onClick={onBack} style={{ background:'none', border:'1px solid var(--border)', borderRadius:8, padding:'5px 12px', fontSize:13, color:'var(--text-2)', cursor:'pointer' }}>← Back</button>
        <span style={{ fontWeight:700, fontSize:15, color:'var(--text)' }}>Send a file</span>
        <span style={{ fontSize:12, color:'var(--text-3)' }}>Max 50MB · 24h expiry</span>
      </div>

      <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', padding:40 }}>
        <div style={{ width:'100%', maxWidth:460 }}>
          {!result ? (
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:16, padding:28, boxShadow:'var(--shadow)' }}>
              <div
                onDragOver={e=>{e.preventDefault();setDrag(true);}}
                onDragLeave={()=>setDrag(false)}
                onDrop={e=>{e.preventDefault();setDrag(false);pick(e.dataTransfer.files[0]);}}
                onClick={()=>!file&&ref.current?.click()}
                style={{ border:`2px dashed ${drag?'var(--brown-3)':file?'var(--border-2)':'var(--border)'}`, borderRadius:12, padding:'32px 20px', textAlign:'center', cursor:file?'default':'pointer', background:drag?'rgba(45,27,14,.03)':'transparent', marginBottom:16, transition:'all .15s' }}>
                {file ? (
                  <div style={{ display:'flex', alignItems:'center', gap:12, textAlign:'left' }}>
                    <span style={{ fontSize:32 }}>{fileIcon(file.type)}</span>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:14, fontWeight:600, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{file.name}</div>
                      <div style={{ fontSize:12, color:'var(--text-3)', marginTop:2 }}>{formatFileSize(file.size)}</div>
                    </div>
                    <button onClick={e=>{e.stopPropagation();setFile(null);}} style={{ background:'none', border:'none', fontSize:18, color:'var(--text-3)', cursor:'pointer', flexShrink:0 }}>×</button>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize:13, fontWeight:600, color:'var(--text-2)', marginBottom:4 }}>Drop file here</div>
                    <div style={{ fontSize:12, color:'var(--text-3)' }}>or click to browse</div>
                  </div>
                )}
              </div>

              {uploading && (
                <div style={{ marginBottom:14 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:'var(--text-3)', marginBottom:6 }}><span>Uploading...</span><span>{progress}%</span></div>
                  <div style={{ height:3, background:'var(--border)', borderRadius:2, overflow:'hidden' }}>
                    <div style={{ height:'100%', width:`${progress}%`, background:'var(--brown)', borderRadius:2, transition:'width .3s' }}/>
                  </div>
                </div>
              )}

              {error && <div style={{ background:'#fef2f2', border:'1px solid #fecaca', borderRadius:8, padding:'9px 12px', fontSize:13, color:'#dc2626', marginBottom:14 }}>{error}</div>}

              <button onClick={upload} disabled={!file||uploading} style={{ width:'100%', background:file&&!uploading?'var(--brown)':'var(--border)', color:file&&!uploading?'#fff':'var(--text-3)', border:'none', borderRadius:10, padding:'13px', fontSize:14, fontWeight:600, cursor:file&&!uploading?'pointer':'default', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
                {uploading&&<span style={{ width:14,height:14,border:'2px solid rgba(255,255,255,.3)',borderTop:'2px solid #fff',borderRadius:'50%',animation:'spin .8s linear infinite',display:'inline-block' }}/>}
                {uploading?'Uploading...':'Generate code & link'}
              </button>
              <input ref={ref} type="file" style={{ display:'none' }} onChange={e=>e.target.files[0]&&pick(e.target.files[0])} />
            </div>
          ) : (
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:16, padding:28, boxShadow:'var(--shadow)' }}>
              <div style={{ textAlign:'center', marginBottom:24, paddingBottom:24, borderBottom:'1px solid var(--border)' }}>
                <div style={{ fontSize:13, color:'var(--text-3)', marginBottom:4 }}>{file?.name}</div>
                <div style={{ fontSize:12, color:'var(--text-3)' }}>{formatFileSize(file?.size)} · expires in 24 hours</div>
              </div>

              <div style={{ marginBottom:12 }}>
                <div style={{ fontSize:11, fontWeight:700, color:'var(--text-3)', letterSpacing:'.5px', textTransform:'uppercase', marginBottom:8 }}>6-char code</div>
                <div style={{ display:'flex', alignItems:'center', gap:10, background:'var(--bg)', border:'1px solid var(--border)', borderRadius:10, padding:'12px 16px' }}>
                  <span style={{ fontFamily:'JetBrains Mono,monospace', fontSize:28, fontWeight:700, letterSpacing:'6px', color:'var(--brown)', flex:1 }}>{result.code}</span>
                  <button onClick={()=>{navigator.clipboard.writeText(result.code);setCc(true);setTimeout(()=>setCc(false),2000);}} style={{ background:cc?'rgba(34,197,94,.1)':'var(--surface)', border:`1px solid ${cc?'rgba(34,197,94,.3)':'var(--border)'}`, borderRadius:8, padding:'6px 12px', fontSize:12, fontWeight:600, color:cc?'#16a34a':'var(--text-2)', cursor:'pointer' }}>{cc?'Copied':'Copy'}</button>
                </div>
              </div>

              <div style={{ marginBottom:20 }}>
                <div style={{ fontSize:11, fontWeight:700, color:'var(--text-3)', letterSpacing:'.5px', textTransform:'uppercase', marginBottom:8 }}>Direct link</div>
                <div style={{ display:'flex', alignItems:'center', gap:10, background:'var(--bg)', border:'1px solid var(--border)', borderRadius:10, padding:'10px 14px' }}>
                  <span style={{ fontSize:12, color:'var(--text-3)', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontFamily:'monospace' }}>{dl}</span>
                  <button onClick={()=>{navigator.clipboard.writeText(dl);setCl(true);setTimeout(()=>setCl(false),2000);}} style={{ background:cl?'rgba(34,197,94,.1)':'var(--surface)', border:`1px solid ${cl?'rgba(34,197,94,.3)':'var(--border)'}`, borderRadius:8, padding:'6px 12px', fontSize:12, fontWeight:600, color:cl?'#16a34a':'var(--text-2)', cursor:'pointer', flexShrink:0 }}>{cl?'Copied':'Copy'}</button>
                </div>
              </div>

              <button onClick={()=>{setFile(null);setResult(null);setProgress(0);}} style={{ width:'100%', background:'var(--bg)', border:'1px solid var(--border)', borderRadius:10, padding:'11px', fontSize:14, color:'var(--text-2)', cursor:'pointer' }}>Send another file</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
