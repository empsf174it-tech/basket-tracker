import { METRICS } from '../engine/metrics';
import type { RepRow, SessionRow } from './db';

/** One row per shot, metrics as columns. Pure so it can be unit-tested without IndexedDB. */
export function buildCsv(sessions: readonly SessionRow[], reps: readonly RepRow[]): string {
  const byId = new Map(sessions.map((s) => [s.id, s]));
  const header = [
    'session_id',
    'session_started',
    'shot_id',
    'time',
    'shot_type',
    'hand',
    'height_cm',
    ...METRICS.map((m) => `${m.key}_${m.unit === '°' ? 'deg' : m.unit}`),
  ];
  const lines = [header.join(',')];
  for (const r of reps) {
    const s = byId.get(r.sessionId);
    const row = [
      r.sessionId,
      s ? iso(s.startedAt) : '',
      r.id ?? '',
      iso(r.timestamp),
      r.shotType,
      s?.hand ?? '',
      s?.heightCm ?? '',
      ...METRICS.map((m) => r.metrics[m.key] ?? ''),
    ];
    lines.push(row.map(cell).join(','));
  }
  return lines.join('\r\n') + '\r\n';
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function cell(v: unknown): string {
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
