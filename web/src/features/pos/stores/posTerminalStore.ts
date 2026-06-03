import { create } from 'zustand';

const STORAGE_KEY = 'mezan.pos.active_terminal_id';

function readStoredTerminalId(): number | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export type PosTerminalState = {
  activeTerminalId: number | null;
  setActiveTerminalId: (id: number | null) => void;
};

export const usePosTerminalStore = create<PosTerminalState>((set) => ({
  activeTerminalId: readStoredTerminalId(),
  setActiveTerminalId: (id) => {
    try {
      if (typeof window !== 'undefined') {
        if (id === null) window.localStorage.removeItem(STORAGE_KEY);
        else window.localStorage.setItem(STORAGE_KEY, String(id));
      }
    } catch {
      // private mode / quota
    }
    set({ activeTerminalId: id });
  },
}));
