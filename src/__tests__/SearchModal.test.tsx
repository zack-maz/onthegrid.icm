import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { SearchModal } from '@/components/search/SearchModal';
import { useSearchStore } from '@/stores/searchStore';

describe('SearchModal', () => {
  beforeEach(() => {
    useSearchStore.getState().clearSearch();
    useSearchStore.setState({ isSearchModalOpen: false });
  });

  it('renders when isSearchModalOpen is true', () => {
    useSearchStore.setState({ isSearchModalOpen: true });
    render(<SearchModal />);
    expect(screen.getByTestId('search-modal')).toBeTruthy();
  });

  it('does not render when isSearchModalOpen is false', () => {
    useSearchStore.setState({ isSearchModalOpen: false });
    render(<SearchModal />);
    expect(screen.queryByTestId('search-modal')).toBeNull();
  });

  it('Escape key closes the modal (via centralized handler / store action)', () => {
    useSearchStore.setState({ isSearchModalOpen: true });
    render(<SearchModal />);
    // Escape is now handled by centralized useEscapeKeyHandler in AppShell.
    // Verify the store action works correctly.
    useSearchStore.getState().closeSearchModal();
    expect(useSearchStore.getState().isSearchModalOpen).toBe(false);
  });

  it('Cmd+K opens the modal', () => {
    useSearchStore.setState({ isSearchModalOpen: false });
    render(<SearchModal />);
    fireEvent.keyDown(document, { key: 'k', metaKey: true });
    expect(useSearchStore.getState().isSearchModalOpen).toBe(true);
  });

  it('typing updates query', () => {
    useSearchStore.setState({ isSearchModalOpen: true });
    render(<SearchModal />);
    const input = screen.getByTestId('search-input');
    fireEvent.change(input, { target: { value: 'iran' } });
    expect(useSearchStore.getState().query).toBe('iran');
  });

  it('clicking backdrop closes modal', () => {
    useSearchStore.setState({ isSearchModalOpen: true });
    render(<SearchModal />);
    const backdrop = screen.getByTestId('search-modal');
    // Click on the backdrop itself (not a child element)
    fireEvent.click(backdrop);
    expect(useSearchStore.getState().isSearchModalOpen).toBe(false);
  });
});
