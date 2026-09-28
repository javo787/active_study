import { Timestamp } from 'firebase/firestore';

export function toMillis(v: Date | Timestamp | null | undefined): number | null {
  if (!v) return null;
  if (v instanceof Timestamp || (typeof v === 'object' && 'seconds' in v)) {
    return (v as Timestamp).toMillis();
  }
  if (v instanceof Date) {
    return v.getTime();
  }
  return null;
}

export function toDate(v: Date | Timestamp | null | undefined): Date | null {
  const millis = toMillis(v);
  return millis !== null ? new Date(millis) : null;
}

export function formatClock(seconds: number): string {
  if (seconds < 0) seconds = 0;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function formatDuration(startMs: number, endMs: number): string {
  if (startMs >= endMs) return '0s';
  const diffSec = Math.floor((endMs - startMs) / 1000);
  const h = Math.floor(diffSec / 3600);
  const m = Math.floor((diffSec % 3600) / 60);
  const s = diffSec % 60;

  const parts = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0 || h > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(' ');
}

export function formatTimeLeft(expiresAt: Date | Timestamp | null | undefined): string {
  const ms = toMillis(expiresAt);
  if (!ms) return 'never expires';

  const diffMs = ms - Date.now();
  if (diffMs <= 0) return 'Expired';

  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 60) return `${diffMin}m left`;

  const h = Math.floor(diffMin / 60);
  if (h < 24) {
    const m = diffMin % 60;
    return m > 0 ? `${h}h ${m}m left` : `${h}h left`;
  }

  const d = Math.floor(h / 24);
  const remH = h % 24;
  return remH > 0 ? `${d}d ${remH}h left` : `${d}d left`;
}
