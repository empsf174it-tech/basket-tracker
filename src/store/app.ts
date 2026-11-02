import { create } from 'zustand';

export type Screen = 'setup' | 'live' | 'history';

/** Live input: the camera, or (dev mode) an uploaded video fed through the same pipeline. */
export type InputSource = { kind: 'camera' } | { kind: 'file'; file: File };

interface AppStore {
  screen: Screen;
  source: InputSource;
  /** Session open in the History screen (null = session list). */
  historySessionId: number | null;
  go: (screen: Screen, source?: InputSource) => void;
  openSession: (id: number | null) => void;
}

export const useApp = create<AppStore>()((set) => ({
  screen: 'setup',
  source: { kind: 'camera' },
  historySessionId: null,
  go: (screen, source) => set((s) => ({ screen, source: source ?? s.source })),
  openSession: (historySessionId) => set({ screen: 'history', historySessionId }),
}));
