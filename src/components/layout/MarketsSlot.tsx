import { useState, useCallback, useMemo } from 'react';
import { useMarketStore } from '@/stores/marketStore';
import { useUIStore } from '@/stores/uiStore';
import type { ConnectionStatus, MarketRange } from '@/stores/marketStore';
import { OverlayPanel } from '@/components/ui/OverlayPanel';
import { MarketRow } from '@/components/markets/MarketRow';
import { useDraggable } from '@/hooks/useDraggable';

const STATUS_DOT_CLASS: Record<ConnectionStatus, string> = {
  connected: 'bg-accent-green',
  stale: 'bg-accent-yellow',
  error: 'bg-accent-red',
  loading: 'bg-text-muted animate-pulse',
};

const RANGES: { value: MarketRange; label: string }[] = [
  { value: '1d', label: '1D' },
  { value: '5d', label: '1W' },
  { value: '1mo', label: '1M' },
  { value: 'ytd', label: 'YTD' },
];

const DEFAULT_POSITION = { x: typeof window !== 'undefined' ? window.innerWidth - 604 : 900, y: 56 };

function readBool(key: string, fallback: boolean): boolean {
  try {
    return localStorage.getItem(key) === 'true' ? true : fallback;
  } catch {
    return fallback;
  }
}

function persistBool(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // localStorage unavailable
  }
}

export function MarketsSlot() {
  const quotes = useMarketStore((s) => s.quotes);
  const connectionStatus = useMarketStore((s) => s.connectionStatus);
  const range = useMarketStore((s) => s.range);
  const setRange = useMarketStore((s) => s.setRange);

  const { position, isDragging, handleProps, resetPosition } = useDraggable({
    storageKey: 'marketsPosition',
    defaultPosition: DEFAULT_POSITION,
  });

  const isNotDefault = useMemo(() => {
    return Math.abs(position.x - DEFAULT_POSITION.x) > 2 || Math.abs(position.y - DEFAULT_POSITION.y) > 2;
  }, [position]);

  const isCollapsed = useUIStore((s) => s.isMarketsCollapsed);
  const toggleCollapse = useUIStore((s) => s.toggleMarkets);
  const [showPercent, setShowPercent] = useState(() => readBool('markets-show-percent', false));
  const [expandedSymbol, setExpandedSymbol] = useState<string | null>(null);

  const toggleMode = useCallback(() => {
    setShowPercent((prev) => {
      const next = !prev;
      persistBool('markets-show-percent', next);
      return next;
    });
  }, []);

  const allClosed = quotes.length > 0 && quotes.every((q) => !q.marketOpen);

  return (
    <div
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        zIndex: 'var(--z-controls)' as unknown as number,
        width: 260,
        userSelect: isDragging ? 'none' : undefined,
      }}
      data-testid="markets-slot"
    >
      <OverlayPanel>
        {/* Drag handle header */}
        <div
          className="flex items-center gap-2"
          {...handleProps}
        >
          {/* Grip icon */}
          <svg
            width="8"
            height="12"
            viewBox="0 0 8 12"
            fill="currentColor"
            className="text-text-muted flex-shrink-0 opacity-50"
            aria-hidden="true"
          >
            <circle cx="2" cy="2" r="1" />
            <circle cx="6" cy="2" r="1" />
            <circle cx="2" cy="6" r="1" />
            <circle cx="6" cy="6" r="1" />
            <circle cx="2" cy="10" r="1" />
            <circle cx="6" cy="10" r="1" />
          </svg>
          <span className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
            Markets
          </span>
          <span
            className={`inline-block h-2 w-2 rounded-full ${STATUS_DOT_CLASS[connectionStatus]}`}
            data-testid="markets-status-dot"
          />
          {allClosed && (
            <span className="text-[10px] text-text-muted uppercase">
              Market Closed
            </span>
          )}
          <div className="ml-auto flex items-center gap-1">
            {isNotDefault && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  resetPosition();
                }}
                className="text-text-muted text-[10px] px-1 py-0.5 rounded hover:bg-white/5 transition-colors"
                aria-label="Reset position"
                title="Reset position"
              >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 8a6 6 0 0 1 10.47-4" />
                  <path d="M14 8a6 6 0 0 1-10.47 4" />
                  <polyline points="13 2 13 5 10 5" />
                  <polyline points="3 14 3 11 6 11" />
                </svg>
              </button>
            )}
            <button
              onClick={toggleMode}
              className="text-[10px] px-1.5 py-0.5 rounded border border-border text-text-secondary hover:bg-white/5 transition-colors"
              aria-label={showPercent ? 'Show dollar change' : 'Show percent change'}
            >
              {showPercent ? '%' : '$'}
            </button>
            <button
              onClick={toggleCollapse}
              className="text-text-muted text-sm leading-none px-1"
              aria-label={isCollapsed ? 'Expand markets panel' : 'Collapse markets panel'}
            >
              {isCollapsed ? '+' : '-'}
            </button>
          </div>
        </div>

        {/* Body */}
        {!isCollapsed && (
          <>
            {/* Timeframe selector */}
            <div className="mt-1.5 flex gap-0.5">
              {RANGES.map((r) => (
                <button
                  key={r.value}
                  onClick={() => setRange(r.value)}
                  className={`flex-1 text-[10px] py-0.5 rounded transition-colors ${
                    range === r.value
                      ? 'bg-white/10 text-text-primary font-semibold'
                      : 'text-text-muted hover:bg-white/5 hover:text-text-secondary'
                  }`}
                  aria-label={`Show ${r.label} timeframe`}
                >
                  {r.label}
                </button>
              ))}
            </div>

            <div className="mt-1.5 flex flex-col">
              {quotes.length > 0 ? (
                quotes.map((q) => (
                  <MarketRow
                    key={q.symbol}
                    quote={q}
                    showPercent={showPercent}
                    isExpanded={expandedSymbol === q.symbol}
                    onToggle={() =>
                      setExpandedSymbol((prev) => (prev === q.symbol ? null : q.symbol))
                    }
                  />
                ))
              ) : connectionStatus !== 'loading' ? (
                <span className="text-xs text-text-muted">No data</span>
              ) : null}
            </div>
          </>
        )}
      </OverlayPanel>
    </div>
  );
}
