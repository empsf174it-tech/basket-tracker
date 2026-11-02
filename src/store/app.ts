import { create } from 'zustand';

export type Screen = 'setup' | 'live';

/** Live input: the camera, or (dev mode) an uploaded video fed through the same pipeline. */
export type InputSource = { kind: 'camera' } | { kind: 'file'; file: File };

interface AppStore {
  screen: Screen;
  source: InputSource;
  go: (screen: Screen, source?: InputSource) => void;
}

export const useApp = create<AppStore>()((set) => ({
  screen: 'setup',
  source: { kind: 'camera' },
  go: (screen, source) => set((s) => ({ screen, source: source ?? s.source })),
}));
