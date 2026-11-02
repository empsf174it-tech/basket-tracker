import Dexie, { type Table } from 'dexie';
import type { MetricKey } from '../engine/metrics';
import type { ShotTypeId } from '../engine/shotTypes';
import type { Pose, Side } from '../engine/types';

/**
 * Schema is defined up front so later stages (and future make/miss or court-location fields)
 * can add optional columns without a breaking migration. Only indexed fields appear in stores().
 */
export interface SessionRow {
  id?: number;
  startedAt: number;
  endedAt?: number;
  heightCm: number;
  hand?: Side;
  /** 'camera' for real sessions, 'file' when run on a video (developer mode). */
  source?: 'camera' | 'file';
}

export interface RepRow {
  id?: number;
  sessionId: number;
  shotType: ShotTypeId;
  /** Wall-clock time of release (ms since epoch). */
  timestamp: number;
  metrics: Partial<Record<MetricKey, number | null>>;
  score?: number | null;
  /** Reserved for future versions with a hoop. */
  made?: boolean | null;
  location?: string | null;
}

export interface BaselineRow {
  id?: number;
  repId: number;
  shotType: ShotTypeId;
  timestamp: number;
}

export interface FrameRow {
  repId: number;
  /** t is ms relative to release (negative = before). */
  frames: { t: number; pose: Pose }[];
}

export class FormLabDB extends Dexie {
  sessions!: Table<SessionRow, number>;
  reps!: Table<RepRow, number>;
  baselines!: Table<BaselineRow, number>;
  frames!: Table<FrameRow, number>;

  constructor() {
    super('shooting-form-lab');
    this.version(1).stores({
      sessions: '++id, startedAt',
      reps: '++id, sessionId, shotType, timestamp',
      baselines: '++id, repId, shotType',
      frames: 'repId',
    });
  }
}

export const db = new FormLabDB();
