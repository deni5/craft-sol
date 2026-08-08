export function RsiChart({ data, height = 140 }) {
  const validData = (data || []).filter((d) => d.rsi !== null && d.rsi !== undefined);

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
        Not enough RSI data yet.
      </div>
    );
  }

  const width = 100;
  const minVal = 0;
  const maxVal = 100;
  const range = maxVal - minVal;

  const points = validData
    .map((d, i) => {
      const x = (i / (validData.length - 1)) * width;
      const y = height - ((d.rsi - minVal) / range) * height;
      return x + ',' + y;
    })
    .join(' ');

  const overboughtY = height - ((70 - minVal) / range) * height;
  const oversoldY = height - ((30 - minVal) / range) * height;

  const lastRsi = validData[validData.length - 1].rsi;

  return (
    <div>
      <svg viewBox={'0 0 ' + width + ' ' + height} preserveAspectRatio="none" style={{ width: '100%', height, display: 'block' }}>
        <rect x="0" y="0" width={width} height={overboughtY} fill="#ff6b6b" opacity="0.06" />
        <rect x="0" y={oversoldY} width={width} height={height - oversoldY} fill="#6bcb77" opacity="0.06" />
        <line x1="0" y1={overboughtY} x2={width} y2={overboughtY} stroke="#ff6b6b" strokeWidth="0.5" strokeDasharray="2,2" opacity="0.5" />
        <line x1="0" y1={oversoldY} x2={width} y2={oversoldY} stroke="#6bcb77" strokeWidth="0.5" strokeDasharray="2,2" opacity="0.5" />
        <polyline points={points}
          fill="none"
          stroke="#ffb86b"
          strokeWidth="1"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
        Latest RSI: <span style={{ color: '#ffb86b' }}>{lastRsi.toFixed(1)}</span>
        {' '}(overbought above 70, oversold below 30)
      </div>
    </div>
  );
}
