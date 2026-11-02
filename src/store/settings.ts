import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Facing } from '../engine/camera';
import type { ShotTypeId } from '../engine/shotTypes';
import type { Side, SideSetting } from '../engine/types';

export interface Settings {
  shotType: ShotTypeId;
  hand: Side;
  heightCm: number;
  facing: Facing;
  mirrored: boolean;
  /** Which body side to analyse; 'auto' picks the side nearest the camera. */
  analysisSide: SideSetting;
  showFps: boolean;
}

interface SettingsStore extends Settings {
  set: (patch: Partial<Settings>) => void;
}

export const useSettings = create<SettingsStore>()(
  persist(
    (set) => ({
      shotType: 'FT',
      hand: 'right',
      heightCm: 168,
      facing: 'environment',
      mirrored: false,
      analysisSide: 'auto',
      showFps: false,
      set: (patch) => set(patch),
    }),
    { name: 'sfl-settings', version: 1 },
  ),
);
