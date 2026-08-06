import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface RecentSearchesState {
  /** Términos de búsqueda, más reciente primero, máximo 8 */
  terms: string[];
  /** Agrega un término. Deduplica (case-insensitive), ignora < 2 chars */
  addTerm: (term: string) => void;
  /** Elimina un término individual */
  removeTerm: (term: string) => void;
  /** Vacía toda la lista */
  clearAll: () => void;
}

export const useRecentSearchesStore = create<RecentSearchesState>()(
  persist(
    (set) => ({
      terms: [],

      addTerm: (term) =>
        set((state) => {
          const trimmed = term.trim();
          if (trimmed.length < 2) return state;
          const deduped = [
            trimmed,
            ...state.terms.filter((t) => t.toLowerCase() !== trimmed.toLowerCase()),
          ];
          return { terms: deduped.slice(0, 8) };
        }),

      removeTerm: (term) =>
        set((state) => ({
          terms: state.terms.filter((t) => t !== term),
        })),

      clearAll: () => set({ terms: [] }),
    }),
    {
      name: 'recent-searches-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
