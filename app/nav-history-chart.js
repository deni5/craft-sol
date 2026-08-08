import { DateAxisLabels } from './date-axis-labels';

const POOL_COLORS = {
  swing_conservative: '#ffb86b',
  swing_standard: '#6bcb77',
  swing_sensitive: '#6b9fff',
  hodl_conservative: '#ff6b6b',
  hodl_standard: '#c77dff',
  hodl_sensitive: '#7dd3fc',
};

const POOL_LABELS = {
  swing_conservative: 'swing/conservative',
  swing_standard: 'swing/standard',
  swing_sensitive: 'swing/sensitive',
  hodl_conservative: 'hodl/conservative',
  hodl_standard: 'hodl/standard',
  hodl_sensitive: 'hodl/sensitive',
};

function buildPath(series, minVal, maxVal, width, height) {
  if (!series || series.length < 2) return null;

  const range = maxVal - minVal || 1;
  const points = series.map((point, i) => {
    const x = (i / (series.length - 1)) * width;
    const y = height - ((point.portfolio - minVal) / range) * height;
    return `${x},${y}`;
  });
  return points.join(' ');
}

export function NavHistoryChart({ groupedData, height = 220 }) {
  const keys = Object.keys(groupedData || {}).filter((k) => groupedData[k]?.length >= 2);

  if (keys.length === 0) {
    return (
      <div style={{
          height,
          display: 'flex',
          alignItems: 'center',
          color: 'var(--text-dim)',
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
        }}
      >
        Not enough portfolio history yet across sub-pools (needs 2+ data points per pool).
      </div>
    );
  }

  const width = 100;

  let minVal = Infinity;
  let maxVal = -Infinity;
  for (const key of keys) {
    for (const point of groupedData[key]) {
      if (point.portfolio < minVal) minVal = point.portfolio;
      if (point.portfolio > maxVal) maxVal = point.portfolio;
    }
  }
  const padding = (maxVal - minVal) * 0.05 || 1;
  minVal -= padding;
  maxVal += padding;

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        style={{ width: '100%', height, display: 'block' }}
      >
        {[0.25, 0.5, 0.75].map((frac) => (
          <line key={frac}
            x1="0"
            y1={height * frac}
            x2={width}
            y2={height * frac}
            stroke="#262b36"
            strokeWidth="0.5"
            strokeDasharray="2,2"
          />
        ))}

        {keys.map((key) => {
          const path = buildPath(groupedData[key], minVal, maxVal, width, height);
          if (!path) return null;
          return (
            <polyline key={key}
              points={path}
              fill="none"
              stroke={POOL_COLORS[key] || '#8a8f98'}
              strokeWidth="1"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          );
        })}
      </svg>

      <DateAxisLabels data={keys.reduce((longest, key) => {
          const series = groupedData[key];
          return series.length > longest.length ? series : longest;
        }, [])}
      />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 12 }}>
        {keys.map((key) => (
          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{
                display: 'inline-block',
                width: 10,
                height: 2,
                background: POOL_COLORS[key] || '#8a8f98',
              }}
            />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>
              {POOL_LABELS[key] || key}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
