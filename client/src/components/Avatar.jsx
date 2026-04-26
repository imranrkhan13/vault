/**
 * Avatar system for Vault
 * 
 * Key decisions (informed by reference code):
 * - Single avatar per user: clicking it opens inline chat input (no separate chat bubble needed)
 * - Avatar is always rendered into the FULLSCREEN ELEMENT via portal so it never disappears
 * - Each user gets a unique deterministic color + unique animal character
 * - Name is the tiebreaker — no two users in a room share the same visual
 * - Arrow keys move the avatar, click = open/close input, Enter = send message
 */

import React, { useState, useRef, useEffect, useCallback, memo } from 'react';
import ReactDOM from 'react-dom';

// ── Unique color per user (hash → index, but we spread the hash more) ─────────
const COLORS = [
  '#e85d4a','#e8904a','#d4b84a','#7cb87c','#4a9eb8',
  '#4a6eb8','#8b5cf6','#c45ab8','#e84a7c','#4ab88b',
  '#b84a4a','#4ab8b8',
];

function hashStr(s) {
  // FNV-1a — much better spread than simple charCode sum
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return h;
}

export function getColor(name) {
  return COLORS[hashStr(name || 'x') % COLORS.length];
}

// ── Animal avatars (12 distinct SVG faces, each visually very different) ──────
// Each returns an SVG string for a 64×64 viewBox
const ANIMALS = [
  // 0 Fox
  (c) => `<circle cx="32" cy="36" r="22" fill="${c}"/>
    <polygon points="12,10 20,28 6,26" fill="${c}"/>
    <polygon points="52,10 58,26 44,28" fill="${c}"/>
    <polygon points="13,12 18,26 8,24" fill="rgba(255,255,255,.45)"/>
    <polygon points="51,12 56,24 46,26" fill="rgba(255,255,255,.45)"/>
    <circle cx="23" cy="33" r="5" fill="rgba(0,0,0,.45)"/><circle cx="41" cy="33" r="5" fill="rgba(0,0,0,.45)"/>
    <circle cx="23" cy="33" r="2.8" fill="#f97316" opacity=".9"/><circle cx="41" cy="33" r="2.8" fill="#f97316" opacity=".9"/>
    <circle cx="24" cy="32" r="1.1" fill="rgba(255,255,255,.6)"/><circle cx="42" cy="32" r="1.1" fill="rgba(255,255,255,.6)"/>
    <path d="M27 44 Q32 49 37 44" stroke="rgba(0,0,0,.3)" stroke-width="2" stroke-linecap="round" fill="none"/>`,
  // 1 Bear  
  (c) => `<circle cx="32" cy="35" r="22" fill="${c}"/>
    <circle cx="15" cy="16" r="9" fill="${c}"/><circle cx="49" cy="16" r="9" fill="${c}"/>
    <circle cx="15" cy="16" r="5" fill="rgba(0,0,0,.18)"/><circle cx="49" cy="16" r="5" fill="rgba(0,0,0,.18)"/>
    <circle cx="23" cy="33" r="4.5" fill="rgba(0,0,0,.42)"/><circle cx="41" cy="33" r="4.5" fill="rgba(0,0,0,.42)"/>
    <circle cx="24" cy="32" r="1.8" fill="rgba(255,255,255,.6)"/><circle cx="42" cy="32" r="1.8" fill="rgba(255,255,255,.6)"/>
    <ellipse cx="32" cy="41" rx="6" ry="4.5" fill="rgba(0,0,0,.18)"/>
    <path d="M27 45 Q32 50 37 45" stroke="rgba(0,0,0,.3)" stroke-width="2" stroke-linecap="round" fill="none"/>`,
  // 2 Cat
  (c) => `<circle cx="32" cy="36" r="22" fill="${c}"/>
    <polygon points="13,14 19,30 8,28" fill="${c}"/><polygon points="51,14 56,28 45,30" fill="${c}"/>
    <polygon points="14,16 18,27 10,26" fill="rgba(255,255,255,.28)"/><polygon points="50,16 54,26 46,27" fill="rgba(255,255,255,.28)"/>
    <ellipse cx="23" cy="33" rx="5" ry="6" fill="rgba(0,0,0,.42)"/><ellipse cx="41" cy="33" rx="5" ry="6" fill="rgba(0,0,0,.42)"/>
    <ellipse cx="23" cy="33" rx="2.5" ry="5" fill="#7de" opacity=".85"/><ellipse cx="41" cy="33" rx="2.5" ry="5" fill="#7de" opacity=".85"/>
    <circle cx="24" cy="31" r="1" fill="rgba(255,255,255,.7)"/><circle cx="42" cy="31" r="1" fill="rgba(255,255,255,.7)"/>
    <circle cx="32" cy="41" r="2" fill="rgba(255,170,170,.8)"/>
    <path d="M28 44 Q32 48 36 44" stroke="rgba(0,0,0,.35)" stroke-width="1.5" stroke-linecap="round" fill="none"/>`,
  // 3 Robot
  (c) => `<rect x="10" y="18" width="44" height="34" rx="6" fill="${c}"/>
    <rect x="14" y="10" width="36" height="12" rx="4" fill="${c}"/>
    <line x1="32" y1="10" x2="32" y2="5" stroke="${c}" stroke-width="3" stroke-linecap="round"/>
    <circle cx="32" cy="4" r="3" fill="${c}"/>
    <rect x="17" y="26" width="12" height="9" rx="3" fill="rgba(0,0,0,.42)"/>
    <rect x="35" y="26" width="12" height="9" rx="3" fill="rgba(0,0,0,.42)"/>
    <rect x="19" y="28" width="8" height="5" rx="2" fill="#0ef" opacity=".8"/>
    <rect x="37" y="28" width="8" height="5" rx="2" fill="#0ef" opacity=".8"/>
    <rect x="22" y="41" width="20" height="5" rx="2.5" fill="rgba(0,0,0,.28)"/>
    <rect x="6" y="24" width="4" height="14" rx="2" fill="${c}"/><rect x="54" y="24" width="4" height="14" rx="2" fill="${c}"/>`,
  // 4 Alien
  (c) => `<ellipse cx="32" cy="35" rx="24" ry="27" fill="${c}"/>
    <ellipse cx="22" cy="30" rx="8" ry="7" fill="rgba(0,0,0,.48)"/><ellipse cx="42" cy="30" rx="8" ry="7" fill="rgba(0,0,0,.48)"/>
    <ellipse cx="22" cy="30" rx="5" ry="5" fill="#00ffee" opacity=".78"/><ellipse cx="42" cy="30" rx="5" ry="5" fill="#00ffee" opacity=".78"/>
    <circle cx="22" cy="30" r="2.5" fill="#000"/><circle cx="42" cy="30" r="2.5" fill="#000"/>
    <circle cx="21" cy="29" r="1" fill="#fff" opacity=".55"/><circle cx="41" cy="29" r="1" fill="#fff" opacity=".55"/>
    <path d="M26 46 Q32 50 38 46" stroke="rgba(0,0,0,.38)" stroke-width="2" stroke-linecap="round" fill="none"/>`,
  // 5 Ghost
  (c) => `<path d="M12 56 Q12 20 32 10 Q52 20 52 56 L44 48 L36 56 L28 48 Z" fill="${c}"/>
    <circle cx="24" cy="33" r="5.5" fill="rgba(0,0,0,.48)"/><circle cx="40" cy="33" r="5.5" fill="rgba(0,0,0,.48)"/>
    <circle cx="25" cy="32" r="2.2" fill="rgba(255,255,255,.85)"/><circle cx="41" cy="32" r="2.2" fill="rgba(255,255,255,.85)"/>
    <path d="M26 44 Q32 49 38 44" stroke="rgba(0,0,0,.32)" stroke-width="2" stroke-linecap="round" fill="none"/>`,
  // 6 Dragon
  (c) => `<circle cx="32" cy="35" r="22" fill="${c}"/>
    <polygon points="18,10 24,22 12,24" fill="${c}"/><polygon points="46,10 52,24 40,22" fill="${c}"/>
    <polygon points="20,12 24,20 14,22" fill="rgba(255,100,0,.55)"/><polygon points="44,12 50,22 40,20" fill="rgba(255,100,0,.55)"/>
    <ellipse cx="22" cy="32" rx="6" ry="5" fill="rgba(0,0,0,.42)"/><ellipse cx="42" cy="32" rx="6" ry="5" fill="rgba(0,0,0,.42)"/>
    <ellipse cx="22" cy="32" rx="3" ry="4" fill="#f97316" opacity=".85"/><ellipse cx="42" cy="32" rx="3" ry="4" fill="#f97316" opacity=".85"/>
    <circle cx="23" cy="30" r="1.2" fill="rgba(255,255,255,.6)"/><circle cx="43" cy="30" r="1.2" fill="rgba(255,255,255,.6)"/>
    <path d="M24 45 L28 42 L32 45 L36 42 L40 45" stroke="rgba(255,100,0,.7)" stroke-width="2" stroke-linecap="round" fill="none"/>`,
  // 7 Ninja
  (c) => `<circle cx="32" cy="32" r="30" fill="${c}"/>
    <path d="M8 16 Q32 8 56 16" stroke="rgba(0,0,0,.38)" stroke-width="6" stroke-linecap="round" fill="none"/>
    <rect x="8" y="27" width="48" height="12" rx="3" fill="rgba(0,0,0,.52)"/>
    <circle cx="22" cy="33" r="4" fill="rgba(255,255,255,.9)"/><circle cx="42" cy="33" r="4" fill="rgba(255,255,255,.9)"/>
    <circle cx="23" cy="32" r="2" fill="${c}"/><circle cx="43" cy="32" r="2" fill="${c}"/>`,
  // 8 Wizard
  (c) => `<circle cx="32" cy="37" r="22" fill="${c}"/>
    <path d="M32 4 L17 28 L47 28 Z" fill="${c}"/>
    <circle cx="32" cy="4" r="3.5" fill="#FFD700"/>
    <circle cx="22" cy="34" r="4.5" fill="rgba(0,0,0,.42)"/><circle cx="42" cy="34" r="4.5" fill="rgba(0,0,0,.42)"/>
    <circle cx="22" cy="34" r="2.5" fill="#a78bfa" opacity=".95"/><circle cx="42" cy="34" r="2.5" fill="#a78bfa" opacity=".95"/>
    <circle cx="23" cy="33" r="1" fill="rgba(255,255,255,.65)"/><circle cx="43" cy="33" r="1" fill="rgba(255,255,255,.65)"/>
    <path d="M24 45 Q32 51 40 45" stroke="rgba(255,255,255,.55)" stroke-width="2" stroke-linecap="round" fill="none"/>`,
  // 9 Space
  (c) => `<circle cx="32" cy="32" r="30" fill="#1a1a2e"/>
    <circle cx="32" cy="32" r="22" fill="${c}"/>
    <circle cx="32" cy="32" r="16" fill="rgba(0,0,0,.72)"/>
    <circle cx="22" cy="30" r="4" fill="rgba(255,255,255,.9)"/><circle cx="42" cy="30" r="4" fill="rgba(255,255,255,.9)"/>
    <circle cx="23" cy="29" r="1.5" fill="#000"/><circle cx="43" cy="29" r="1.5" fill="#000"/>
    <path d="M26 37 Q32 41 38 37" stroke="rgba(255,255,255,.55)" stroke-width="1.5" stroke-linecap="round" fill="none"/>
    <circle cx="14" cy="32" r="4.5" fill="${c}"/><circle cx="50" cy="32" r="4.5" fill="${c}"/>`,
  // 10 Cool (sunglasses)
  (c) => `<circle cx="32" cy="32" r="30" fill="${c}"/>
    <rect x="16" y="23" width="12" height="7" rx="3.5" fill="rgba(0,0,0,.45)"/>
    <rect x="36" y="23" width="12" height="7" rx="3.5" fill="rgba(0,0,0,.45)"/>
    <rect x="18" y="24" width="8" height="5" rx="2.5" fill="rgba(255,255,255,.82)"/>
    <rect x="38" y="24" width="8" height="5" rx="2.5" fill="rgba(255,255,255,.82)"/>
    <line x1="28" y1="27" x2="36" y2="27" stroke="rgba(0,0,0,.3)" stroke-width="1.5"/>
    <path d="M21 39 Q32 47 43 39" stroke="rgba(255,255,255,.88)" stroke-width="2.5" stroke-linecap="round" fill="none"/>`,
  // 11 Happy
  (c) => `<circle cx="32" cy="32" r="30" fill="${c}"/>
    <circle cx="22" cy="27" r="4.5" fill="rgba(0,0,0,.38)"/><circle cx="42" cy="27" r="4.5" fill="rgba(0,0,0,.38)"/>
    <circle cx="23" cy="26" r="2" fill="rgba(255,255,255,.7)"/><circle cx="43" cy="26" r="2" fill="rgba(255,255,255,.7)"/>
    <path d="M19 38 Q32 50 45 38" stroke="rgba(255,255,255,.9)" stroke-width="2.5" stroke-linecap="round" fill="none"/>
    <ellipse cx="20" cy="37" rx="4" ry="2.5" fill="rgba(255,255,255,.14)"/>
    <ellipse cx="44" cy="37" rx="4" ry="2.5" fill="rgba(255,255,255,.14)"/>`,
];

export function getAnimal(name) {
  // Use a different bit of the hash so color and animal don't correlate
  return ANIMALS[(hashStr((name || 'x') + 'animal') % ANIMALS.length)];
}

// Inline SVG avatar component
export function AvatarSVG({ name, size = 44 }) {
  const color  = getColor(name);
  const animal = getAnimal(name);
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" style={{ display:'block', borderRadius:'50%', flexShrink:0 }}
      dangerouslySetInnerHTML={{ __html: animal(color) }} />
  );
}

// Quick emoji set for reactions
export const QUICK_EMOJIS = ['❤️','😂','🔥','👍','👏','🎉','😮','💯','😢','🤣','🥳','💪','👀','😭','🚀','✨','😅','🫡','😍','🤔'];

/**
 * PresenceAvatar — THE core component.
 *
 * Behaviour:
 * - Floating on canvas at (x, y)
 * - Click avatar OR press T = toggle input open
 * - When input open: text box appears above avatar, Enter sends
 * - When message sent: bubble appears above avatar for 4.5s, then fades
 * - E key toggles emoji picker
 * - Arrow keys move self avatar
 * - Renders into document.fullscreenElement via portal so it NEVER disappears in fullscreen
 * - Other users' avatars show their last message as bubble
 */
export const PresenceAvatar = memo(function PresenceAvatar({
  name, x, y, isSelf,
  message, isTyping,
  inputOpen, inputValue,
  onInputChange, onSendMessage, onClickAvatar,
  showEmojiPicker, onToggleEmoji, onSendEmoji,
}) {
  const color = getColor(name);

  return (
    <div style={{
      position: 'absolute', left: x, top: y,
      transform: 'translate(-50%,-50%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
      zIndex: isSelf ? 2147483647 : 2147483646,
      pointerEvents: isSelf ? 'auto' : 'none',
      transition: isSelf ? 'none' : 'left .1s, top .1s',
      userSelect: 'none',
    }}>

      {/* ── Emoji picker (above everything) ── */}
      {isSelf && showEmojiPicker && (
        <div style={{
          position: 'absolute', bottom: '100%', marginBottom: 8,
          background: 'rgba(9,9,15,.97)',
          border: `1.5px solid ${color}40`,
          borderRadius: 16, padding: 8,
          boxShadow: '0 16px 48px rgba(0,0,0,.85)',
          display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 3,
          zIndex: 2147483647, animation: 'av-pop .15s ease',
          backdropFilter: 'blur(20px)',
        }}>
          {QUICK_EMOJIS.map(e => (
            <button key={e} onClick={() => onSendEmoji?.(e)} style={{
              background: 'none', border: 'none', fontSize: 20,
              borderRadius: 8, padding: '4px 3px', cursor: 'pointer', lineHeight: 1,
              transition: 'transform .1s',
            }}
            onMouseEnter={ev => { ev.currentTarget.style.transform = 'scale(1.35)'; ev.currentTarget.style.background = 'rgba(255,255,255,.1)'; }}
            onMouseLeave={ev => { ev.currentTarget.style.transform = ''; ev.currentTarget.style.background = 'none'; }}>
              {e}
            </button>
          ))}
        </div>
      )}

      {/* ── Chat input (self only, when open) ── */}
      {isSelf && inputOpen && (
        <div style={{
          position: 'absolute', bottom: '100%', marginBottom: 6,
          background: 'rgba(9,9,15,.97)',
          border: `1.5px solid ${color}50`,
          borderRadius: 14, padding: '8px 10px',
          display: 'flex', alignItems: 'center', gap: 6,
          boxShadow: '0 12px 40px rgba(0,0,0,.8)',
          minWidth: 170, maxWidth: 230,
          backdropFilter: 'blur(16px)',
          animation: 'av-pop .15s ease',
          zIndex: 2147483647,
        }}>
          <input
            id="presence-input"
            autoFocus
            value={inputValue || ''}
            onChange={e => onInputChange?.(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && inputValue?.trim()) { e.preventDefault(); onSendMessage?.(inputValue.trim()); }
              if (e.key === 'Escape') { e.preventDefault(); onClickAvatar?.(); }
            }}
            placeholder="Say something…"
            style={{
              background: 'none', border: 'none', outline: 'none',
              fontSize: 13, color: '#fff', flex: 1, minWidth: 80,
              fontFamily: 'Inter, sans-serif', fontWeight: 500,
            }}
          />
          {/* E button for emoji */}
          <button onClick={() => onToggleEmoji?.()} style={{
            background: showEmojiPicker ? `${color}30` : 'rgba(255,255,255,.08)',
            border: 'none', borderRadius: 7, padding: '3px 6px',
            color: 'rgba(255,255,255,.6)', fontSize: 13, cursor: 'pointer', flexShrink: 0,
            fontFamily: 'Inter, monospace', fontWeight: 700,
          }} title="E for emoji">E</button>
          {/* Send */}
          {inputValue?.trim() && (
            <button onClick={() => onSendMessage?.(inputValue.trim())} style={{
              background: color, border: 'none', borderRadius: 8,
              width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', flexShrink: 0,
            }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            </button>
          )}
          {/* Bubble tail */}
          <div style={{
            position: 'absolute', bottom: -6, left: '50%', transform: 'translateX(-50%)',
            width: 0, height: 0,
            borderLeft: '6px solid transparent', borderRight: '6px solid transparent',
            borderTop: '6px solid rgba(9,9,15,.97)',
          }}/>
        </div>
      )}

      {/* ── Message bubble (shown when NOT input-open and have a message) ── */}
      {(!isSelf || (isSelf && !inputOpen && message)) && (message || isTyping) && (
        <div style={{
          position: 'absolute', bottom: '100%', marginBottom: 6,
          background: 'rgba(9,9,15,.97)',
          border: `1.5px solid ${color}40`,
          borderRadius: 14, padding: '8px 12px',
          fontSize: 13, color: '#fff', lineHeight: 1.5,
          maxWidth: 200, wordBreak: 'break-word', textAlign: 'center',
          boxShadow: '0 8px 32px rgba(0,0,0,.7)',
          animation: 'av-pop .18s ease',
          pointerEvents: 'none',
          backdropFilter: 'blur(12px)',
          fontFamily: 'Inter, sans-serif',
          whiteSpace: 'pre-wrap',
        }}>
          {isTyping && !message ? (
            <div style={{ display:'flex', gap:3, justifyContent:'center', padding:'2px 4px' }}>
              {[0,1,2].map(i => (
                <div key={i} style={{ width:5, height:5, borderRadius:'50%', background:'rgba(255,255,255,.5)', animation:`av-dot 1s ${i*0.2}s infinite` }}/>
              ))}
            </div>
          ) : message}
          {/* Tail */}
          <div style={{
            position: 'absolute', bottom: -6, left: '50%', transform: 'translateX(-50%)',
            width: 0, height: 0,
            borderLeft: '6px solid transparent', borderRight: '6px solid transparent',
            borderTop: '6px solid rgba(9,9,15,.97)',
          }}/>
        </div>
      )}

      {/* ── Avatar circle (clickable for self) ── */}
      <div
        onClick={isSelf ? () => onClickAvatar?.() : undefined}
        style={{
          position: 'relative',
          cursor: isSelf ? 'pointer' : 'default',
          borderRadius: '50%',
          border: `2.5px solid ${isSelf ? color : 'rgba(255,255,255,.4)'}`,
          boxShadow: isSelf
            ? `0 0 0 4px ${color}28, 0 4px 20px rgba(0,0,0,.5)`
            : '0 2px 12px rgba(0,0,0,.4)',
          transition: 'box-shadow .15s',
        }}
      >
        <AvatarSVG name={name} size={46} />

        {/* Online dot */}
        <div style={{
          position: 'absolute', bottom: 1, right: 1,
          width: 11, height: 11, borderRadius: '50%',
          background: '#22c55e', border: '2.5px solid rgba(0,0,0,.85)',
        }}/>

        {/* Pulse ring when input is open */}
        {isSelf && inputOpen && (
          <div style={{
            position: 'absolute', inset: -6, borderRadius: '50%',
            border: `2px solid ${color}`,
            animation: 'av-ring 1.4s ease infinite',
            pointerEvents: 'none',
          }}/>
        )}
      </div>

      {/* ── Name tag ── */}
      <div style={{
        background: 'rgba(0,0,0,.78)',
        backdropFilter: 'blur(8px)',
        border: `1px solid ${color}30`,
        borderRadius: 999,
        padding: '2px 9px',
        fontSize: 10, fontWeight: 700, color: '#fff',
        whiteSpace: 'nowrap',
        fontFamily: 'Inter, sans-serif',
        letterSpacing: 0.2,
      }}>
        {isSelf ? `${name} · you` : name}
      </div>
    </div>
  );
});
