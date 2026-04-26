const EMOJIS = ['🦊','🐺','🦁','🐯','🐻','🦝','🦄','🐉','🦋','🐬','🦜','🐙','🦑','🦀','🐸','🦔','🐨','🦩','🦚','🐧','🦭','🐝','🦎','🐳'];
const COLORS = ['#C4873A','#8B5E3C','#A67C52','#6B8F71','#5B7FA6','#9B6B9B','#C4603A','#3A7FC4','#7FC43A','#C43A7F'];

export function getAvatarEmoji(name) {
  const c = (name||'').split('').reduce((a,ch)=>a+ch.charCodeAt(0),0);
  return EMOJIS[c % EMOJIS.length];
}
export function getAvatarColor(name) {
  const c = (name||'').split('').reduce((a,ch)=>a+ch.charCodeAt(0),0);
  return COLORS[c % COLORS.length];
}
export function formatTime(ts) {
  return new Date(ts).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
}
export function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return bytes+' B';
  if (bytes < 1048576) return (bytes/1024).toFixed(1)+' KB';
  return (bytes/1048576).toFixed(1)+' MB';
}
export function generateGuestName() {
  const a = ['Bold','Swift','Quiet','Sharp','Bright','Dark','Cool','Wild','Noble','Brave'];
  const n = ['Crane','Fox','Wolf','Bear','Hawk','Lynx','Raven','Tiger','Otter','Falcon'];
  return `${a[Math.floor(Math.random()*a.length)]} ${n[Math.floor(Math.random()*n.length)]}`;
}
