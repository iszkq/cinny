export function previewText(type: string, content: Record<string, unknown>, redacted = false): string {
  if (redacted) return '消息已撤回';
  if (type === 'm.room.encrypted') return '加密消息';
  if (type === 'm.sticker') return '[贴纸]';
  if (type.includes('poll.start')) return '[投票]';
  const labels: Record<string,string> = {'m.image':'[图片]','m.video':'[视频]','m.audio':'[语音]','m.file':'[文件]','m.location':'[位置]'};
  if (typeof content.msgtype === 'string' && labels[content.msgtype]) return labels[content.msgtype];
  if (typeof content.body !== 'string') return '';
  return content.body.replace(/^>[^\n]*(?:\n>[^\n]*)*\n\n/, '').replace(/\s+/g,' ').trim();
}
export function previewTime(timestamp: number, now = Date.now()): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return '';
  const date = new Date(timestamp);
  const today = new Date(now); today.setHours(0,0,0,0);
  if (timestamp >= today.getTime()) return `${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate()-1);
  if (timestamp >= yesterday.getTime()) return '昨天';
  return `${date.getFullYear() === today.getFullYear() ? '' : `${date.getFullYear()}/`}${date.getMonth()+1}/${date.getDate()}`;
}
