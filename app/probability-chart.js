import { DateAxisLabels } from './date-axis-labels';

export function ProbabilityChart({ data, height = 160 }) {
  const validData = (data || []).filter(
    (d) => d.buy_prob !== null && d.hold_prob !== null && d.sell_prob !== null
  );

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
        Not enough probability data yet.
      </div>
    );
  }

  const width = 100;

  function buildLine(key) {
    return validData
      .map((d, i) => {
        const x = (i / (validData.length - 1)) * width;
        const y = height - d[key] * height;
        return x + ',' + y;
      })
      .join(' ');
  }

  const buyLine = buildLine('buy_prob');
  const holdLine = buildLine('hold_prob');
  const sellLine = buildLine('sell_prob');

  const last = validData[validData.length - 1];

  return (
    <div>
      <svg viewBox={'0 0 ' + width + ' ' + height} preserveAspectRatio="none" style={{ width: '100%', height, display: 'block' }}>
        {[0.25, 0.5, 0.75].map((frac) => (
          <line key={frac} x1="0" y1={height * frac} x2={width} y2={height * frac} stroke="#262b36" strokeWidth="0.5" strokeDasharray="2,2" />
        ))}
        <polyline points={holdLine} fill="none" stroke="#8a8f98" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <polyline points={sellLine} fill="none" stroke="#ff6b6b" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <polyline points={buyLine} fill="none" stroke="#6bcb77" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      </svg>
      <DateAxisLabels data={validData} />
      <div style={{ display: 'flex', gap: 16, marginTop: 8, fontFamily: 'var(--font-mono)', fontSize: 11 }}>
        <span style={{ color: '#6bcb77' }}>BUY {(last.buy_prob * 100).toFixed(1)}%</span>
        <span style={{ color: '#8a8f98' }}>HOLD {(last.hold_prob * 100).toFixed(1)}%</span>
        <span style={{ color: '#ff6b6b' }}>SELL {(last.sell_prob * 100).toFixed(1)}%</span>
      </div>
    </div>
  );
}
