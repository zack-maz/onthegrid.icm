import { create } from 'zustand';
import { parse, type QueryNode } from '@/lib/queryParser';
import { serialize } from '@/lib/querySerializer';

const RECENT_TAGS_KEY = 'recentSearchTags';
const MAX_RECENT_TAGS = 5;

function loadRecentTags(): string[] {
  try {
    const stored = localStorage.getItem(RECENT_TAGS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) return parsed.slice(0, MAX_RECENT_TAGS);
    }
  } catch { /* localStorage unavailable or corrupted */ }
  return [];
}

function persistRecentTags(tags: string[]): void {
  try {
    localStorage.setItem(RECENT_TAGS_KEY, JSON.stringify(tags));
  } catch { /* silently fail */ }
}

/** Extract tag expressions (e.g., "type:flight", "country:iran") from an AST */
function extractTagExpressions(node: QueryNode | null): string[] {
  if (!node) return [];
  switch (node.type) {
    case 'tag':
      return [`${node.prefix}:${node.value}`];
    case 'text':
      return [];
    case 'or':
      return [...extractTagExpressions(node.left), ...extractTagExpressions(node.right)];
  }
}

export interface SearchState {
  query: string;
  parsedQuery: QueryNode | null;
  recentTags: string[];
  isSearchModalOpen: boolean;
  isFilterMode: boolean;
  matchedIds: Set<string>;

  setQuery: (query: string) => void;
  setParsedQuery: (node: QueryNode | null) => void;
  openSearchModal: () => void;
  closeSearchModal: () => void;
  applyAsFilter: () => void;
  clearSearch: () => void;
  setMatchedIds: (ids: Set<string>) => void;
}

export const useSearchStore = create<SearchState>()((set, get) => ({
  query: '',
  parsedQuery: null,
  recentTags: loadRecentTags(),
  isSearchModalOpen: false,
  isFilterMode: false,
  matchedIds: new Set<string>(),

  setQuery: (query) => set({ query, parsedQuery: parse(query) }),

  setParsedQuery: (node) => set({ parsedQuery: node, query: serialize(node) }),

  openSearchModal: () => set({ isSearchModalOpen: true }),

  closeSearchModal: () => set({ isSearchModalOpen: false }),

  applyAsFilter: () => {
    const { parsedQuery, recentTags } = get();
    const tagExprs = extractTagExpressions(parsedQuery);
    // Prepend new tags, dedup, keep last 5
    const merged = [...new Set([...tagExprs, ...recentTags])].slice(0, MAX_RECENT_TAGS);
    persistRecentTags(merged);
    set({ isFilterMode: true, isSearchModalOpen: false, recentTags: merged });
  },

  clearSearch: () => set({ query: '', parsedQuery: null, isFilterMode: false, matchedIds: new Set<string>() }),

  setMatchedIds: (ids) => set({ matchedIds: ids }),
}));
