export function SimpleLineChart({ data, valueKey, color = '#ffb86b', height = 140, formatValue }) {
  if (!data || data.length < 2) {
    return (
      <div
        style={{
          height,
          display: 'flex',
          alignItems: 'center',
          color: 'var(--text-dim)',
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
        }}
      >
        Not enough data yet (needs 2+ points).
      </div>
    );
  }

  const width = 100;
  const values = data.map((d) => d[valueKey]).filter((v) => v !== null && v !== undefined);
  if (values.length < 2) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
        Not enough data yet.
      </div>
    );
  }

  let minVal = Math.min(...values);
  let maxVal = Math.max(...values);
  const padding = (maxVal - minVal) * 0.1 || Math.abs(maxVal) * 0.05 || 1;
  minVal -= padding;
  maxVal += padding;
  const range = maxVal - minVal || 1;

  const points = data
    .map((d, i) => {
      const v = d[valueKey];
      if (v === null || v === undefined) return null;
      const x = (i / (data.length - 1)) * width;
      const y = height - ((v - minVal) / range) * height;
      return `${x},${y}`;
    })
    .filter(Boolean)
    .join(' ');

  const areaPoints = `0,${height} ${points} ${width},${height}`;
  const gradientId = `chart-fill-${valueKey}`;

  const lastValue = values[values.length - 1];

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ width: '100%', height, display: 'block' }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.2" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((frac) => (
          <line key={frac} x1="0" y1={height * frac} x2={width} y2={height * frac} stroke="#262b36" strokeWidth="0.5" strokeDasharray="2,2" />
        ))}
        <polygon points={areaPoints} fill={`url(#${gradientId})`} />
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth="1"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
        Latest: <span style={{ color }}>{formatValue ? formatValue(lastValue) : lastValue}</span>
      </div>
    </div>
  );
}
