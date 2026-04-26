import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Lobby } from './components/Lobby';
import { HostRoom } from './components/HostRoom';
import { ViewerRoom } from './components/ViewerRoom';
import { FileSend } from './components/FileSend';
import { FileDownload } from './components/FileDownload';
import { WatchPage } from './components/WatchPage';
import { useWebSocket } from './hooks/useWebSocket';

/**
 * App — URL-aware router + state machine
 *
 * Routes:
 *   /                → lobby
 *   /send            → file send page
 *   /download/:code  → file download page
 *   /watch/:code     → join stream via code
 *   (in-session)     → hosting / viewing
 */
function parseRoute() {
  const path = window.location.pathname;
  const dlMatch   = path.match(/^\/download\/([A-Za-z0-9]{6})$/);
  const watchMatch = path.match(/^\/watch\/([A-Za-z0-9]{6})$/);
  if (dlMatch)     return { page: 'download', code: dlMatch[1].toUpperCase() };
  if (watchMatch)  return { page: 'watch',    code: watchMatch[1].toUpperCase() };
  if (path === '/send')     return { page: 'send' };
  if (path === '/download') return { page: 'download', code: '' };
  if (path === '/watch')    return { page: 'watch',    code: '' };
  return { page: 'lobby' };
}

export default function App() {
  const [route, setRoute] = useState(parseRoute);
  const [appState, setAppState] = useState('idle'); // idle | hosting | viewing
  const [roomCode, setRoomCode] = useState('');
  const [userName, setUserName] = useState('');
  const [userId, setUserId] = useState('');
  const [hostName, setHostName] = useState('');
  const [viewerCount, setViewerCount] = useState(0);
  const [chatHistory, setChatHistory] = useState([]);

  // Update route on browser back/forward
  useEffect(() => {
    const handler = () => setRoute(parseRoute());
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, []);

  const navigate = (path) => {
    window.history.pushState({}, '', path);
    setRoute(parseRoute());
  };

  const onMessage = useCallback((msg) => {
    if (msg.type === 'room-created') {
      setRoomCode(msg.roomCode);
      setUserId(msg.clientId);
      setAppState('hosting');
      window.history.pushState({}, '', `/share/${msg.roomCode}`);
    } else if (msg.type === 'room-joined') {
      setRoomCode(msg.roomCode);
      setUserId(msg.clientId);
      setHostName(msg.hostName || 'Host');
      setViewerCount(msg.viewerCount || 0);
      setChatHistory(msg.chatHistory || []);
      setAppState('viewing');
      window.history.pushState({}, '', `/watch/${msg.roomCode}`);
    } else if (msg.type === 'error') {
      alert(msg.message || 'An error occurred');
    } else if (msg.type === 'viewer-count') {
      setViewerCount(msg.count);
    } else {
      window.__vaultHostHandler?.(msg);
      window.__vaultViewerHandler?.(msg);
    }
  }, []);

  const { wsRef, wsState, sendMessage } = useWebSocket({ onMessage });

  const handleHost = useCallback(async (name) => {
    if (wsState !== 'connected') throw new Error('Not connected');
    setUserName(name);
    sendMessage({ type: 'host', name, avatar: null });
  }, [wsState, sendMessage]);

  const handleJoin = useCallback(async (name, code) => {
    if (wsState !== 'connected') throw new Error('Not connected');
    setUserName(name);
    sendMessage({ type: 'viewer', roomCode: code, name, avatar: null });
  }, [wsState, sendMessage]);

  const handleLeave = useCallback(() => {
    setAppState('idle');
    setRoomCode(''); setUserId(''); setHostName('');
    setViewerCount(0); setChatHistory([]);
    window.__vaultHostHandler = null;
    window.__vaultViewerHandler = null;
    navigate('/');
  }, []);

  const showBanner = wsState === 'disconnected' || wsState === 'failed';

  // Active session overrides URL routing
  if (appState === 'hosting') {
    return (
      <>
        <ConnectionBanner wsState={wsState} />
        <HostRoom
          roomCode={roomCode} userName={userName} userId={userId}
          wsRef={wsRef} sendMessage={sendMessage} viewerCount={viewerCount}
          onLeave={handleLeave}
        />
      </>
    );
  }
  if (appState === 'viewing') {
    return (
      <>
        <ConnectionBanner wsState={wsState} />
        <ViewerRoom
          roomCode={roomCode} userName={userName} userId={userId}
          hostName={hostName} wsRef={wsRef} sendMessage={sendMessage}
          chatHistory={chatHistory} viewerCount={viewerCount} onLeave={handleLeave}
        />
      </>
    );
  }

  // URL-based routing
  if (route.page === 'send') {
    return <FileSend onBack={() => navigate('/')} />;
  }
  if (route.page === 'download') {
    return <FileDownload initialCode={route.code} onBack={() => navigate('/')} />;
  }
  if (route.page === 'watch') {
    return (
      <WatchPage
        initialCode={route.code}
        onJoin={handleJoin}
        onBack={() => navigate('/')}
      />
    );
  }

  // Default: lobby
  return (
    <>
      <ConnectionBanner wsState={wsState} />
      <Lobby onHost={handleHost} onJoin={handleJoin} onNavigate={navigate} />
    </>
  );
}

function ConnectionBanner({ wsState }) {
  if (wsState !== 'disconnected' && wsState !== 'failed') return null;
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
      background: wsState === 'failed' ? '#7f1d1d' : '#78350f',
      color: '#fff', fontSize: 13, padding: '10px 20px',
      textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#fca5a5', animation: 'spin 1s linear infinite' }} />
      {wsState === 'failed' ? 'Could not connect. Please refresh.' : 'Reconnecting...'}
    </div>
  );
}
