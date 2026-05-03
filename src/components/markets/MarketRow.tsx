import { useEffect, useRef, useState } from 'react';

import { ExpandedChart } from '@/components/markets/ExpandedChart';
import { Sparkline } from '@/components/markets/Sparkline';
import type { MarketQuote } from '@/types/entities';

interface MarketRowProps {
  quote: MarketQuote;
  showPercent: boolean;
  isExpanded: boolean;
  onToggle: () => void;
}

const priceFmt = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function MarketRow({ quote, showPercent, isExpanded, onToggle }: MarketRowProps) {
  const prevRef = useRef<number>(quote.price);
  const [delta, setDelta] = useState<number | null>(null);
  const [deltaKey, setDeltaKey] = useState(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (prevRef.current !== quote.price) {
      const diff = quote.price - prevRef.current;
      setDelta(diff);
      setDeltaKey((k) => k + 1);
      prevRef.current = quote.price;

      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        setDelta(null);
        timeoutRef.current = null;
      }, 3000);
    }

    return () => {
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [quote.price]);

  // Delta display value (from quote.change/changePercent, not the animation delta)
  const changeValue = showPercent ? quote.changePercent : quote.change;
  const changeText = showPercent
    ? `${changeValue >= 0 ? '+' : ''}${priceFmt.format(changeValue)}%`
    : `${changeValue >= 0 ? '+' : ''}$${priceFmt.format(Math.abs(changeValue))}`;
  const changeColor = quote.change >= 0 ? 'text-accent-green' : 'text-accent-red';

  return (
    <div>
      <div
        onClick={onToggle}
        className="flex items-center gap-2 cursor-pointer py-0.5 hover:bg-white/5 rounded transition-colors"
      >
        {/* Ticker label */}
        <span className="text-xs font-semibold text-text-primary w-12 shrink-0">
          {quote.displayName}
        </span>

        {/* Price */}
        <span className="text-xs tabular-nums text-text-primary">
          ${priceFmt.format(quote.price)}
        </span>

        {/* Delta / change */}
        <div className="flex items-center gap-1 min-w-[52px]">
          {quote.marketOpen ? (
            <>
              <span className={`text-[10px] tabular-nums ${changeColor}`}>{changeText}</span>
              {delta !== null && (
                <span
                  key={deltaKey}
                  className="text-accent-green text-[10px] tabular-nums animate-delta"
                >
                  {delta > 0 ? '+' : ''}
                  {priceFmt.format(Math.abs(delta))}
                </span>
              )}
            </>
          ) : (
            <span className="text-[10px] text-text-muted uppercase">closed</span>
          )}
        </div>

        {/* Sparkline */}
        <Sparkline closes={quote.history.closes} previousClose={quote.previousClose} />
      </div>

      {/* Expanded chart (accordion) */}
      <div
        className="overflow-hidden transition-[max-height] duration-300 ease-in-out"
        style={{ maxHeight: isExpanded ? 160 : 0 }}
      >
        {isExpanded && <ExpandedChart quote={quote} />}
      </div>
    </div>
  );
}
