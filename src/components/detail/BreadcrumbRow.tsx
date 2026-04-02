import type { PanelView } from '@/types/ui';

interface BreadcrumbRowProps {
  stack: PanelView[];
  onBack: () => void;
}

/**
 * Thin, horizontally scrollable row showing previous navigation stack entries.
 * Appears between header and content when stack has entries.
 * - Left arrow button goes back one step
 * - Last (most recent) segment is clickable (same as back)
 * - Deeper segments are display-only
 */
export function BreadcrumbRow({ stack, onBack }: BreadcrumbRowProps) {
  if (stack.length === 0) return null;

  return (
    <div
      data-testid="breadcrumb-row"
      className="animate-breadcrumb-enter flex items-center gap-1 border-b border-border px-3 py-1.5 overflow-x-auto whitespace-nowrap"
    >
      {/* Back arrow button */}
      <button
        data-testid="breadcrumb-back"
        onClick={onBack}
        className="shrink-0 text-text-muted hover:text-text-primary transition-colors text-sm leading-none"
        aria-label="Go back"
      >
        {'\u2190'}
      </button>

      {stack.map((entry, i) => {
        const isLast = i === stack.length - 1;

        return (
          <span key={`${entry.entityId ?? 'cluster'}-${i}`} className="flex items-center gap-1">
            {/* Chevron separator */}
            <span className="text-text-muted text-[10px] select-none">&gt;</span>

            {isLast ? (
              /* Last segment: clickable (same as back) */
              <button
                onClick={onBack}
                className="text-[10px] text-text-muted hover:text-text-primary transition-colors truncate max-w-[120px]"
                title={entry.breadcrumbLabel}
              >
                {entry.breadcrumbLabel}
              </button>
            ) : (
              /* Deeper segments: display-only */
              <span
                className="text-[10px] text-text-muted truncate max-w-[120px]"
                title={entry.breadcrumbLabel}
              >
                {entry.breadcrumbLabel}
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}
