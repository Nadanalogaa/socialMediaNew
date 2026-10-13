/**
 * Chart primitives.
 *
 * Inline SVG rather than a charting library: these are two simple forms, and a
 * library would add more to the bundle than the whole feature is worth.
 *
 * Both carry a hover layer, because an on-screen chart that cannot be
 * interrogated forces every value onto the canvas as a label.
 */

import { useId, useState, type ReactNode } from 'react';

/** The validated single hue; magnitude is the job, so one hue, not many. */
const SERIES = '#2a78d6';
const GRID = '#e8e8e5';
const AXIS_TEXT = '#52514e';

export function StatTile({
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: 'neutral' | 'good' | 'bad';
}) {
  const valueColor =
    tone === 'good' ? 'text-emerald-700' : tone === 'bad' ? 'text-red-700' : 'text-slate-900';

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${valueColor}`}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export interface SeriesPoint {
  label: string;
  value: number;
}

/**
 * Line chart for a single series over time.
 *
 * One series means no legend is needed — the title names it — and no second
 * axis is ever introduced, which is the most common way these go wrong.
 */
export function LineChart({
  title,
  data,
  formatValue = (n: number) => String(n),
  height = 180,
}: {
  title: string;
  data: SeriesPoint[];
  formatValue?: (value: number) => string;
  height?: number;
}) {
  const gradientId = useId();
  const [hover, setHover] = useState<number | null>(null);

  if (data.length === 0) {
    return <EmptyChart title={title} />;
  }

  const width = 600;
  const padding = { top: 12, right: 12, bottom: 24, left: 40 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  const max = Math.max(...data.map((d) => d.value), 1);
  const stepX = data.length > 1 ? plotWidth / (data.length - 1) : 0;

  const pointAt = (index: number) => ({
    x: padding.left + index * stepX,
    y: padding.top + plotHeight - (data[index]!.value / max) * plotHeight,
  });

  const linePath = data
    .map((_, index) => {
      const { x, y } = pointAt(index);
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  const areaPath =
    `${linePath} L${(padding.left + (data.length - 1) * stepX).toFixed(1)},` +
    `${padding.top + plotHeight} L${padding.left},${padding.top + plotHeight} Z`;

  // Four gridlines is enough to read against without competing with the data.
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((fraction) => ({
    value: Math.round(max * fraction),
    y: padding.top + plotHeight - fraction * plotHeight,
  }));

  const active = hover !== null ? data[hover] : null;

  return (
    <figure className="rounded-xl border border-slate-200 bg-white p-4">
      <figcaption className="mb-2 text-sm font-medium text-slate-900">{title}</figcaption>
      <div className="relative">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full"
          role="img"
          aria-label={title}
          onMouseLeave={() => setHover(null)}
          onMouseMove={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            const relativeX = ((event.clientX - rect.left) / rect.width) * width;
            const index = Math.round((relativeX - padding.left) / (stepX || 1));
            setHover(Math.min(Math.max(index, 0), data.length - 1));
          }}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={SERIES} stopOpacity="0.18" />
              <stop offset="100%" stopColor={SERIES} stopOpacity="0" />
            </linearGradient>
          </defs>

          {ticks.map((tick) => (
            <g key={tick.y}>
              <line
                x1={padding.left}
                x2={width - padding.right}
                y1={tick.y}
                y2={tick.y}
                stroke={GRID}
                strokeWidth="1"
              />
              <text x={padding.left - 6} y={tick.y + 3} textAnchor="end" fontSize="9" fill={AXIS_TEXT}>
                {formatValue(tick.value)}
              </text>
            </g>
          ))}

          <path d={areaPath} fill={`url(#${gradientId})`} />
          <path d={linePath} fill="none" stroke={SERIES} strokeWidth="2" strokeLinejoin="round" />

          {hover !== null && (
            <g>
              <line
                x1={pointAt(hover).x}
                x2={pointAt(hover).x}
                y1={padding.top}
                y2={padding.top + plotHeight}
                stroke={AXIS_TEXT}
                strokeWidth="1"
                strokeDasharray="3 3"
              />
              {/* A surface ring keeps the marker readable over the area fill. */}
              <circle
                cx={pointAt(hover).x}
                cy={pointAt(hover).y}
                r="4.5"
                fill={SERIES}
                stroke="#ffffff"
                strokeWidth="2"
              />
            </g>
          )}

          <text x={padding.left} y={height - 6} fontSize="9" fill={AXIS_TEXT}>
            {data[0]!.label}
          </text>
          <text x={width - padding.right} y={height - 6} fontSize="9" fill={AXIS_TEXT} textAnchor="end">
            {data[data.length - 1]!.label}
          </text>
        </svg>

        {active && (
          <div className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 rounded-lg bg-slate-900 px-2 py-1 text-xs text-white shadow">
            <span className="font-medium">{formatValue(active.value)}</span>
            <span className="ml-1.5 opacity-75">{active.label}</span>
          </div>
        )}
      </div>
    </figure>
  );
}

/**
 * Horizontal bars for comparing magnitude across a handful of named things.
 *
 * Horizontal because channel names are long, and a single hue because the job
 * is magnitude, not identity.
 */
export function BarChart({
  title,
  data,
  formatValue = (n: number) => String(n),
}: {
  title: string;
  data: SeriesPoint[];
  formatValue?: (value: number) => string;
}) {
  if (data.length === 0) return <EmptyChart title={title} />;

  const max = Math.max(...data.map((d) => d.value), 1);

  return (
    <figure className="rounded-xl border border-slate-200 bg-white p-4">
      <figcaption className="mb-3 text-sm font-medium text-slate-900">{title}</figcaption>
      <ul className="space-y-2.5">
        {data.map((point) => (
          <li key={point.label}>
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <span className="truncate text-xs text-slate-700">{point.label}</span>
              {/* Direct-labelled, so no hover is required to read a value. */}
              <span className="shrink-0 text-xs font-medium tabular-nums text-slate-900">
                {formatValue(point.value)}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.max((point.value / max) * 100, point.value > 0 ? 3 : 0)}%`,
                  background: SERIES,
                }}
              />
            </div>
          </li>
        ))}
      </ul>
    </figure>
  );
}

function EmptyChart({ title }: { title: string }) {
  return (
    <figure className="rounded-xl border border-slate-200 bg-white p-4">
      <figcaption className="mb-2 text-sm font-medium text-slate-900">{title}</figcaption>
      <p className="py-8 text-center text-sm text-slate-500">
        Nothing to show yet. Publish a post and figures appear here.
      </p>
    </figure>
  );
}

export function ChartGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-4 lg:grid-cols-2">{children}</div>;
}
