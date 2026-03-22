import { create } from 'zustand';

interface SearchState {
  query: string;
  isSearchModalOpen: boolean;
  isFilterMode: boolean;
  matchedIds: Set<string>;

  setQuery: (query: string) => void;
  openSearchModal: () => void;
  closeSearchModal: () => void;
  applyAsFilter: () => void;
  clearSearch: () => void;
  setMatchedIds: (ids: Set<string>) => void;
}

export const useSearchStore = create<SearchState>()((set) => ({
  query: '',
  isSearchModalOpen: false,
  isFilterMode: false,
  matchedIds: new Set<string>(),

  setQuery: (query) => set({ query }),

  openSearchModal: () => set({ isSearchModalOpen: true }),

  closeSearchModal: () => set({ isSearchModalOpen: false }),

  applyAsFilter: () => set({ isFilterMode: true, isSearchModalOpen: false }),

  clearSearch: () => set({ query: '', isFilterMode: false, matchedIds: new Set<string>() }),

  setMatchedIds: (ids) => set({ matchedIds: ids }),
}));
