import { Session } from './sessionRegistry';

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export interface SessionPickItem {
  label: string;
  description: string;
  detail: string;
  session: Session;
}

export function formatSessionItems(sessions: Session[]): SessionPickItem[] {
  return sessions.map((s) => ({
    label: s.name,
    description: `started ${timeAgo(s.startedAt)} · port ${s.port}`,
    detail: s.cwd,
    session: s,
  }));
}
