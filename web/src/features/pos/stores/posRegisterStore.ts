import { create } from 'zustand';

/** Active POS cart for the register session (cleared after successful sale). */
export type PosRegisterState = {
  activeCartId: number | null;
  setActiveCartId: (id: number | null) => void;
};

export const usePosRegisterStore = create<PosRegisterState>((set) => ({
  activeCartId: null,
  setActiveCartId: (id) => set({ activeCartId: id }),
}));
