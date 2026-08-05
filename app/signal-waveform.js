/**
 * Візуалізує історію target_position (0..1) у вигляді "сигнальної
 * хвилі" — те саме, що бачить осцилограф. Це не декоративний
 * елемент: продукт буквально керує позицією через неперервний
 * сигнал (TWAP, compute_delta_order), тому waveform — пряме
 * відображення того, як насправді працює модель.
 */
export function SignalWaveform({ data, height = 120 }) {
  if (!data || data.length < 2) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
        Недостатньо даних для waveform (потрібно накопичити історію сигналів)
      </div>
    );
  }

  const width = 100; // viewBox — відсоткові координати, масштабується CSS
  const values = data.map((d) => d.buy_prob ?? 0.5);

  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = height - v * height; // інвертовано: 1.0 -> верх, 0.0 -> низ
      return `${x},${y}`;
    })
    .join(' ');

  // Заповнена область під кривою — підсилює "сигнальний" ефект
  const areaPoints = `0,${height} ${points} ${width},${height}`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      style={{ width: '100%', height, display: 'block' }}
    >
      <defs>
        <linearGradient id="waveform-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffb86b" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#ffb86b" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Референсна лінія на 0.5 (нейтральна позиція) */}
      <line
        x1="0" y1={height / 2} x2={width} y2={height / 2}
        stroke="#262b36" strokeWidth="0.5" strokeDasharray="2,2"
      />

      <polygon points={areaPoints} fill="url(#waveform-fill)" />
      <polyline
        points={points}
        fill="none"
        stroke="#ffb86b"
        strokeWidth="1.2"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
