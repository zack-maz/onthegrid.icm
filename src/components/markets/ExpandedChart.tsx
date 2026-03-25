import type { MarketQuote } from '@/types/entities';

interface ExpandedChartProps {
  quote: MarketQuote;
}

const CHART_WIDTH = 280;
const CHART_HEIGHT = 120;
const MARGIN_LEFT = 40;
const MARGIN_BOTTOM = 20;
const PLOT_WIDTH = CHART_WIDTH - MARGIN_LEFT;
const PLOT_HEIGHT = CHART_HEIGHT - MARGIN_BOTTOM;

const priceFmt = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function getTimeLabel(timestamp: number, count: number): string {
  const d = new Date(timestamp);
  // If many data points (intraday), show time; otherwise show day name
  if (count > 10) {
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function ExpandedChart({ quote }: ExpandedChartProps) {
  const { closes, timestamps, highs, lows } = quote.history;

  if (closes.length < 2) {
    return (
      <div className="flex h-20 items-center justify-center text-xs text-text-muted">
        Not enough data
      </div>
    );
  }

  const lastClose = closes[closes.length - 1];
  const color = lastClose >= quote.previousClose ? '#22c55e' : '#ef4444';

  // Compute Y range from closes (and highs/lows if available)
  const allValues = [...closes];
  if (highs.length === closes.length) allValues.push(...highs);
  if (lows.length === closes.length) allValues.push(...lows);

  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const range = max - min || 1;

  const scaleX = (i: number) => MARGIN_LEFT + (i / (closes.length - 1)) * PLOT_WIDTH;
  const scaleY = (v: number) => PLOT_HEIGHT - ((v - min) / range) * PLOT_HEIGHT;

  // Line path
  const linePath = closes
    .map((c, i) => `${i === 0 ? 'M' : 'L'}${scaleX(i).toFixed(1)},${scaleY(c).toFixed(1)}`)
    .join(' ');

  // Area path (line + close to bottom)
  const areaPath =
    linePath +
    ` L${scaleX(closes.length - 1).toFixed(1)},${PLOT_HEIGHT}` +
    ` L${MARGIN_LEFT},${PLOT_HEIGHT} Z`;

  // High/low band
  const showBand = highs.length === closes.length && lows.length === closes.length;
  let bandPath = '';
  if (showBand) {
    const topPoints = highs.map((h, i) => `${i === 0 ? 'M' : 'L'}${scaleX(i).toFixed(1)},${scaleY(h).toFixed(1)}`).join(' ');
    const bottomPoints = lows.map((_l, i) => `${scaleX(lows.length - 1 - i).toFixed(1)},${scaleY(lows[lows.length - 1 - i]).toFixed(1)}`).map((p, i) => `${i === 0 ? 'L' : 'L'}${p}`).join(' ');
    bandPath = topPoints + ' ' + bottomPoints + ' Z';
  }

  // Y-axis labels (4 ticks)
  const yTicks = Array.from({ length: 4 }, (_, i) => min + (range * i) / 3);

  // X-axis labels: pick up to 5 evenly spaced day labels
  const xLabelCount = Math.min(5, timestamps.length);
  const xLabels: { label: string; x: number }[] = [];
  for (let i = 0; i < xLabelCount; i++) {
    const idx = Math.round((i / (xLabelCount - 1)) * (timestamps.length - 1));
    xLabels.push({
      label: getTimeLabel(timestamps[idx], timestamps.length),
      x: scaleX(idx),
    });
  }

  return (
    <div className="overflow-hidden transition-[max-height] duration-300 ease-in-out" style={{ maxHeight: 160 }}>
      <svg
        width={CHART_WIDTH}
        height={CHART_HEIGHT}
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        className="mt-1"
      >
        {/* High/low band */}
        {showBand && (
          <path d={bandPath} fill={color} opacity={0.06} />
        )}

        {/* Shaded area under line */}
        <path d={areaPath} fill={color} opacity={0.12} />

        {/* Line */}
        <path d={linePath} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />

        {/* Y-axis labels */}
        {yTicks.map((tick) => (
          <text
            key={tick}
            x={MARGIN_LEFT - 4}
            y={scaleY(tick) + 3}
            textAnchor="end"
            className="fill-text-muted"
            fontSize={9}
          >
            ${priceFmt.format(tick)}
          </text>
        ))}

        {/* X-axis labels */}
        {xLabels.map(({ label, x }) => (
          <text
            key={`${label}-${x}`}
            x={x}
            y={CHART_HEIGHT - 4}
            textAnchor="middle"
            className="fill-text-muted"
            fontSize={9}
          >
            {label}
          </text>
        ))}
      </svg>
    </div>
  );
}
