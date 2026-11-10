import { create } from 'zustand';

export interface Notice {
  id: string;
  message: string;
}

interface NoticesState {
  notices: Notice[];
  push(message: string): void;
  dismiss(id: string): void;
}

export const useNoticesStore = create<NoticesState>()((set) => ({
  notices: [],
  push: (message) =>
    set((s) => ({ notices: [...s.notices, { id: crypto.randomUUID(), message }] })),
  dismiss: (id) => set((s) => ({ notices: s.notices.filter((n) => n.id !== id) })),
}));
