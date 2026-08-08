import { DateAxisLabels } from './date-axis-labels';

export function PriceWithSignalsChart({ data, height = 180 }) {
  const validData = (data || []).filter((d) => d.price !== null && d.price !== undefined);

  if (validData.length < 2) {
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
        Not enough price data yet.
      </div>
    );
  }

  const width = 100;
  const prices = validData.map((d) => d.price);
  let minVal = Math.min(...prices);
  let maxVal = Math.max(...prices);
  const padding = (maxVal - minVal) * 0.1 || 1;
  minVal -= padding;
  maxVal += padding;
  const range = maxVal - minVal || 1;

  const points = validData
    .map((d, i) => {
      const x = (i / (validData.length - 1)) * width;
      const y = height - ((d.price - minVal) / range) * height;
      return x + ',' + y;
    })
    .join(' ');

  const markers = validData
    .map((d, i) => {
      if (d.signal !== 'BUY' && d.signal !== 'SELL') return null;
      const x = (i / (validData.length - 1)) * width;
      const y = height - ((d.price - minVal) / range) * height;
      const color = d.signal === 'BUY' ? '#6bcb77' : '#ff6b6b';
      return { x, y, color, signal: d.signal };
    })
    .filter(Boolean);

  return (
    <div>
      <svg viewBox={'0 0 ' + width + ' ' + height} preserveAspectRatio="none" style={{ width: '100%', height, display: 'block' }}>
        {[0.25, 0.5, 0.75].map((frac) => (
          <line key={frac} x1="0" y1={height * frac} x2={width} y2={height * frac} stroke="#262b36" strokeWidth="0.5" strokeDasharray="2,2" />
        ))}
        <polyline points={points}
          fill="none"
          stroke="#8a8f98"
          strokeWidth="0.8"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        {markers.map((m, i) => (
          <circle key={i} cx={m.x} cy={m.y} r="1.5" fill={m.color} vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      <DateAxisLabels data={validData} />
      <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#6bcb77' }} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>BUY</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#ff6b6b' }} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>SELL</span>
        </div>
      </div>
    </div>
  );
}
