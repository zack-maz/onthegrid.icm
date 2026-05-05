import { useMemo } from 'react';

import { tokenize } from '@/lib/queryParser';
import { getTagColor, isValidPrefix } from '@/lib/tagRegistry';

interface SyntaxOverlayProps {
  query: string;
  className?: string;
}

/**
 * Colored text overlay that mirrors the input for tag syntax highlighting.
 * Renders behind a transparent input element.
 * Uses Pattern 2: transparent input on top, colored overlay behind.
 */
export function SyntaxOverlay({ query, className = '' }: SyntaxOverlayProps) {
  const segments = useMemo(() => {
    if (!query) return [];

    const tokens = tokenize(query);
    const result: { text: string; className: string; key: number }[] = [];
    let lastEnd = 0;

    for (const token of tokens) {
      // Fill gap between tokens (whitespace)
      if (token.start > lastEnd) {
        result.push({
          text: query.slice(lastEnd, token.start),
          className: '',
          key: lastEnd,
        });
      }

      if (token.type === 'TAG') {
        const prefix = token.prefix ?? '';
        const valid = isValidPrefix(prefix);
        const colorClass = valid ? getTagColor(prefix) : 'text-red-400';

        // Render prefix:value as a single colored span
        result.push({
          text: token.value,
          className: colorClass,
          key: token.start,
        });
      } else if (token.type === 'OR') {
        result.push({
          text: token.value,
          className: 'text-text-muted italic',
          key: token.start,
        });
      } else if (token.type === 'LPAREN' || token.type === 'RPAREN') {
        result.push({
          text: token.value,
          className: 'text-text-muted',
          key: token.start,
        });
      } else {
        // TEXT tokens: check if it looks like an invalid tag (has colon but no value)
        const hasColon = token.value.includes(':');
        result.push({
          text: token.value,
          className: hasColon ? 'text-red-400' : 'text-text-primary',
          key: token.start,
        });
      }

      lastEnd = token.end;
    }

    // Trailing whitespace
    if (lastEnd < query.length) {
      result.push({
        text: query.slice(lastEnd),
        className: '',
        key: lastEnd,
      });
    }

    return result;
  }, [query]);

  return (
    <div
      className={`pointer-events-none select-none whitespace-pre ${className}`}
      aria-hidden="true"
    >
      {segments.map((seg) => (
        <span key={seg.key} className={seg.className}>
          {seg.text}
        </span>
      ))}
    </div>
  );
}
