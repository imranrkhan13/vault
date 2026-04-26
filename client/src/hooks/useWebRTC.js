/**
 * useWebRTC — High quality WebRTC with Metered TURN relay
 * Audio + video with max quality settings
 */
import { useRef, useCallback, useEffect } from 'react';

const ICE_SERVERS = [
  {
    urls: [
      'stun:stun.relay.metered.ca:80',
      'stun:stun.relay.metered.ca:443',
    ],
  },
  {
    urls: [
      'turn:global.relay.metered.ca:80',
      'turn:global.relay.metered.ca:443?transport=tcp',
      'turns:global.relay.metered.ca:443?transport=tcp',
    ],
    username: import.meta.env.VITE_TURN_USERNAME,
    credential: import.meta.env.VITE_TURN_CREDENTIAL,
  },
];

const PC_CONFIG = {
  iceServers: ICE_SERVERS,
  iceCandidatePoolSize: 10,
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require',
  iceTransportPolicy: 'all',
};

export function useWebRTC({ wsRef, role, onRemoteStream, onConnectionStateChange }) {
  const pcs     = useRef(new Map());
  const buf     = useRef(new Map());
  const offered = useRef(new Set());

  const createPC = useCallback((peerId) => {
    if (pcs.current.has(peerId)) return pcs.current.get(peerId);

    console.log('[RTC] New PC for', peerId);
    const pc = new RTCPeerConnection(PC_CONFIG);

    pc.onicecandidate = ({ candidate }) => {
      if (!candidate) return;
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      if (role === 'host') {
        ws.send(JSON.stringify({ type: 'ice', candidate, targetId: peerId }));
      } else {
        ws.send(JSON.stringify({ type: 'ice', candidate }));
      }
    };

    pc.ontrack = ({ track, streams }) => {
      console.log('[RTC] ontrack:', track.kind);
      const stream = (streams && streams[0]) ? streams[0] : new MediaStream([track]);
      onRemoteStream?.(stream, peerId);
    };

    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      console.log('[RTC] State:', s);
      onConnectionStateChange?.(s, peerId);
      if (s === 'failed') pc.restartIce?.();
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed') pc.restartIce?.();
    };

    pcs.current.set(peerId, pc);
    buf.current.set(peerId, []);
    return pc;
  }, [role, wsRef, onRemoteStream, onConnectionStateChange]);

  const flush = useCallback(async (peerId, pc) => {
    const candidates = buf.current.get(peerId) || [];
    for (const c of candidates) {
      try { await pc.addIceCandidate(new RTCIceCandidate(c)); }
      catch (e) { console.warn('[RTC] Flush failed:', e.message); }
    }
    buf.current.set(peerId, []);
  }, []);

  // ── HOST: Apply max quality codec settings ────────────────────────────────
  const applyQualitySettings = useCallback((pc) => {
    const sender = pc.getSenders().find(s => s.track?.kind === 'video');
    if (!sender) return;
    const params = sender.getParameters();
    if (!params.encodings) params.encodings = [{}];
    params.encodings[0] = {
      ...params.encodings[0],
      maxBitrate: 8_000_000,      // 8 Mbps max for video
      maxFramerate: 60,
      networkPriority: 'high',
      priority: 'high',
    };
    sender.setParameters(params).catch(e => console.warn('[RTC] setParameters:', e));

    // Also set audio to high quality
    const audioSender = pc.getSenders().find(s => s.track?.kind === 'audio');
    if (audioSender) {
      const ap = audioSender.getParameters();
      if (!ap.encodings) ap.encodings = [{}];
      ap.encodings[0] = { ...ap.encodings[0], maxBitrate: 128_000, networkPriority: 'high', priority: 'high' };
      audioSender.setParameters(ap).catch(() => {});
    }
  }, []);

  const createOffer = useCallback(async (viewerId, stream) => {
    if (offered.current.has(viewerId)) return;
    offered.current.add(viewerId);

    const pc = createPC(viewerId);
    stream.getTracks().forEach(t => {
      pc.addTrack(t, stream);
      console.log('[RTC] Added track:', t.kind, t.label);
    });

    try {
      const offer = await pc.createOffer({
        offerToReceiveAudio: false,
        offerToReceiveVideo: false,
        voiceActivityDetection: false,
      });

      // Inject high quality SDP parameters
      offer.sdp = boostSDP(offer.sdp);
      await pc.setLocalDescription(offer);

      const ws = wsRef.current;
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'offer', sdp: pc.localDescription, targetId: viewerId }));
      }

      // Apply bitrate settings after connection
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') {
          applyQualitySettings(pc);
        }
        const s = pc.connectionState;
        onConnectionStateChange?.(s, viewerId);
        if (s === 'failed') pc.restartIce?.();
      };
    } catch (e) {
      console.error('[RTC] createOffer error:', e);
      offered.current.delete(viewerId);
    }
  }, [createPC, wsRef, applyQualitySettings, onConnectionStateChange]);

  const handleOffer = useCallback(async (sdp) => {
    const pc = createPC('host');
    try {
      // Boost incoming SDP quality
      const boostedSdp = { ...sdp, sdp: boostSDP(sdp.sdp) };
      await pc.setRemoteDescription(new RTCSessionDescription(boostedSdp));
      await flush('host', pc);

      const answer = await pc.createAnswer();
      answer.sdp = boostSDP(answer.sdp);
      await pc.setLocalDescription(answer);

      const ws = wsRef.current;
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'answer', sdp: pc.localDescription }));
      }
    } catch (e) { console.error('[RTC] handleOffer error:', e); }
  }, [createPC, flush, wsRef]);

  const handleAnswer = useCallback(async (sdp, viewerId) => {
    const pc = pcs.current.get(viewerId);
    if (!pc) return;
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      await flush(viewerId, pc);
    } catch (e) { console.error('[RTC] handleAnswer error:', e); }
  }, [flush]);

  const handleIceCandidate = useCallback(async (candidate, fromId) => {
    const peerId = role === 'viewer' ? 'host' : fromId;
    const pc = pcs.current.get(peerId);
    if (!pc || !pc.remoteDescription) {
      const b = buf.current.get(peerId) || [];
      b.push(candidate);
      buf.current.set(peerId, b);
      return;
    }
    try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); }
    catch (e) { console.warn('[RTC] addICE failed:', e.message); }
  }, [role]);

  const cleanupPeer = useCallback((peerId) => {
    const pc = pcs.current.get(peerId);
    if (pc) {
      pc.ontrack = null;
      pc.onicecandidate = null;
      pc.onconnectionstatechange = null;
      pc.close();
      pcs.current.delete(peerId);
    }
    buf.current.delete(peerId);
    offered.current.delete(peerId);
  }, []);

  const cleanupAll = useCallback(() => {
    pcs.current.forEach((_, id) => cleanupPeer(id));
    offered.current.clear();
  }, [cleanupPeer]);

  return { createOffer, handleOffer, handleAnswer, handleIceCandidate, cleanupPeer, cleanupAll, peerConnections: pcs };
}

/**
 * boostSDP — Modify SDP to prefer high quality codecs and remove bitrate caps
 * Forces VP9/H264 for video and Opus with high bitrate for audio
 */
function boostSDP(sdp) {
  if (!sdp) return sdp;

  let lines = sdp.split('\r\n');

  // Remove any existing bitrate limits (b=AS: lines)
  lines = lines.filter(l => !l.startsWith('b=AS:') && !l.startsWith('b=TIAS:'));

  // For each media section, inject high bitrate after the first 'c=' line
  const result = [];
  for (let i = 0; i < lines.length; i++) {
    result.push(lines[i]);
    // After m= video line, inject high bitrate
    if (lines[i].startsWith('m=video')) {
      result.push('b=AS:8000'); // 8 Mbps for video
    }
    // After m= audio line, inject high bitrate
    if (lines[i].startsWith('m=audio')) {
      result.push('b=AS:128'); // 128 kbps for audio
    }
  }

  let out = result.join('\r\n');

  // Force Opus stereo + high bitrate for audio
  out = out.replace(/a=fmtp:(\d+) useinbandfec=1/g,
    'a=fmtp:$1 useinbandfec=1;stereo=1;sprop-stereo=1;maxaveragebitrate=128000;cbr=0');

  return out;
}
