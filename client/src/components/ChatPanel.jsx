import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Avatar } from './Avatar';
import { formatTime, formatFileSize } from '../utils/avatar';

/**
 * ChatPanel — right-side chat drawer
 * Features: message history, file sharing, typing indicators, auto-scroll
 */
export function ChatPanel({ messages, onSend, onFileShare, userName, userId, typingUsers = [], isOpen, onToggle }) {
  const [input, setInput] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const typingTimerRef = useRef(null);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isOpen]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 100);
  }, [isOpen]);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text) return;
    onSend(text);
    setInput('');
  }, [input, onSend]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileSelect = async (file) => {
    if (!file || file.size > 50 * 1024 * 1024) {
      alert('File too large (max 50MB)');
      return;
    }

    // Read file as base64
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const fileData = ev.target.result;

      // Try to upload to server for 24h link + code
      let fileCode = null;
      try {
        const API = import.meta.env.VITE_API_URL || 'http://localhost:3001';
        const res = await fetch(`${API}/api/files`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileName: file.name,
            fileSize: file.size,
            fileType: file.type,
            fileData,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          fileCode = data.code;
        }
      } catch (err) {
        console.warn('[Files] Server upload failed, sharing inline:', err);
      }

      onFileShare({
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        fileUrl: fileData,   // inline fallback
        fileCode,            // server code if uploaded
      });
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  };

  const activeTypingUsers = typingUsers.filter(u => u !== userName);

  return (
    <div style={{
      position: 'fixed',
      right: 0,
      top: 0,
      bottom: 0,
      width: isOpen ? 320 : 0,
      background: '#0a0a0a',
      borderLeft: '1px solid rgba(255,255,255,0.08)',
      display: 'flex',
      flexDirection: 'column',
      transition: 'width 0.25s cubic-bezier(0.4,0,0.2,1)',
      overflow: 'hidden',
      zIndex: 100,
    }}>
      {/* Header */}
      <div style={{
        padding: '16px 20px',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', letterSpacing: '-0.3px' }}>Chat</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
            {messages.length} messages
          </div>
        </div>
        <button onClick={onToggle} style={{
          background: 'rgba(255,255,255,0.06)',
          border: 'none',
          borderRadius: 8,
          width: 32,
          height: 32,
          cursor: 'pointer',
          color: 'rgba(255,255,255,0.6)',
          fontSize: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>×</button>
      </div>

      {/* Messages */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px 0',
          scrollbarWidth: 'thin',
          scrollbarColor: 'rgba(255,255,255,0.1) transparent',
        }}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        {isDragging && (
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(255,255,255,0.05)',
            border: '2px dashed rgba(255,255,255,0.3)',
            borderRadius: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10,
            fontSize: 14,
            color: 'rgba(255,255,255,0.6)',
          }}>
            Drop file to share
          </div>
        )}

        {messages.length === 0 && (
          <div style={{
            textAlign: 'center',
            padding: '40px 20px',
            color: 'rgba(255,255,255,0.25)',
            fontSize: 13,
          }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>💬</div>
            No messages yet
          </div>
        )}

        {messages.map((msg) => {
          const isSelf = msg.senderId === userId || msg.name === userName;

          if (msg.type === 'file-share') {
            return (
              <FileMessage
                key={msg.id}
                msg={msg}
                isSelf={isSelf}
              />
            );
          }

          return (
            <ChatMessage
              key={msg.id || msg.timestamp}
              msg={msg}
              isSelf={isSelf}
            />
          );
        })}

        {/* Typing indicator */}
        {activeTypingUsers.length > 0 && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 16px',
          }}>
            <TypingDots />
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
              {activeTypingUsers.join(', ')} {activeTypingUsers.length === 1 ? 'is' : 'are'} typing
            </span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div style={{
        padding: '12px 16px',
        borderTop: '1px solid rgba(255,255,255,0.08)',
        flexShrink: 0,
      }}>
        <div style={{
          display: 'flex',
          gap: 8,
          alignItems: 'flex-end',
        }}>
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 10,
              width: 38,
              height: 38,
              cursor: 'pointer',
              color: 'rgba(255,255,255,0.5)',
              fontSize: 16,
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            title="Send file"
          >
            📎
          </button>

          <div style={{ flex: 1, position: 'relative' }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message..."
              rows={1}
              style={{
                width: '100%',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 12,
                color: '#fff',
                padding: '10px 14px',
                fontSize: 14,
                fontFamily: 'inherit',
                resize: 'none',
                outline: 'none',
                boxSizing: 'border-box',
                maxHeight: 120,
                lineHeight: 1.5,
              }}
            />
          </div>

          <button
            onClick={handleSend}
            disabled={!input.trim()}
            style={{
              background: input.trim() ? '#fff' : 'rgba(255,255,255,0.08)',
              border: 'none',
              borderRadius: 10,
              width: 38,
              height: 38,
              cursor: input.trim() ? 'pointer' : 'default',
              color: input.trim() ? '#000' : 'rgba(255,255,255,0.3)',
              fontSize: 16,
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s ease',
            }}
          >
            ↑
          </button>
        </div>

        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', marginTop: 6, textAlign: 'center' }}>
          Enter to send · drag & drop files
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        style={{ display: 'none' }}
        onChange={(e) => e.target.files[0] && handleFileSelect(e.target.files[0])}
      />
    </div>
  );
}

function ChatMessage({ msg, isSelf }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: isSelf ? 'row-reverse' : 'row',
      alignItems: 'flex-end',
      gap: 8,
      padding: '4px 16px',
    }}>
      {!isSelf && <Avatar name={msg.name} size={28} />}

      <div style={{ maxWidth: '75%' }}>
        {!isSelf && (
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 3, marginLeft: 4 }}>
            {msg.name}
          </div>
        )}
        <div style={{
          background: isSelf ? '#fff' : 'rgba(255,255,255,0.08)',
          color: isSelf ? '#000' : '#fff',
          padding: '8px 12px',
          borderRadius: isSelf ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
          fontSize: 14,
          lineHeight: 1.5,
          wordBreak: 'break-word',
        }}>
          {msg.text}
        </div>
        <div style={{
          fontSize: 10,
          color: 'rgba(255,255,255,0.25)',
          marginTop: 3,
          textAlign: isSelf ? 'right' : 'left',
          paddingInline: 4,
        }}>
          {formatTime(msg.timestamp)}
        </div>
      </div>
    </div>
  );
}

function FileMessage({ msg, isSelf }) {
  const isImage = msg.fileType?.startsWith('image/');
  const API = import.meta.env.VITE_API_URL || 'http://localhost:3001';
  const [copiedCode, setCopiedCode] = React.useState(false);

  const downloadUrl = msg.fileCode
    ? `${API}/api/files/${msg.fileCode}`
    : msg.fileUrl;

  const copyCode = () => {
    navigator.clipboard.writeText(msg.fileCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  return (
    <div style={{
      display: 'flex', flexDirection: isSelf ? 'row-reverse' : 'row',
      alignItems: 'flex-end', gap: 8, padding: '4px 16px',
    }}>
      {!isSelf && <Avatar name={msg.name} size={28} />}
      <div style={{ maxWidth: '80%' }}>
        {!isSelf && (
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 3, marginLeft: 4 }}>
            {msg.name}
          </div>
        )}
        <div style={{
          background: isSelf ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 12, overflow: 'hidden',
        }}>
          {isImage && (msg.fileUrl || downloadUrl) && (
            <img
              src={msg.fileUrl || downloadUrl}
              alt={msg.fileName}
              style={{ width: '100%', maxHeight: 160, objectFit: 'cover', display: 'block' }}
            />
          )}
          <div style={{ padding: '10px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: msg.fileCode ? 10 : 0 }}>
              <span style={{ fontSize: 18 }}>📄</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {msg.fileName}
                </div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 1 }}>
                  {formatFileSize(msg.fileSize)}
                </div>
              </div>
              <a
                href={downloadUrl}
                download={msg.fileName}
                style={{
                  background: 'rgba(255,255,255,0.12)',
                  border: 'none', borderRadius: 8,
                  padding: '6px 10px', fontSize: 12,
                  color: '#fff', cursor: 'pointer',
                  textDecoration: 'none', fontWeight: 600,
                  whiteSpace: 'nowrap',
                }}
              >
                ⬇️ Save
              </a>
            </div>

            {/* Code row */}
            {msg.fileCode && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: 'rgba(255,255,255,0.06)',
                borderRadius: 8, padding: '6px 10px',
              }}>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Code:</span>
                <span style={{
                  fontFamily: 'monospace', fontSize: 14, fontWeight: 800,
                  letterSpacing: '2px', color: '#fff', flex: 1,
                }}>
                  {msg.fileCode}
                </span>
                <button
                  onClick={copyCode}
                  style={{
                    background: copiedCode ? 'rgba(34,197,94,0.15)' : 'transparent',
                    border: 'none', borderRadius: 6, padding: '3px 8px',
                    fontSize: 11, color: copiedCode ? '#4ade80' : 'rgba(255,255,255,0.5)',
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  {copiedCode ? '✓' : '📋'}
                </button>
              </div>
            )}
          </div>
        </div>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', marginTop: 3, textAlign: isSelf ? 'right' : 'left', paddingInline: 4 }}>
          {formatTime(msg.timestamp)}
        </div>
      </div>
    </div>
  );
}

function TypingDots() {
  return (
    <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
      {[0, 1, 2].map(i => (
        <div key={i} style={{
          width: 5,
          height: 5,
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.4)',
          animation: `typingDot 1s ease ${i * 0.2}s infinite`,
        }} />
      ))}
    </div>
  );
}
