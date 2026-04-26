import React, { useRef, useEffect, useState } from 'react';

export function VideoPlayer({ stream, label, isHost = false }) {
  const videoRef     = useRef(null);
  const containerRef = useRef(null);
  const [playing, setPlaying]     = useState(false);
  const [loading, setLoading]     = useState(true);
  const [isFs, setIsFs]           = useState(false);
  const [muted, setMuted]         = useState(isHost); // host preview muted, viewer unmuted
  const [volume, setVolume]       = useState(1);
  const [showVol, setShowVol]     = useState(false);
  const attempts = useRef(0);

  useEffect(() => {
    if (!stream) { setLoading(true); setPlaying(false); return; }

    const tryAttach = () => {
      const v = videoRef.current;
      if (!v) {
        if (attempts.current++ < 20) setTimeout(tryAttach, 100);
        return;
      }
      attempts.current = 0;
      if (v.srcObject === stream) return;

      v.srcObject  = stream;
      v.muted      = isHost; // Only mute host's own preview
      v.playsInline = true;
      v.volume     = volume;

      const play = async () => {
        try {
          await v.play();
          setPlaying(true);
          setLoading(false);
        } catch (err) {
          // Autoplay blocked — browser requires muted first, then unmute
          if (err.name === 'NotAllowedError') {
            v.muted = true;
            try {
              await v.play();
              setPlaying(true);
              setLoading(false);
              // Unmute after play starts (if not host)
              if (!isHost) {
                setTimeout(() => { v.muted = false; }, 200);
              }
            } catch (e2) {
              setTimeout(play, 500);
            }
          } else {
            setTimeout(play, 400);
          }
        }
      };

      v.onloadedmetadata = play;
      if (v.readyState >= 2) play();
    };

    tryAttach();
  }, [stream, isHost]);

  useEffect(() => {
    const fn = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', fn);
    return () => document.removeEventListener('fullscreenchange', fn);
  }, []);

  // F key for fullscreen
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'f' || e.key === 'F') {
        const el = document.activeElement?.tagName;
        if (el === 'INPUT' || el === 'TEXTAREA') return;
        e.preventDefault();
        if (!document.fullscreenElement) containerRef.current?.requestFullscreen?.();
        else document.exitFullscreen?.();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const toggleFs = () => {
    if (!document.fullscreenElement) containerRef.current?.requestFullscreen?.();
    else document.exitFullscreen?.();
  };

  const handleVolume = (v) => {
    setVolume(v);
    if (videoRef.current) videoRef.current.volume = v;
    if (v === 0) setMuted(true);
    else { setMuted(false); if (videoRef.current) videoRef.current.muted = false; }
  };

  const toggleMute = () => {
    const newMuted = !muted;
    setMuted(newMuted);
    if (videoRef.current) videoRef.current.muted = newMuted;
  };

  return (
    <div ref={containerRef} style={{ position:'relative', width:'100%', height:'100%', background:'#0a0a0a', borderRadius: isFs ? 0 : 12, overflow:'hidden', display:'flex', alignItems:'center', justifyContent:'center' }}>

      <video ref={videoRef} autoPlay playsInline style={{ width:'100%', height:'100%', objectFit:'contain', display:stream?'block':'none' }} />

      {!stream && (
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:14, color:'rgba(255,255,255,.35)' }}>
          <div style={{ width:44,height:44,border:'2px solid rgba(255,255,255,.15)',borderTop:'2px solid rgba(255,255,255,.5)',borderRadius:'50%',animation:'spin 1s linear infinite' }}/>
          <span style={{ fontSize:13,fontFamily:'Inter,sans-serif' }}>{isHost?'Click "Share screen" to begin':'Waiting for stream...'}</span>
        </div>
      )}

      {stream && loading && (
        <div style={{ position:'absolute',inset:0,background:'rgba(10,10,10,.6)',display:'flex',alignItems:'center',justifyContent:'center' }}>
          <div style={{ width:32,height:32,border:'2px solid rgba(255,255,255,.1)',borderTop:'2px solid rgba(255,255,255,.7)',borderRadius:'50%',animation:'spin .8s linear infinite' }}/>
        </div>
      )}

      {/* Controls bar */}
      {stream && (
        <div className="vid-ctrl" style={{ position:'absolute',bottom:0,left:0,right:0,padding:'28px 16px 12px',background:'linear-gradient(transparent,rgba(0,0,0,.7))',display:'flex',alignItems:'center',justifyContent:'space-between',opacity:0,transition:'opacity .2s' }}>
          <div style={{ display:'flex',alignItems:'center',gap:10 }}>
            {/* Live dot */}
            <div style={{ display:'flex',alignItems:'center',gap:6 }}>
              <div style={{ width:7,height:7,borderRadius:'50%',background:playing?'#22c55e':'#f59e0b' }}/>
              <span style={{ fontSize:11,color:'rgba(255,255,255,.8)',fontWeight:600,fontFamily:'Inter,sans-serif' }}>{playing?'LIVE':'Connecting...'}</span>
            </div>

            {/* Volume (viewer only) */}
            {!isHost && (
              <div style={{ display:'flex',alignItems:'center',gap:6,position:'relative' }}>
                <button onClick={toggleMute} style={{ background:'rgba(255,255,255,.12)',border:'none',borderRadius:6,padding:'4px 8px',color:'#fff',fontSize:12,cursor:'pointer' }}>
                  {muted ? '🔇' : volume > 0.5 ? '🔊' : '🔉'}
                </button>
                <input type="range" min={0} max={1} step={0.05} value={muted ? 0 : volume}
                  onChange={e => handleVolume(parseFloat(e.target.value))}
                  style={{ width:70,accentColor:'#fff',cursor:'pointer' }} />
              </div>
            )}
          </div>

          <button onClick={toggleFs} style={{ background:'rgba(255,255,255,.12)',border:'none',borderRadius:7,padding:'5px 10px',color:'#fff',fontSize:12,cursor:'pointer',fontFamily:'Inter,sans-serif',fontWeight:500 }}>
            {isFs?'Exit fullscreen [Esc]':'Fullscreen [F]'}
          </button>
        </div>
      )}

      {label && !isFs && (
        <div style={{ position:'absolute',top:10,left:10,background:'rgba(0,0,0,.55)',color:'rgba(255,255,255,.8)',fontSize:11,padding:'3px 8px',borderRadius:6,fontWeight:500,fontFamily:'Inter,sans-serif' }}>
          {label}
        </div>
      )}

      <style>{`.vid-ctrl{opacity:0!important}*:hover>.vid-ctrl,*:focus-within>.vid-ctrl{opacity:1!important}`}</style>
    </div>
  );
}
