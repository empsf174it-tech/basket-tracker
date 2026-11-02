import type { DetectedShot } from '../engine/shotDetector';
import type { ShotTypeId } from '../engine/shotTypes';
import type { Side } from '../engine/types';
import { buildCsv } from './csv';
import { db, type RepRow, type SessionRow } from './db';

export interface SavedShot {
  repId: number;
  sessionId: number;
  /** 1-based shot number within the session. */
  number: number;
}

/**
 * Saves the shots of one live session. The session row is created on the first shot, so opening
 * the camera without shooting leaves no empty sessions. Saves are queued so they stay in order.
 */
export class SessionRecorder {
  private sessionId: number | null = null;
  private count = 0;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private meta: { heightCm: number; hand: Side; source: 'camera' | 'file' }) {}

  save(shot: DetectedShot, shotType: ShotTypeId): Promise<SavedShot> {
    // performance.now() -> wall clock
    const timestamp = Math.round(Date.now() - (performance.now() - shot.tRelease));
    const job = this.queue.then(() => this.write(shot, shotType, timestamp));
    this.queue = job.catch(() => undefined);
    return job;
  }

  private async write(
    shot: DetectedShot,
    shotType: ShotTypeId,
    timestamp: number,
  ): Promise<SavedShot> {
    return db.transaction('rw', db.sessions, db.reps, db.frames, async () => {
      if (this.sessionId === null) {
        this.sessionId = await db.sessions.add({
          startedAt: timestamp,
          endedAt: timestamp,
          heightCm: this.meta.heightCm,
          hand: this.meta.hand,
          source: this.meta.source,
        });
      }
      const sessionId = this.sessionId;
      const repId = await db.reps.add({ sessionId, shotType, timestamp, metrics: shot.metrics });
      await db.frames.add({ repId, frames: shot.frames });
      await db.sessions.update(sessionId, { endedAt: timestamp });
      this.count += 1;
      return { repId, sessionId, number: this.count };
    });
  }
}

export async function deleteSession(sessionId: number): Promise<void> {
  await db.transaction('rw', db.sessions, db.reps, db.frames, db.baselines, async () => {
    const repIds = (await db.reps.where('sessionId').equals(sessionId).primaryKeys()) as number[];
    await db.frames.bulkDelete(repIds);
    await db.baselines.where('repId').anyOf(repIds).delete();
    await db.reps.bulkDelete(repIds);
    await db.sessions.delete(sessionId);
  });
}

export async function deleteRep(repId: number): Promise<void> {
  await db.transaction('rw', db.reps, db.frames, db.baselines, async () => {
    await db.frames.delete(repId);
    await db.baselines.where('repId').equals(repId).delete();
    await db.reps.delete(repId);
  });
}

async function allData(): Promise<{ sessions: SessionRow[]; reps: RepRow[] }> {
  const [sessions, reps] = await Promise.all([
    db.sessions.orderBy('startedAt').toArray(),
    db.reps.orderBy('timestamp').toArray(),
  ]);
  return { sessions, reps };
}

export async function exportCsv(): Promise<void> {
  const { sessions, reps } = await allData();
  download(buildCsv(sessions, reps), `shots-${stamp()}.csv`, 'text/csv');
}

/** Full backup including the pose frames of every shot. */
export async function exportJson(): Promise<void> {
  const { sessions, reps } = await allData();
  const frames = await db.frames.toArray();
  const body = JSON.stringify({
    app: 'shooting-form-lab',
    version: 1,
    exportedAt: new Date().toISOString(),
    sessions,
    reps,
    frames,
  });
  download(body, `shooting-form-lab-backup-${stamp()}.json`, 'application/json');
}

function download(text: string, filename: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}

/**
 * Ask the browser not to evict our data under storage pressure. Chrome grants this silently for
 * installed / frequently used sites. Returns whether storage is persistent.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
